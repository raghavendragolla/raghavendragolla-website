import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { classifyAiError, ACTIVE_MODEL, MAX_INPUT_LENGTH, MAX_OUTPUT_TOKENS, MAX_PAYLOAD_BYTES, extractAssistantReply, isAllowedOrigin, isOriginAllowedForChat } from '../src/index.js';
import { CANDIDATE_PROFILE, buildSystemPrompt } from '../src/knowledge.js';
import { AiBudget, estimateRequestNeurons, actualNeuronsFromResponse, resolveDailyBudget, DEFAULT_DAILY_NEURON_BUDGET } from '../src/budget.js';

describe('Cloudflare AI Worker Backend Tests', () => {

  describe('Knowledge Base & System Prompt Verification', () => {
    test('CANDIDATE_PROFILE has exact mandatory title and no forbidden Student wording in title', () => {
      assert.equal(CANDIDATE_PROFILE.title, 'Data Analyst | Data Science & Machine Learning');
      assert.ok(!CANDIDATE_PROFILE.title.toLowerCase().includes('student'), 'Title must not contain the word Student');
    });

    test('CANDIDATE_PROFILE has the owner-approved BSc in Mathematics degree and no score', () => {
      const bsc = CANDIDATE_PROFILE.education.find(e => e.degree.includes('Bachelor'));
      assert.ok(bsc, 'BSc degree must exist');
      assert.equal(bsc.degree, 'Bachelor of Science (BSc) in Mathematics');
      assert.equal(bsc.institution, 'Krishna University, Andhra Pradesh, India');
      assert.equal(bsc.duration, '2017 – 2020');
      assert.equal(bsc.score, undefined, 'no undergraduate score is stated (owner decision, 2026-11-22)');
      const text = JSON.stringify(bsc);
      for (const banned of ['Physics', 'Chemistry', 'PCM', '68']) assert.ok(!text.includes(banned), `${banned} must not describe the BSc`);
    });

    test('CANDIDATE_PROFILE accurately describes ongoing MSc Data Science', () => {
      const msc = CANDIDATE_PROFILE.education.find(e => e.degree.includes('Master'));
      assert.ok(msc, 'MSc degree must exist');
      assert.equal(msc.institution, 'Chandigarh University, India');
      assert.equal(msc.duration, '2025 – Expected June 2027');
      assert.ok(msc.status.includes('In Progress'), 'MSc must be marked in progress');
    });

    test('CANDIDATE_PROFILE does not contain unverified technologies like LIME', () => {
      const allSkills = Object.values(CANDIDATE_PROFILE.technicalSkills).flat();
      assert.ok(!allSkills.includes('LIME'), 'LIME should not be present in skills list');
      assert.ok(allSkills.some(s => s.includes('SHAP')), 'SHAP should be present');
    });

    test('buildSystemPrompt includes mandatory guardrails, title, and anti-injection instructions', () => {
      const prompt = buildSystemPrompt();
      assert.ok(prompt.includes('Data Analyst | Data Science & Machine Learning'));
      assert.ok(prompt.includes('NEVER use the word "Student"'));
      assert.ok(prompt.includes('Bachelor of Science (BSc) in Mathematics'));
      for (const banned of ['Physics, Chemistry', '(PCM)', '68%']) assert.ok(!prompt.includes(banned), `prompt must not contain ${banned}`);
      assert.ok(prompt.includes('Prompt Injection & Security Defense'));
      assert.ok(prompt.includes('raghavendrayadavgolla@gmail.com'));
    });
  });

  describe('Response Extraction (extractAssistantReply)', () => {
    test('extracts text from choices[0].message.content (OpenAI standard format)', () => {
      const response = {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Raghavendra specializes in Data Science, Machine Learning, and SQL analytics.'
            },
            finish_reason: 'stop'
          }
        ]
      };
      const result = extractAssistantReply(response);
      assert.equal(result, 'Raghavendra specializes in Data Science, Machine Learning, and SQL analytics.');
    });

    test('extracts text from choices[0].text format', () => {
      const response = {
        choices: [
          { text: 'Raghavendra holds a BSc in Mathematics.' }
        ]
      };
      const result = extractAssistantReply(response);
      assert.equal(result, 'Raghavendra holds a BSc in Mathematics.');
    });

    test('extracts text from legacy response or text property', () => {
      assert.equal(
        extractAssistantReply({ response: 'Legacy Cloudflare response format.' }),
        'Legacy Cloudflare response format.'
      );
      assert.equal(
        extractAssistantReply({ text: 'Legacy Cloudflare text format.' }),
        'Legacy Cloudflare text format.'
      );
    });

    test('extracts text from primitive string input', () => {
      assert.equal(extractAssistantReply('Direct string response.'), 'Direct string response.');
    });

    test('never extracts reasoning_content or reasoning when content is empty', () => {
      const liveIssueResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              reasoning_content: 'User is asking about education. Raghavendra has a BSc in Mathematics and an MSc in Data Science in progress.'
            },
            finish_reason: 'length'
          }
        ]
      };
      const result = extractAssistantReply(liveIssueResponse);
      assert.equal(result, null, 'Must return null and never extract reasoning_content');

      const reasoningOnly = {
        choices: [
          {
            message: {
              role: 'assistant',
              reasoning: 'Alternative reasoning field that should never be returned.'
            }
          }
        ]
      };
      assert.equal(extractAssistantReply(reasoningOnly), null);
    });

    test('ignores reasoning_content and extracts ONLY content when both are present', () => {
      const mixedResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Raghavendra is based in Andhra Pradesh, India.',
              reasoning_content: 'Internal reasoning that must not be exposed.'
            }
          }
        ]
      };
      const result = extractAssistantReply(mixedResponse);
      assert.equal(result, 'Raghavendra is based in Andhra Pradesh, India.');
      assert.ok(!result.includes('Internal reasoning'), 'Result must not contain reasoning content');
    });

    test('returns null for invalid, empty, or whitespace-only inputs', () => {
      assert.equal(extractAssistantReply(null), null);
      assert.equal(extractAssistantReply(undefined), null);
      assert.equal(extractAssistantReply(12345), null);
      assert.equal(extractAssistantReply({}), null);
      assert.equal(extractAssistantReply('   '), null);
      assert.equal(extractAssistantReply({ choices: [] }), null);
      assert.equal(extractAssistantReply({ choices: [{ message: { content: '   ' } }] }), null);
      assert.equal(extractAssistantReply({ choices: [{ message: {} }] }), null);
      assert.equal(extractAssistantReply({ response: '   ' }), null);
      assert.equal(extractAssistantReply({ text: '' }), null);
    });
  });

  describe('HTTP Endpoints & Validation', () => {
    test('GET /health returns 200 with service metadata and configured Gemma 4 model', async () => {
      const req = new Request('https://worker.local/health', {
        method: 'GET',
        headers: { 'Origin': 'https://www.raghavendragolla.com' }
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.service, 'raghavendragolla-ai-bot');
      assert.equal(data.model, '@cf/google/gemma-4-26b-a4b-it');
      assert.equal(data.model, ACTIVE_MODEL);
      assert.equal(data.limits.maxInputLength, MAX_INPUT_LENGTH);
      assert.equal(data.limits.maxOutputTokens, MAX_OUTPUT_TOKENS);
      assert.equal(data.limits.maxPayloadBytes, MAX_PAYLOAD_BYTES);
    });

    test('OPTIONS /chat returns 204 with CORS preflight headers', async () => {
      const req = new Request('https://worker.local/chat', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://www.raghavendragolla.com',
          'Access-Control-Request-Method': 'POST'
        }
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://www.raghavendragolla.com');
      assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
    });

    test('OPTIONS /chat allows local development server origins (including Live Server on 5500)', async () => {
      const req = new Request('https://worker.local/chat', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://127.0.0.1:5500',
          'Access-Control-Request-Method': 'POST'
        }
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5500');
    });

    test('isAllowedOrigin correctly validates production and local development origins', () => {
      // Production origins
      assert.equal(isAllowedOrigin('https://www.raghavendragolla.com'), true);
      assert.equal(isAllowedOrigin('https://raghavendragolla.com'), true);
      assert.equal(isAllowedOrigin('https://raghavendragolla.github.io'), true);

      // Local development loopback origins
      assert.equal(isAllowedOrigin('http://127.0.0.1:5500'), true, 'Live Server 127.0.0.1:5500 must be allowed');
      assert.equal(isAllowedOrigin('http://localhost:5500'), true, 'Live Server localhost:5500 must be allowed');
      assert.equal(isAllowedOrigin('http://localhost:8080'), true, 'test-server must be allowed');
      assert.equal(isAllowedOrigin('http://127.0.0.1:8080'), true);
      assert.equal(isAllowedOrigin('http://localhost:3000'), true);
      assert.equal(isAllowedOrigin('http://localhost:5173'), true);
      assert.equal(isAllowedOrigin('http://localhost'), true);
      assert.equal(isAllowedOrigin('http://127.0.0.1'), true);

      // Unauthorized origins
      assert.equal(isAllowedOrigin('https://evil-phishing.com'), false);
      assert.equal(isAllowedOrigin('http://localhost.evil.com'), false);
      assert.equal(isAllowedOrigin('http://127.0.0.1.attacker.com'), false);
      assert.equal(isAllowedOrigin(null), false);
      assert.equal(isAllowedOrigin(''), false);
      assert.equal(isAllowedOrigin(undefined), false);
    });

    test('POST /chat rejects requests with invalid Content-Type', async () => {
      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Origin': 'https://www.raghavendragolla.com' },
        body: 'Hello world'
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 400);

      const data = await res.json();
      assert.ok(data.error.includes('Invalid Content-Type'));
    });

    test('POST /chat rejects malformed JSON', async () => {
      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: '{"invalid": json'
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 400);

      const data = await res.json();
      assert.equal(data.error, 'Malformed JSON payload.');
    });

    test('POST /chat rejects missing or empty message', async () => {
      // Missing message field
      const req1 = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ other: 'value' })
      });
      const res1 = await worker.fetch(req1, {}, {});
      assert.equal(res1.status, 400);
      const data1 = await res1.json();
      assert.ok(data1.error.includes('Missing required field: "message"'));

      // Empty whitespace message
      const req2 = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: '   ' })
      });
      const res2 = await worker.fetch(req2, {}, {});
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.equal(data2.error, 'Message cannot be empty.');
    });

    test('POST /chat rejects oversized message (>400 chars)', async () => {
      const oversizedMessage = 'a'.repeat(MAX_INPUT_LENGTH + 1);
      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: oversizedMessage })
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 400);

      const data = await res.json();
      assert.ok(data.error.includes(`exceeds maximum allowed length of ${MAX_INPUT_LENGTH}`));
    });

    test('POST /chat rejects oversized request payload (>10KB)', async () => {
      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.raghavendragolla.com',
          'Content-Length': String(MAX_PAYLOAD_BYTES + 500)
        },
        body: JSON.stringify({ message: 'hello' })
      });

      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 413);

      const data = await res.json();
      assert.ok(data.error.includes('Payload too large'));
    });

    test('POST /chat returns 503 when Workers AI binding is missing', async () => {
      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'What is your background?' })
      });

      // env without AI binding
      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 503);

      const data = await res.json();
      assert.ok(data.error.includes('Workers AI binding is not configured'));
    });

    test('POST /chat successfully executes env.AI.run with active Gemma 4 model and returns response', async () => {
      let capturedModel = null;
      let capturedOptions = null;

      const mockEnv = {
        AI: {
          run: async (model, options) => {
            capturedModel = model;
            capturedOptions = options;
            return { response: 'Raghavendra is a Data Analyst specializing in Data Science and Machine Learning.' };
          }
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.raghavendragolla.com'
        },
        body: JSON.stringify({
          message: 'What is Raghavendra\'s educational background?',
          history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }]
        })
      })

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.reply, 'Raghavendra is a Data Analyst specializing in Data Science and Machine Learning.');
      assert.equal(data.response, 'Raghavendra is a Data Analyst specializing in Data Science and Machine Learning.');
      assert.equal(data.model, '@cf/google/gemma-4-26b-a4b-it');

      // Verify AI call parameters
      assert.equal(capturedModel, '@cf/google/gemma-4-26b-a4b-it');
      assert.equal(capturedOptions.stream, false);
      assert.equal(capturedOptions.max_tokens, MAX_OUTPUT_TOKENS);
      assert.equal(capturedOptions.max_tokens, 512);
      assert.deepEqual(capturedOptions.chat_template_kwargs, {
        enable_thinking: false,
        clear_thinking: true
      });
      assert.ok(Array.isArray(capturedOptions.messages));
      assert.equal(capturedOptions.messages[0].role, 'system');
      assert.ok(capturedOptions.messages[0].content.includes('Data Analyst | Data Science & Machine Learning'));
      assert.ok(capturedOptions.messages[0].content.includes('Bachelor of Science (BSc) in Mathematics'));
      assert.equal(capturedOptions.messages[capturedOptions.messages.length - 1].content, 'What is Raghavendra\'s educational background?');
    });

    test('POST /chat parses OpenAI-compatible choices[0].message.content format and sets both reply and response', async () => {
      const mockEnv = {
        AI: {
          run: async () => ({
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Raghavendra completed his Bachelor of Science in Mathematics.'
                },
                finish_reason: 'stop'
              }
            ]
          })
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.raghavendragolla.com'
        },
        body: JSON.stringify({ message: 'Tell me about his degree' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.reply, 'Raghavendra completed his Bachelor of Science in Mathematics.');
      assert.equal(data.response, 'Raghavendra completed his Bachelor of Science in Mathematics.');
      assert.equal(data.model, '@cf/google/gemma-4-26b-a4b-it');
      assert.equal(data.usage.maxTokens, 512);
    });

    test('POST /chat handles response containing reasoning_content and empty content without leaking reasoning (returns 502 with fallback)', async () => {
      const mockEnv = {
        AI: {
          run: async () => ({
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '',
                  reasoning_content: 'User asked about projects. Career Radar is an ML project with SHAP explainability...'
                },
                finish_reason: 'length'
              }
            ]
          })
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'What projects has he done?' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 502);

      const data = await res.json();
      assert.equal(data.error, 'AI service returned an empty response.');
      assert.ok(data.fallbackReply, 'Must include fallbackReply');
      assert.ok(typeof data.fallbackReply === 'string' && data.fallbackReply.length > 0);

      // Verify no reasoning leakage anywhere in serialized JSON
      const serialized = JSON.stringify(data);
      assert.ok(!serialized.includes('reasoning_content'), 'Must not expose reasoning_content field');
      assert.ok(!serialized.includes('Career Radar is an ML project'), 'Must not leak reasoning text');
      assert.equal(data.reply, undefined);
      assert.equal(data.response, undefined);
    });

    test('POST /chat extracts only content when both content and reasoning_content are present and never leaks reasoning', async () => {
      const mockEnv = {
        AI: {
          run: async () => ({
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Raghavendra built Career Radar using Random Forest and LightGBM.',
                  reasoning_content: 'Secret thinking tokens that should never be shown to the user.'
                },
                finish_reason: 'stop'
              }
            ]
          })
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'Tell me about Career Radar' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.reply, 'Raghavendra built Career Radar using Random Forest and LightGBM.');
      assert.equal(data.response, 'Raghavendra built Career Radar using Random Forest and LightGBM.');

      const serialized = JSON.stringify(data);
      assert.ok(!serialized.includes('Secret thinking tokens'), 'Must not leak reasoning tokens in output');
      assert.ok(!serialized.includes('reasoning_content'), 'Must not leak reasoning_content key in output');
    });

    test('POST /chat returns 502 with safe fallback when AI returns empty text', async () => {
      const mockEnv = {
        AI: {
          run: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '   '
                }
              }
            ]
          })
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'Hello' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 502);

      const data = await res.json();
      assert.equal(data.error, 'AI service returned an empty response.');
      assert.ok(data.fallbackReply);
    });

    test('POST /chat does not leak internal error message details when env.AI.run throws', async () => {
      const mockEnv = {
        AI: {
          run: async () => {
            throw new Error('Fatal internal V8 stack trace at /opt/workers/runtime.cc:123');
          }
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'Trigger internal error' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 500);

      const data = await res.json();
      assert.equal(data.error, 'AI service temporarily unavailable.');
      assert.ok(data.fallbackReply);
      assert.ok(!JSON.stringify(data).includes('Fatal internal V8 stack trace'), 'Must not leak internal error stack');
    });

    test('POST /chat handles AI allocation limit or quota error gracefully (429 with fallback text)', async () => {
      const mockEnv = {
        AI: {
          run: async () => {
            throw new Error("AiError: 3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.");
          }
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'What are your skills?' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 429);

      const data = await res.json();
      assert.ok(data.error.includes('allocation limit reached'));
      assert.ok(data.fallbackReply.includes('raghavendrayadavgolla@gmail.com'));
      assert.ok(data.fallbackReply.includes('free daily Cloudflare allocation limit'));
    });

    test('POST /chat enforces distributed edge rate limiter when env.RATE_LIMITER is configured', async () => {
      const mockEnv = {
        RATE_LIMITER: {
          limit: async () => ({ success: false })
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.raghavendragolla.com',
          'CF-Connecting-IP': '203.0.113.195'
        },
        body: JSON.stringify({ message: 'Rate limit test' })
      });

      const res = await worker.fetch(req, mockEnv, {});
      assert.equal(res.status, 429);

      const data = await res.json();
      assert.ok(data.error.includes('Rate limit exceeded'));
    });

    test('Unknown route returns 404 Not Found', async () => {
      const req = new Request('https://worker.local/unknown', { method: 'GET' });
      const res = await worker.fetch(req, {}, {});
      assert.equal(res.status, 404);

      const data = await res.json();
      assert.ok(data.error.includes('Route not found'));
    });
  });

  describe('Phase 1: Server-side Origin allow-list for POST /chat', () => {
    function chatRequest(headers) {
      return new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ message: 'Hello' })
      });
    }

    function countingAiEnv(extra = {}) {
      const env = {
        calls: 0,
        AI: { run: async () => { env.calls++; return { response: 'ok' }; } },
        ...extra
      };
      return env;
    }

    test('rejects a request with no Origin header with 403 before any AI call', async () => {
      const env = countingAiEnv();
      const res = await worker.fetch(chatRequest({}), env, {});
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error_code, 'ORIGIN_NOT_ALLOWED');
      assert.equal(env.calls, 0, 'Workers AI must not be invoked');
    });

    test('rejects a foreign Origin with 403 before any AI call', async () => {
      const env = countingAiEnv();
      const res = await worker.fetch(chatRequest({ Origin: 'https://evil.example' }), env, {});
      assert.equal(res.status, 403);
      assert.equal(env.calls, 0);
    });

    test('rejected origins do not consume the per-IP rate limit', async () => {
      let limiterCalls = 0;
      const env = countingAiEnv({ RATE_LIMITER: { limit: async () => { limiterCalls++; return { success: true }; } } });
      await worker.fetch(chatRequest({ Origin: 'https://evil.example', 'CF-Connecting-IP': '198.51.100.7' }), env, {});
      assert.equal(limiterCalls, 0);
    });

    test('accepts each production website origin', async () => {
      for (const origin of ['https://www.raghavendragolla.com', 'https://raghavendragolla.com']) {
        const env = countingAiEnv();
        const res = await worker.fetch(chatRequest({ Origin: origin }), env, {});
        assert.equal(res.status, 200, origin);
        assert.equal(env.calls, 1, origin);
      }
    });

    test('loopback origins are rejected unless ALLOW_DEV_ORIGINS="true" is set', async () => {
      const prod = countingAiEnv();
      const res1 = await worker.fetch(chatRequest({ Origin: 'http://localhost:8080' }), prod, {});
      assert.equal(res1.status, 403);
      assert.equal(prod.calls, 0);

      const dev = countingAiEnv({ ALLOW_DEV_ORIGINS: 'true' });
      const res2 = await worker.fetch(chatRequest({ Origin: 'http://localhost:8080' }), dev, {});
      assert.equal(res2.status, 200);
      assert.equal(dev.calls, 1);
    });

    test('isOriginAllowedForChat rejects look-alike and malformed origins', () => {
      assert.equal(isOriginAllowedForChat('https://www.raghavendragolla.com.evil.com', {}), false);
      assert.equal(isOriginAllowedForChat('http://www.raghavendragolla.com', {}), false, 'http (not https) must be rejected');
      assert.equal(isOriginAllowedForChat('null', {}), false);
      assert.equal(isOriginAllowedForChat('', {}), false);
      assert.equal(isOriginAllowedForChat(undefined, {}), false);
      assert.equal(isOriginAllowedForChat('http://localhost.evil.com', { ALLOW_DEV_ORIGINS: 'true' }), false);
    });

    test('rate-limit and AI error responses carry a stable error_code', async () => {
      const limited = await worker.fetch(
        chatRequest({ Origin: 'https://www.raghavendragolla.com' }),
        { AI: { run: async () => ({ response: 'x' }) }, RATE_LIMITER: { limit: async () => ({ success: false }) } },
        {}
      );
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).error_code, 'RATE_LIMITED');

      const quota = await worker.fetch(
        chatRequest({ Origin: 'https://www.raghavendragolla.com' }),
        { AI: { run: async () => { throw new Error("AiError: 3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage."); } } },
        {}
      );
      assert.equal(quota.status, 429);
      const quotaData = await quota.json();
      assert.equal(quotaData.error_code, 'AI_QUOTA_EXCEEDED');
      assert.ok(quotaData.fallbackReply.length > 0);
    });
  });

  describe('Phase 1: Knowledge base stays in sync with the portfolio page', () => {
    const portfolioHtml = readFileSync(new URL('../../portfolio/index.html', import.meta.url), 'utf8');
    const decode = (s) => s
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&rsquo;/g, '\'')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const pageProjectTitles = [...portfolioHtml.matchAll(/<h3[^>]*class="[^"]*\bproject-title\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/g)]
      .map(m => decode(m[1].replace(/<[^>]+>/g, '')));

    test('portfolio page exposes project headings for this check (guards the extractor itself)', () => {
      assert.ok(pageProjectTitles.length >= 4, `Expected at least 4 project headings, found ${pageProjectTitles.length}`);
    });

    test('every portfolio project appears in CANDIDATE_PROFILE.projects (by portfolioTitle)', () => {
      const known = new Set(CANDIDATE_PROFILE.projects.map(p => p.portfolioTitle));
      const missing = pageProjectTitles.filter(t => !known.has(t));
      assert.deepEqual(missing, [], `Projects on the portfolio page missing from knowledge.js: ${missing.join(' | ')}`);
    });

    test('knowledge.js lists no project that is not on the portfolio page', () => {
      const onPage = new Set(pageProjectTitles);
      const extra = CANDIDATE_PROFILE.projects.map(p => p.portfolioTitle).filter(t => !onPage.has(t));
      assert.deepEqual(extra, [], `Projects in knowledge.js not found on the portfolio page: ${extra.join(' | ')}`);
    });

    test('every project GitHub repository and live demo linked in the Projects section is in the system prompt', () => {
      const start = portfolioHtml.indexOf('id="projects"');
      const end = portfolioHtml.indexOf('id="research"');
      assert.ok(start > 0 && end > start, 'Projects section boundaries not found');
      const section = portfolioHtml.slice(start, end);
      const links = new Set(
        [...section.matchAll(/href="(https:\/\/(?:github\.com\/raghavendragolla\/[^"#?]+|[a-z0-9-]+\.streamlit\.app)[^"]*)"/g)]
          .map(m => m[1].replace(/\/$/, ''))
      );
      assert.ok(links.size >= 4, `Expected project links, found ${links.size}`);
      const prompt = buildSystemPrompt();
      const missing = [...links].filter(l => !prompt.includes(l));
      assert.deepEqual(missing, [], `Project links missing from the system prompt: ${missing.join(', ')}`);
    });

    test('system prompt includes the resume PDF and both certificate verification links shown on the page', () => {
      const prompt = buildSystemPrompt();
      assert.ok(portfolioHtml.includes('resume/resume.pdf'), 'portfolio page links the resume');
      assert.ok(prompt.includes('https://www.raghavendragolla.com/portfolio/resume/resume.pdf'));
      for (const cert of CANDIDATE_PROFILE.certifications) {
        assert.ok(portfolioHtml.includes(cert.verification), `verification link not on page: ${cert.verification}`);
        assert.ok(prompt.includes(cert.verification));
      }
    });

    test('Handwritten Digit Recognition facts match the portfolio page', () => {
      const digit = CANDIDATE_PROFILE.projects.find(p => p.portfolioTitle === 'Handwritten Digit Recognition');
      assert.ok(digit, 'Digit Recognition project present');
      assert.ok(portfolioHtml.includes('9,964') && digit.highlights.includes('9,964'));
      assert.ok(portfolioHtml.includes('99.64%') && digit.highlights.includes('99.64%'));
    });
  });

  describe('Phase 1: Daily AI budget (Durable Object circuit breaker)', () => {
    // In-memory stand-in for the SQLite store (same get/add/prune contract as SqlUsageStore).
    class MemoryStore {
      constructor() { this.rows = new Map(); }
      get(day) { return this.rows.get(day) || { neurons: 0, requests: 0 }; }
      add(day, neurons, requests) {
        const r = this.get(day);
        this.rows.set(day, { neurons: Math.max(0, r.neurons + neurons), requests: r.requests + requests });
      }
      prune(oldest) { for (const d of [...this.rows.keys()]) if (d < oldest) this.rows.delete(d); }
    }

    function budgetEnv({ cap = '8000', aiResponse = { response: 'Hello!' }, now = () => Date.parse('2026-11-20T10:00:00Z'), failBudget = false } = {}) {
      const store = new MemoryStore();
      const budget = new AiBudget(null, {}, store, now);
      const env = {
        aiCalls: 0,
        store,
        AI_DAILY_NEURON_BUDGET: cap,
        AI: { run: async () => { env.aiCalls++; return aiResponse; } },
        AI_BUDGET: {
          idFromName: (name) => `id:${name}`,
          get: () => ({
            fetch: async (url, init) => {
              if (failBudget) throw new Error('Durable Object unavailable');
              return budget.fetch(new Request(url, init));
            }
          })
        }
      };
      return env;
    }

    function chat(message = 'What projects has he built?') {
      return new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message })
      });
    }

    function waitUntilCollector() {
      const pending = [];
      return { ctx: { waitUntil: (p) => pending.push(p) }, flush: () => Promise.all(pending) };
    }

    test('the conservative estimate is above the real measured cost of a typical request', () => {
      const messages = [{ role: 'system', content: buildSystemPrompt() }, { role: 'user', content: 'What projects has he built?' }];
      const estimate = estimateRequestNeurons(messages, MAX_OUTPUT_TOKENS);
      // Real cost with the current prompt: ~2,715 input tokens and a long 250-token answer.
      const realistic = actualNeuronsFromResponse({ usage: { prompt_tokens: 2800, completion_tokens: 250 } });
      assert.ok(estimate > realistic, `estimate ${estimate} should exceed realistic ${realistic}`);
      assert.ok(estimate < 80, `estimate ${estimate} should stay reasonable`);
    });

    test('allows requests under the cap, then settles the reservation to the reported actual usage', async () => {
      const env = budgetEnv({ aiResponse: { response: 'Hi', usage: { prompt_tokens: 2700, completion_tokens: 100 } } });
      const { ctx, flush } = waitUntilCollector();
      const res = await worker.fetch(chat(), env, ctx);
      assert.equal(res.status, 200);
      assert.equal(env.aiCalls, 1);
      await flush();
      const expected = actualNeuronsFromResponse({ usage: { prompt_tokens: 2700, completion_tokens: 100 } });
      const row = env.store.get('2026-11-20');
      assert.equal(row.requests, 1);
      assert.ok(Math.abs(row.neurons - expected) < 1e-9, `recorded ${row.neurons}, expected ${expected}`);
    });

    test('keeps the conservative estimate charged when the model reports no usage', async () => {
      const env = budgetEnv({ aiResponse: { response: 'Hi' } });
      const { ctx, flush } = waitUntilCollector();
      await worker.fetch(chat(), env, ctx);
      await flush();
      const row = env.store.get('2026-11-20');
      // Phase 3: the prompt is now retrieval-sized, so the estimate is smaller than with the old
      // full prompt (the former "> 30" threshold assumed that size). The conservative estimate
      // always includes the full output-token allowance, so it must stay above that amount.
      const outputAllowance = (MAX_OUTPUT_TOKENS * 27273) / 1e6;
      assert.ok(row.neurons > outputAllowance, `estimate should remain charged, got ${row.neurons}`);
    });

    test('refuses with DAILY_BUDGET_REACHED and never calls the model once the cap would be exceeded', async () => {
      const env = budgetEnv({ cap: '100' });
      env.store.add('2026-11-20', 90, 3);
      const res = await worker.fetch(chat(), env, {});
      assert.equal(res.status, 429);
      const data = await res.json();
      assert.equal(data.error_code, 'DAILY_BUDGET_REACHED');
      assert.ok(data.fallbackReply.includes('daily limit'));
      assert.equal(env.aiCalls, 0, 'Workers AI must not be invoked');
      assert.equal(env.store.get('2026-11-20').requests, 3, 'a refused request reserves nothing');
    });

    test('stops admitting requests exactly at the cap under a burst', async () => {
      const env = budgetEnv({ cap: '200', aiResponse: { response: 'Hi' } }); // no usage -> estimates stay charged
      const statuses = [];
      for (let i = 0; i < 10; i++) statuses.push((await worker.fetch(chat(), env, {})).status);
      const allowed = statuses.filter(s => s === 200).length;
      assert.ok(allowed >= 1 && allowed < 10, `some allowed, some refused: ${statuses.join(',')}`);
      assert.ok(env.store.get('2026-11-20').neurons <= 200, 'recorded usage never exceeds the cap');
      assert.equal(env.aiCalls, allowed);
    });

    test('fails CLOSED when the budget counter is unavailable (no inference, friendly 503)', async () => {
      const env = budgetEnv({ failBudget: true });
      const res = await worker.fetch(chat(), env, {});
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.error_code, 'BUDGET_UNAVAILABLE');
      assert.ok(data.fallbackReply.length > 0);
      assert.equal(env.aiCalls, 0);
    });

    test('a new UTC day starts from zero (yesterday stays counted on its own row)', async () => {
      let nowMs = Date.parse('2026-11-20T23:59:30Z');
      const env = budgetEnv({ cap: '100', now: () => nowMs });
      env.store.add('2026-11-20', 95, 5);
      assert.equal((await worker.fetch(chat(), env, {})).status, 429);
      nowMs = Date.parse('2026-11-21T00:00:05Z');
      assert.equal((await worker.fetch(chat(), env, {})).status, 200);
      assert.equal(env.store.get('2026-11-20').neurons, 95);
      assert.ok(env.store.get('2026-11-21').neurons > 0);
    });

    test('old daily rows are pruned after the retention window', async () => {
      const env = budgetEnv();
      env.store.add('2026-11-01', 500, 10);
      await worker.fetch(chat(), env, {});
      assert.equal(env.store.rows.has('2026-11-01'), false);
    });

    test('invalid AI_DAILY_NEURON_BUDGET values fall back to the 8,000-neuron default', () => {
      assert.equal(resolveDailyBudget({ AI_DAILY_NEURON_BUDGET: '8000' }), 8000);
      assert.equal(resolveDailyBudget({ AI_DAILY_NEURON_BUDGET: '5000' }), 5000);
      for (const bad of [undefined, '', 'abc', '0', '-5']) {
        assert.equal(resolveDailyBudget({ AI_DAILY_NEURON_BUDGET: bad }), DEFAULT_DAILY_NEURON_BUDGET, String(bad));
      }
    });

    test('the budget object rejects malformed internal calls', async () => {
      const budget = new AiBudget(null, {}, new MemoryStore(), () => Date.now());
      const bad = await budget.fetch(new Request('https://ai-budget/reserve', { method: 'POST', body: JSON.stringify({ estimate: -1, cap: 10 }) }));
      assert.equal(bad.status, 400);
      const unknown = await budget.fetch(new Request('https://ai-budget/other', { method: 'POST', body: '{}' }));
      assert.equal(unknown.status, 404);
    });

    test('rejected origins and rate-limited requests never touch the budget', async () => {
      const env = budgetEnv();
      let budgetCalls = 0;
      const realGet = env.AI_BUDGET.get;
      env.AI_BUDGET.get = (id) => { budgetCalls++; return realGet(id); };
      await worker.fetch(new Request('https://worker.local/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ message: 'x' })
      }), env, {});
      env.RATE_LIMITER = { limit: async () => ({ success: false }) };
      await worker.fetch(chat(), env, {});
      assert.equal(budgetCalls, 0);
    });

    test('wrangler.toml declares the SQLite Durable Object binding and the daily cap', () => {
      const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
      assert.match(toml, /\[\[durable_objects\.bindings\]\]\s*\nname = "AI_BUDGET"\s*\nclass_name = "AiBudget"/);
      assert.match(toml, /new_sqlite_classes = \["AiBudget"\]/);
      assert.match(toml, /AI_DAILY_NEURON_BUDGET = "8000"/);
      assert.doesNotMatch(toml, /new_classes\s*=/, 'key-value Durable Objects are not available on Workers Free');
    });
  });

  describe('Phase 1 cleanup: explicit Workers AI error classification', () => {
    const DAILY = "AiError: 3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.";

    async function chatWithAiError(error) {
      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.raghavendragolla.com' },
        body: JSON.stringify({ message: 'Hello' })
      });
      const res = await worker.fetch(req, { AI: { run: async () => { throw error; } } }, {});
      return { status: res.status, data: await res.json() };
    }

    test('documented 3036 daily-allocation errors map to AI_QUOTA_EXCEEDED (429)', async () => {
      for (const err of [new Error(DAILY), new Error('3036: Account limited'), Object.assign(new Error('Account limited'), { code: 3036 })]) {
        const { status, data } = await chatWithAiError(err);
        assert.equal(status, 429, err.message);
        assert.equal(data.error_code, 'AI_QUOTA_EXCEEDED', err.message);
      }
    });

    test('3040 out-of-capacity maps to retryable AI_BUSY (503), never the daily-quota message', async () => {
      for (const err of [new Error('AiError: 3040: Capacity temporarily exceeded, please try again.'), Object.assign(new Error('busy'), { code: 3040 })]) {
        const { status, data } = await chatWithAiError(err);
        assert.equal(status, 503);
        assert.equal(data.error_code, 'AI_BUSY');
      }
    });

    test('unrelated errors containing words like limit/exceeded/429 are NOT treated as the daily quota', async () => {
      const unrelated = [
        'Rate limit exceeded for upstream',
        'Input exceeds context length limit',
        'Request is too large',
        'HTTP 429 from internal subrequest',
        'quota of subrequests exceeded',
        'Request timeout',
        'Code 30360 unrelated'
      ];
      for (const msg of unrelated) {
        const { status, data } = await chatWithAiError(new Error(msg));
        assert.equal(data.error_code, 'AI_UNAVAILABLE', msg);
        assert.equal(status, 500, msg);
      }
    });

    test('classifyAiError handles non-Error throwables', () => {
      assert.equal(classifyAiError('3036: Account limited'), 'DAILY_ALLOCATION');
      assert.equal(classifyAiError(null), 'OTHER');
      assert.equal(classifyAiError({ code: '3040' }), 'CAPACITY');
    });
  });

});
