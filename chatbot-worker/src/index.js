/**
 * Cloudflare AI Worker Backend for Raghavendra Golla Portfolio Chatbot
 * -----------------------------------------------------------------------------
 * Edge-accelerated, serverless inference via Cloudflare Workers AI.
 * Operating model: @cf/google/gemma-4-26b-a4b-it (Mixture-of-Experts, 4B active)
 *
 * Endpoints:
 *   GET  /health - Health check, model status, and runtime boundaries
 *   POST /chat   - Streaming / JSON inference against verified knowledge base
 *   OPTIONS *    - CORS preflight handling
 */

import { buildGroundedPrompt } from './knowledge.js';
import { estimateRequestNeurons, actualNeuronsFromResponse, reserveBudget, settleBudget } from './budget.js';

// Durable Object class for the daily AI budget must be exported from the Worker's main module.
export { AiBudget } from './budget.js';

// Visitor-facing fallback messages (plain text; rendered with textContent by the website).
const AI_QUOTA_REPLY = "Raghavendra's AI assistant has reached its free daily Cloudflare allocation limit. Please feel free to explore his projects and verified resume directly on the website, or reach out to him directly at raghavendrayadavgolla@gmail.com.";
const AI_UNAVAILABLE_REPLY = "I am temporarily experiencing edge connectivity delays. You can explore Raghavendra's verified resume, projects, and research directly on the website, or contact him at raghavendrayadavgolla@gmail.com.";
const BUDGET_REACHED_REPLY = "Ask GORA has reached its daily limit and will be back after 05:30 IST (00:00 UTC). Meanwhile, you can explore Raghavendra's projects, research and resume on this website, or contact him directly at raghavendrayadavgolla@gmail.com.";

// Model selection: Google Gemma 4 26B (4B active parameters MoE)
// Supported on Cloudflare Workers AI free daily neuron allocation (10,000 neurons/day).
export const ACTIVE_MODEL = '@cf/google/gemma-4-26b-a4b-it';

// Strict input constraints to protect free neuron allocation and prevent abuse.
// Context strategy: the visitor's message + at most MAX_HISTORY_TURNS earlier messages
// (3 question/answer pairs), newest first, within MAX_HISTORY_CHARS in total; long earlier
// answers are trimmed to MAX_HISTORY_ASSISTANT_CHARS. Knowledge is retrieved per question
// (knowledge.js), so the prompt stays small instead of growing with the conversation.
export const MAX_INPUT_LENGTH = 400;
export const MAX_OUTPUT_TOKENS = 512;
export const MAX_HISTORY_TURNS = 6;
export const MAX_HISTORY_CHARS = 2400;
export const MAX_HISTORY_ASSISTANT_CHARS = 700;
export const MAX_HISTORY_ITEMS = 20; // larger arrays are rejected as malformed
export const MAX_PAYLOAD_BYTES = 10240; // 10 KB maximum raw request body size (enforced on the bytes actually read)

// Allowed production browser origins for Cross-Origin Resource Sharing (CORS)
export const ALLOWED_ORIGINS = new Set([
  'https://www.raghavendragolla.com',
  'https://raghavendragolla.com',
  'https://raghavendragolla.github.io'
]);

/**
 * Validates whether an incoming Origin header is permitted.
 * Permits verified production domains and any local development loopback server
 * (e.g. VS Code Live Server on port 5500, test-server on port 8080, Vite on 5173, etc.).
 */
export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return isLoopbackOrigin(origin);
}

function isLoopbackOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/**
 * Server-side Origin allow-list for POST /chat (inference requests).
 * ---------------------------------------------------------------------------
 * Browsers always send an Origin header on these cross-origin POSTs, and page
 * scripts cannot change it, so this rejects other websites and casual direct
 * calls (curl, scanners) BEFORE any rate-limit or AI work is done.
 *
 * LIMITATION: a non-browser client can forge any Origin header. This is a
 * cheap filter, not authentication; the per-IP rate limiter stays the
 * primary abuse control.
 *
 * Only the production website origins are accepted. Loopback origins
 * (http://localhost:*, http://127.0.0.1:*) are accepted only when the Worker
 * is started with ALLOW_DEV_ORIGINS="true" (e.g. in .dev.vars for wrangler dev),
 * never in the deployed configuration.
 */
