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

import { buildSystemPrompt } from './knowledge.js';

// Model selection: Google Gemma 4 26B (4B active parameters MoE)
// Supported on Cloudflare Workers AI free daily neuron allocation (10,000 neurons/day).
export const ACTIVE_MODEL = '@cf/google/gemma-4-26b-a4b-it';

// Strict input constraints to protect free neuron allocation and prevent abuse
export const MAX_INPUT_LENGTH = 400;
export const MAX_OUTPUT_TOKENS = 512;
export const MAX_HISTORY_TURNS = 4;
export const MAX_PAYLOAD_BYTES = 10240; // 10 KB maximum raw request body size

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
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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
 * Validates and sanitizes multi-turn conversation history.
 */
function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  // Limit to the most recent turns to bound input token usage
  const recentTurns = rawHistory.slice(-MAX_HISTORY_TURNS);
  const sanitized = [];

  for (const turn of recentTurns) {
    if (!turn || typeof turn !== 'object') continue;
    const role = turn.role === 'assistant' ? 'assistant' : (turn.role === 'user' ? 'user' : null);
    if (!role) continue;

    if (typeof turn.content === 'string') {
      const trimmed = turn.content.trim().slice(0, MAX_INPUT_LENGTH);
      if (trimmed.length > 0) {
        sanitized.push({ role, content: trimmed });
      }
    }
  }

  return sanitized;
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
          maxPayloadBytes: MAX_PAYLOAD_BYTES
        },
        timestamp: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // 3. Chat completion endpoint
    if (request.method === 'POST' && pathname === '/chat') {
      // Security Check: Distributed Edge Rate Limiter (if bound) with Ephemeral In-Memory Fallback
      const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '';
      if (env && env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
        try {
          const { success } = await env.RATE_LIMITER.limit({ key: clientIp || 'global' });
          if (!success) {
            return jsonResponse({
              error: 'Rate limit exceeded. Please wait a moment before sending another message.'
            }, 429, corsHeaders);
          }
        } catch {
          if (isRateLimited(clientIp)) {
            return jsonResponse({
              error: 'Rate limit exceeded. Please wait a moment before sending another message.'
            }, 429, corsHeaders);
          }
        }
      } else if (isRateLimited(clientIp)) {
        return jsonResponse({
          error: 'Rate limit exceeded. Please wait a moment before sending another message.'
        }, 429, corsHeaders);
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

      // Safe JSON parsing
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return jsonResponse({
          error: 'Malformed JSON payload.'
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

      // Build conversation context using verified single source of truth
      const systemPrompt = buildSystemPrompt();
      const history = sanitizeHistory(body.history);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: trimmedMessage }
      ];

      const wantStream = body.stream === true || (request.headers.get('Accept') || '').includes('text/event-stream');

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

          return new Response(aiStream, {
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

          const replyText = extractAssistantReply(aiResponse);

          // If the model produced empty text or only reasoning content, return a safe error
          if (!replyText) {
            return jsonResponse({
              error: 'AI service returned an empty response.',
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
        // Safe logging: log only safe error messages, never visitor message content
        const errorMessage = aiErr instanceof Error ? aiErr.message : String(aiErr);

        // Check if error is related to quota or allocation limit
        const isQuota = /quota|limit|exceeded|capacity|429/i.test(errorMessage);

        return jsonResponse({
          error: isQuota ? 'Daily AI allocation limit reached.' : 'AI service temporarily unavailable.',
          fallbackReply: isQuota
            ? "Raghavendra's AI assistant has reached its free daily Cloudflare allocation limit. Please feel free to explore his projects and verified resume directly on the website, or reach out to him directly at raghavendrayadavgolla@gmail.com."
            : "I am temporarily experiencing edge connectivity delays. You can explore Raghavendra's verified resume, projects, and research directly on the website, or contact him at raghavendrayadavgolla@gmail.com."
        }, isQuota ? 429 : 500, corsHeaders);
      }
    }

    // 4. Fallback for unrecognized routes
    return jsonResponse({
      error: `Route not found: ${request.method} ${pathname}`
    }, 404, corsHeaders);
  }
};
