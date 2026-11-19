import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import worker, { ACTIVE_MODEL, MAX_INPUT_LENGTH, MAX_OUTPUT_TOKENS, MAX_PAYLOAD_BYTES, extractAssistantReply, isAllowedOrigin } from '../src/index.js';
import { CANDIDATE_PROFILE, buildSystemPrompt } from '../src/knowledge.js';

describe('Cloudflare AI Worker Backend Tests', () => {

  describe('Knowledge Base & System Prompt Verification', () => {
    test('CANDIDATE_PROFILE has exact mandatory title and no forbidden Student wording in title', () => {
      assert.equal(CANDIDATE_PROFILE.title, 'Data Analyst | Data Science & Machine Learning');
      assert.ok(!CANDIDATE_PROFILE.title.toLowerCase().includes('student'), 'Title must not contain the word Student');
    });

    test('CANDIDATE_PROFILE has corrected PCM undergraduate degree and 68% score', () => {
      const bsc = CANDIDATE_PROFILE.education.find(e => e.degree.includes('Bachelor'));
      assert.ok(bsc, 'BSc degree must exist');
      assert.equal(bsc.degree, 'Bachelor of Science (BSc) in Physics, Chemistry and Mathematics (PCM)');
      assert.equal(bsc.institution, 'Krishna University, Andhra Pradesh, India');
      assert.equal(bsc.duration, '2017 – 2020');
      assert.equal(bsc.score, '68%');
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
      assert.ok(prompt.includes('Physics, Chemistry and Mathematics (PCM)'));
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
          { text: 'Raghavendra holds a BSc in Physics, Chemistry and Mathematics.' }
        ]
      };
      const result = extractAssistantReply(response);
      assert.equal(result, 'Raghavendra holds a BSc in Physics, Chemistry and Mathematics.');
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
              reasoning_content: 'User is asking about education. Raghavendra has BSc in PCM with 68% and MSc in Data Science.'
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
        headers: { 'Content-Type': 'text/plain' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ other: 'value' })
      });
      const res1 = await worker.fetch(req1, {}, {});
      assert.equal(res1.status, 400);
      const data1 = await res1.json();
      assert.ok(data1.error.includes('Missing required field: "message"'));

      // Empty whitespace message
      const req2 = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
      assert.ok(capturedOptions.messages[0].content.includes('Physics, Chemistry and Mathematics (PCM)'));
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
                  content: 'Raghavendra completed his Bachelor of Science in PCM with 68%.'
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
      assert.equal(data.reply, 'Raghavendra completed his Bachelor of Science in PCM with 68%.');
      assert.equal(data.response, 'Raghavendra completed his Bachelor of Science in PCM with 68%.');
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
            throw new Error('Cloudflare daily allocation limit exceeded: 429');
          }
        }
      };

      const req = new Request('https://worker.local/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

});