export function isOriginAllowedForChat(origin, env) {
  if (!origin || typeof origin !== 'string') return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return Boolean(env && env.ALLOW_DEV_ORIGINS === 'true' && isLoopbackOrigin(origin));
}

/**
 * Ephemeral In-Memory Rate Limiter (Per-Isolate Defense)
 * ---------------------------------------------------------------------------
 * LIMITATION NOTE: In-memory state in Cloudflare Workers is isolated per V8
 * worker instance and per edge data center (PoP). It resets when isolates cycle
 * and is NOT a globally synchronized rate limiter.
 *
 * This provides lightweight protection against rapid single-client hammering
 * on a single connection. For true globally synchronized edge DDoS protection,
 * a Cloudflare Dashboard Rate Limiting Rule is recommended (documented in README).
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;     // Max 10 requests per minute per IP

function isRateLimited(clientIp) {
  if (!clientIp) return false;

  const now = Date.now();
  const record = rateLimitMap.get(clientIp);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { count: 1, startTime: now });
    // Clean up stale entries periodically if map grows
    if (rateLimitMap.size > 1000) {
      for (const [ip, data] of rateLimitMap.entries()) {
        if (now - data.startTime > RATE_LIMIT_WINDOW_MS) {
          rateLimitMap.delete(ip);
        }
      }
    }
    return false;
  }

  record.count += 1;
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Builds standard CORS headers based on the incoming request Origin.
 * NOTE: CORS is an in-browser access restriction, not authentication.
 */
export function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = isAllowedOrigin(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://www.raghavendragolla.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

/**
 * Helper to build JSON responses with appropriate headers and status.
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

/**
 * Classifies a Workers AI error using its documented internal codes
 * (https://developers.cloudflare.com/workers-ai/platform/errors/):
 *   3036 "Account limited"  -> daily free allocation of neurons used up  -> 'DAILY_ALLOCATION'
 *   3040 "Out of capacity"  -> temporary capacity rejection (retryable)  -> 'CAPACITY'
 *   anything else                                                        -> 'OTHER'
 * The platform does not document the thrown error's shape for env.AI.run(), so the code is
 * read from a numeric `code` property or from the message, and the daily-allocation case also
 * matches its documented wording. Generic words such as "limit" or "exceeded" are deliberately
 * NOT matched: they previously caused unrelated errors to be shown as "resting for today".
 */
export function classifyAiError(err) {
  const message = err instanceof Error ? err.message : String(err || '');
  const code = err && typeof err === 'object' && Number.isFinite(Number(err.code)) ? Number(err.code) : null;
  if (code === 3036 || /(^|\D)3036(\D|$)/.test(message) || /daily free allocation/i.test(message)) {
    return 'DAILY_ALLOCATION';
  }
  if (code === 3040 || /(^|\D)3040(\D|$)/.test(message) || /capacity temporarily exceeded/i.test(message)) {
    return 'CAPACITY';
  }
  return 'OTHER';
}

/**
 * Validates and sanitizes multi-turn conversation history.
 */
export function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  // Keep the most recent messages, newest first, within the message and character budgets.
  const kept = [];
  let chars = 0;
  for (let i = rawHistory.length - 1; i >= 0 && kept.length < MAX_HISTORY_TURNS; i--) {
    const turn = rawHistory[i];
    if (!turn || typeof turn !== 'object' || typeof turn.content !== 'string') continue;
    const role = turn.role === 'assistant' ? 'assistant' : (turn.role === 'user' ? 'user' : null);
    if (!role) continue;
    const limit = role === 'assistant' ? MAX_HISTORY_ASSISTANT_CHARS : MAX_INPUT_LENGTH;
    const content = turn.content.trim().slice(0, limit);
    if (!content) continue;
    if (chars + content.length > MAX_HISTORY_CHARS) break;
    chars += content.length;
    kept.unshift({ role, content });
  }
  // The chat template expects the conversation to start with a user turn.
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}

/**
 * Reads the request body, refusing anything larger than maxBytes as it streams in
 * (the Content-Length header is optional and can be omitted, so it is not trusted alone).
 * Returns the body text, or null when the limit is exceeded.
 */
export async function readBodyCapped(request, maxBytes) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(buffer);
}

