// @ts-check
/**
 * OPTIONAL live smoke test for the deployed Ask GORA Worker (https://ai.raghavendragolla.com).
 * ---------------------------------------------------------------------------
 * Opt-in only: every test skips unless GORA_LIVE_SMOKE=1, so normal runs
 * (npm test, npm run test:e2e, CI) never contact the live Worker and never
 * spend Workers AI neurons. Run it deliberately with:
 *
 *   npm run test:live-api
 *
 * Cost per run: ONE inference request (about 30 neurons of the 10,000-neuron
 * daily free allocation). The health and origin checks do not run the model.
 */
const { test, expect } = require('@playwright/test');

const API = 'https://ai.raghavendragolla.com';
const SITE_ORIGIN = 'https://www.raghavendragolla.com';

test.describe('Ask GORA live API smoke (opt-in, GORA_LIVE_SMOKE=1)', () => {
  test.skip(process.env.GORA_LIVE_SMOKE !== '1', 'Live API smoke is opt-in: run `npm run test:live-api`.');
  test.describe.configure({ mode: 'serial' });

  test('GET /health reports the expected service and model (no inference)', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('raghavendragolla-ai-bot');
    expect(data.model).toBe('@cf/google/gemma-4-26b-a4b-it');
  });

  test('a foreign Origin is rejected before inference (no inference)', async ({ request }) => {
    // Empty message: a pre-Phase-1 deployment answers 400 (validation), a Phase 1 deployment
    // answers 403 (Origin allow-list). Neither runs the model, so this check is free.
    const res = await request.post(`${API}/chat`, {
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      data: { message: '' }
    });
    test.info().annotations.push({ type: 'deployment', description: res.status() === 403 ? 'Phase 1 Worker (Origin allow-list active)' : `pre-Phase-1 Worker (status ${res.status()})` });
    expect([400, 403]).toContain(res.status());
  });

  test('one real chat request from the website origin returns a grounded reply (1 inference)', async ({ request }) => {
    const res = await request.post(`${API}/chat`, {
      headers: { 'Content-Type': 'application/json', Origin: SITE_ORIGIN },
      data: { message: 'In one sentence: what degree is Raghavendra currently pursuing?', history: [] },
      timeout: 30000
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.reply).toBe('string');
    expect(data.reply).toMatch(/MSc|Master/i);
    expect(data.reply).toMatch(/Data Science/i);
  });
});