/** Visible text in one streamed Workers AI event (legacy `response` or OpenAI-style delta). Reasoning is never returned. */
export function extractStreamDelta(event) {
  if (!event || typeof event !== 'object') return '';
  if (typeof event.response === 'string') return event.response;
  const choice = Array.isArray(event.choices) ? event.choices[0] : null;
  if (choice && choice.delta && typeof choice.delta.content === 'string') return choice.delta.content;
  return '';
}

function sseEvent(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * Passes a Workers AI server-sent-event stream through to the visitor unchanged, while
 *  - remembering the final `usage` report (to settle the daily budget with the real cost),
 *  - appending an explicit error event if the model produced no visible text or the
 *    upstream stream failed (the HTTP status is already 200 by then),
 *  - cancelling upstream generation when the visitor stops or disconnects.
 * Work per event is one JSON.parse, well within the Free plan's 10 ms CPU per request.
 */
export function accountedStream(aiStream, onEnd) {
  const reader = aiStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = '';
  let sawText = false;
  let usageEvent = null;
  let finished = false;
  // Workers AI attaches a per-chunk `usage` delta to every event (the first carries the prompt
  // tokens, later ones one completion token each) and sends the request's total as the last
  // usage event before [DONE] (verified live, 2026-11-22). So the real cost is known only when
  // the stream completes: a stopped or failed stream reports no usage, which keeps the
  // conservative reservation charged (over-counts, never under-counts).
  const finalUsage = () => {
    if (!usageEvent) return null;
    const promptTokens = usageEvent.usage && usageEvent.usage.prompt_tokens;
    return promptTokens === 0 ? null : usageEvent; // a per-chunk delta is not the total
  };
  const finish = (reason) => {
    if (finished) return;
    finished = true;
    try { onEnd(reason === 'done' ? finalUsage() : null, { sawText, reason }); } catch { /* accounting must never break the stream */ }
  };
  const inspect = (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let event;
    try { event = JSON.parse(payload); } catch { return; }
    if (extractStreamDelta(event)) sawText = true;
    if (event && typeof event === 'object' && event.usage) usageEvent = event;
  };
  return new ReadableStream({
    async pull(controller) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch {
        controller.enqueue(encoder.encode(sseEvent({ error_code: 'STREAM_INTERRUPTED' })));
        finish('error');
        controller.close();
        return;
      }
      if (chunk.done) {
        if (pending.trim()) inspect(pending.trim());
        if (!sawText) controller.enqueue(encoder.encode(sseEvent({ error_code: 'EMPTY_RESPONSE' })));
        finish('done');
        controller.close();
        return;
      }
      controller.enqueue(chunk.value);
      pending += typeof chunk.value === 'string' ? chunk.value : decoder.decode(chunk.value, { stream: true });
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        inspect(pending.slice(0, newline).trim());
        pending = pending.slice(newline + 1);
      }
      if (pending.length > 16384) pending = pending.slice(-16384);
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
      finish('cancelled');
    }
  });
}

/**
 * Safely extracts plain assistant text from Workers AI model responses.
 * Strictly extracts from choices[0].message.content (OpenAI standard) or legacy response/text fields.
 * Never extracts reasoning_content, reasoning, or raw JSON structures.
 * Returns null if content is empty or missing.
 */
export function extractAssistantReply(aiResponse) {
  if (!aiResponse) return null;

  // 1. Primitive string return
  if (typeof aiResponse === 'string') {
    const trimmed = aiResponse.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof aiResponse !== 'object') return null;

  let content = null;

  // 2. OpenAI-compatible format: choices[0].message.content or choices[0].text
  if (Array.isArray(aiResponse.choices) && aiResponse.choices.length > 0) {
    const firstChoice = aiResponse.choices[0];
    if (firstChoice && typeof firstChoice === 'object') {
      if (firstChoice.message && typeof firstChoice.message === 'object') {
        if (typeof firstChoice.message.content === 'string') {
          content = firstChoice.message.content;
        }
      } else if (typeof firstChoice.text === 'string') {
        content = firstChoice.text;
      }
    }
  }

  // 3. Cloudflare standard/legacy format: aiResponse.response or aiResponse.text
  if (content === null) {
    if (typeof aiResponse.response === 'string') {
      content = aiResponse.response;
    } else if (typeof aiResponse.text === 'string') {
      content = aiResponse.text;
    }
  }

  if (typeof content !== 'string') return null;

  const cleaned = content.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Handle CORS Preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 2. Health check endpoint
    if (request.method === 'GET' && (pathname === '/health' || pathname === '/')) {
      return jsonResponse({
        status: 'ok',
        service: 'raghavendragolla-ai-bot',
        model: ACTIVE_MODEL,
        limits: {
          maxInputLength: MAX_INPUT_LENGTH,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxHistoryTurns: MAX_HISTORY_TURNS,
          maxHistoryChars: MAX_HISTORY_CHARS,
          maxPayloadBytes: MAX_PAYLOAD_BYTES,
          streaming: true
        },
        timestamp: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // 3. Chat completion endpoint
    if (request.method === 'POST' && pathname === '/chat') {
      // Security Check: server-side Origin allow-list (cheap filter, not authentication; see above)
      if (!isOriginAllowedForChat(request.headers.get('Origin'), env)) {
        return jsonResponse({
          error: 'Requests are only accepted from the official website.',
          error_code: 'ORIGIN_NOT_ALLOWED'
        }, 403, corsHeaders);
      }

      // Security Check: Distributed Edge Rate Limiter (if bound) with Ephemeral In-Memory Fallback
      const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '';
      const rateLimitedBody = {
        error: 'Rate limit exceeded. Please wait a moment before sending another message.',
        error_code: 'RATE_LIMITED'
      };
      if (env && env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
        try {
          const { success } = await env.RATE_LIMITER.limit({ key: clientIp || 'global' });
          if (!success) {
            return jsonResponse(rateLimitedBody, 429, corsHeaders);
          }
        } catch {
          if (isRateLimited(clientIp)) {
            return jsonResponse(rateLimitedBody, 429, corsHeaders);
          }
        }
      } else if (isRateLimited(clientIp)) {
        return jsonResponse(rateLimitedBody, 429, corsHeaders);
      }

      // Security Check: Request Body Size Check via Content-Length header
      const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return jsonResponse({
          error: `Payload too large. Maximum request body size is ${MAX_PAYLOAD_BYTES} bytes.`
        }, 413, corsHeaders);
      }

      // Input Validation: Content-Type check
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return jsonResponse({
          error: 'Invalid Content-Type. Expected application/json.'
        }, 400, corsHeaders);
      }

      // Safe JSON parsing, with the size limit enforced on the bytes actually received
      let body;
      try {
        const raw = await readBodyCapped(request, MAX_PAYLOAD_BYTES);
        if (raw === null) {
          return jsonResponse({
            error: `Payload too large. Maximum request body size is ${MAX_PAYLOAD_BYTES} bytes.`
          }, 413, corsHeaders);
        }
        body = JSON.parse(raw);
      } catch (err) {
        return jsonResponse({
          error: 'Malformed JSON payload.'
        }, 400, corsHeaders);
      }

      // Input Validation: history must be an array of reasonable size when present
      if (body && body.history !== undefined && (!Array.isArray(body.history) || body.history.length > MAX_HISTORY_ITEMS)) {
        return jsonResponse({
          error: `Invalid "history": expected an array of at most ${MAX_HISTORY_ITEMS} messages.`
        }, 400, corsHeaders);
      }

      // Input Validation: Check message existence
      if (!body || typeof body !== 'object' || typeof body.message !== 'string') {
        return jsonResponse({
          error: 'Missing required field: "message" (must be a non-empty string).'
        }, 400, corsHeaders);
      }

      const trimmedMessage = body.message.trim();

      // Input Validation: Empty message check
      if (trimmedMessage.length === 0) {
        return jsonResponse({
          error: 'Message cannot be empty.'
        }, 400, corsHeaders);
      }

      // Input Validation: Maximum length check
      if (trimmedMessage.length > MAX_INPUT_LENGTH) {
        return jsonResponse({
          error: `Message exceeds maximum allowed length of ${MAX_INPUT_LENGTH} characters. Received ${trimmedMessage.length}.`
        }, 400, corsHeaders);
      }

      // Check Workers AI binding
      if (!env || !env.AI) {
        return jsonResponse({
          error: 'Workers AI binding is not configured or unavailable in this environment.'
        }, 503, corsHeaders);
      }

      // Build conversation context: rules + knowledge retrieved for this question and the recent turns
      const history = sanitizeHistory(body.history);
      const systemPrompt = buildGroundedPrompt(trimmedMessage, history);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: trimmedMessage }
      ];

      const wantStream = body.stream === true || (request.headers.get('Accept') || '').includes('text/event-stream');

      // Daily AI budget (circuit breaker), see budget.js. Active whenever the AI_BUDGET Durable
      // Object binding is configured (it is, in wrangler.toml). Without the binding (unit tests,
      // or an older deployment) behaviour is unchanged.
      let budgetReservation = null;
      if (env.AI_BUDGET) {
        const estimate = estimateRequestNeurons(messages, MAX_OUTPUT_TOKENS);
        try {
          const result = await reserveBudget(env, estimate);
          if (!result.allowed) {
            return jsonResponse({
              error: 'Daily AI budget reached.',
              error_code: 'DAILY_BUDGET_REACHED',
              fallbackReply: BUDGET_REACHED_REPLY
            }, 429, corsHeaders);
          }
          budgetReservation = { day: result.day, estimate };
        } catch {
          // Fail CLOSED: if usage cannot be counted, do not run inference.
          return jsonResponse({
            error: 'AI service temporarily unavailable.',
            error_code: 'BUDGET_UNAVAILABLE',
            fallbackReply: AI_UNAVAILABLE_REPLY
          }, 503, corsHeaders);
        }
      }

      // Replace the conservative reservation with the real cost when the model reports usage.
      // Runs after the response is sent where possible; failures only leave the estimate charged.
      const settle = (aiResponse) => {
        if (!budgetReservation) return;
        const actual = actualNeuronsFromResponse(aiResponse);
        if (actual === null) return;
        const pending = settleBudget(env, budgetReservation.day, budgetReservation.estimate, actual).catch(() => {});
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pending);
      };

      try {
        // Execute native Workers AI inference with selected active model
        // Note: Disabling thinking mode saves the token budget for the actual assistant reply
        const modelPayload = {
          messages,
          max_tokens: MAX_OUTPUT_TOKENS,
          chat_template_kwargs: {
            enable_thinking: false,
            clear_thinking: true
          }
        };

        if (wantStream) {
          const aiStream = await env.AI.run(ACTIVE_MODEL, {
            ...modelPayload,
            stream: true
          });
          if (!aiStream || typeof aiStream.getReader !== 'function') {
            throw new Error('AI binding did not return a stream');
          }

          // Settle the budget with the real cost reported at the end of the stream.
          const stream = accountedStream(aiStream, (usageEvent) => settle(usageEvent));

          return new Response(stream, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive'
            }
          });
        } else {
          const aiResponse = await env.AI.run(ACTIVE_MODEL, {
            ...modelPayload,
            stream: false
          });
          settle(aiResponse);

          const replyText = extractAssistantReply(aiResponse);

          // If the model produced empty text or only reasoning content, return a safe error
          if (!replyText) {
            return jsonResponse({
              error: 'AI service returned an empty response.',
              error_code: 'EMPTY_RESPONSE',
              fallbackReply: 'Something went wrong while preparing your answer. Please try again in a moment.',
              model: ACTIVE_MODEL
            }, 502, corsHeaders);
          }

          return jsonResponse({
            reply: replyText,
            response: replyText,
            model: ACTIVE_MODEL,
            usage: {
              maxTokens: MAX_OUTPUT_TOKENS
            }
          }, 200, corsHeaders);
        }
      } catch (aiErr) {
        // Never echo the raw error to the visitor; map it to an explicit error code.
        const kind = classifyAiError(aiErr);

        if (kind === 'DAILY_ALLOCATION') {
          return jsonResponse({
            error: 'Daily AI allocation limit reached.',
            error_code: 'AI_QUOTA_EXCEEDED',
            fallbackReply: AI_QUOTA_REPLY
          }, 429, corsHeaders);
        }
        if (kind === 'CAPACITY') {
          return jsonResponse({
            error: 'AI service is temporarily busy.',
            error_code: 'AI_BUSY',
            fallbackReply: AI_UNAVAILABLE_REPLY
          }, 503, corsHeaders);
        }
        return jsonResponse({
          error: 'AI service temporarily unavailable.',
          error_code: 'AI_UNAVAILABLE',
          fallbackReply: AI_UNAVAILABLE_REPLY
        }, 500, corsHeaders);
      }
    }

    // 4. Fallback for unrecognized routes
    return jsonResponse({
      error: `Route not found: ${request.method} ${pathname}`
    }, 404, corsHeaders);
  }
};
