#!/usr/bin/env node
/**
 * Ask GORA live evaluation (run deliberately; it consumes free Workers AI neurons).
 *
 *   node scripts/eval-ask-gora.js [--endpoint URL] [--origin ORIGIN] [--limit N] [--delay MS] [--dry-run]
 *
 * Default endpoint: http://localhost:8787/chat (`wrangler dev`; Workers AI always runs on
 * Cloudflare, so this still uses the account's free daily allocation). Pointing it at the
 * production Worker evaluates whatever is deployed there.
 *
 * Each case from chatbot-worker/eval/ask-gora-eval.json is sent as a non-streaming request
 * (simpler to score). An answer passes when it contains every `mustInclude` string and none of
 * the `mustNotInclude` strings (case-insensitive); malformed-request cases pass when the HTTP
 * status matches `expectStatus`. Reports pass rate, failures, latency and a neuron estimate.
 * Cost guard: ~38 cases x ≈20 neurons ≈ 800 neurons (≈8% of the 10,000 daily free allocation).
 * Requests are spaced (default 7 s) to stay under the Worker's 10 requests/minute rate limit.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ENDPOINT = opt('--endpoint', 'http://localhost:8787/chat');
const ORIGIN = opt('--origin', 'https://www.raghavendragolla.com');
const LIMIT = Number(opt('--limit', '0')) || Infinity;
const DELAY = Number(opt('--delay', '7000'));
const DRY = args.includes('--dry-run');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chatbot-worker', 'eval', 'ask-gora-eval.json'), 'utf8'));
const cases = data.cases.slice(0, LIMIT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const expand = (q) => (q === 'REPEAT_400' ? 'Tell me about his projects. '.repeat(20).slice(0, 400) : q === 'REPEAT_401' ? 'x'.repeat(401) : q);

(async () => {
  if (DRY) {
    console.log(`Dry run: ${cases.length} cases would be sent to ${ENDPOINT} (Origin ${ORIGIN}). Nothing was sent.`);
    return;
  }
  const results = [];
  for (const c of cases) {
    const body = c.rawBody !== undefined ? c.rawBody : JSON.stringify({ message: expand(c.question), history: c.history || [] });
    const t0 = Date.now();
    let status = 0;
    let reply = '';
    let error = '';
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body });
      status = res.status;
      const json = await res.json().catch(() => null);
      reply = (json && (json.reply || json.response || json.fallbackReply)) || '';
      if (!res.ok) error = (json && json.error_code) || `HTTP ${res.status}`;
    } catch (e) {
      error = e.message;
    }
    const ms = Date.now() - t0;
    let pass;
    const problems = [];
    if (c.expectStatus) {
      pass = status === c.expectStatus;
      if (!pass) problems.push(`status ${status} != ${c.expectStatus}`);
    } else {
      const low = reply.toLowerCase();
      for (const s of c.mustInclude || []) if (!low.includes(s.toLowerCase())) problems.push(`missing "${s}"`);
      for (const s of c.mustNotInclude || []) if (low.includes(s.toLowerCase())) problems.push(`contains forbidden "${s}"`);
      if (error) problems.push(`error ${error}`);
      pass = problems.length === 0;
    }
    results.push({ id: c.id, category: c.category, pass, ms, status, problems, reply: reply.slice(0, 300) });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${c.id.padEnd(12)} ${String(ms).padStart(6)} ms  ${problems.join('; ')}`);
    await sleep(DELAY);
  }
  const answered = results.filter((r) => !cases.find((c) => c.id === r.id).expectStatus);
  const lat = answered.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] : 0;
  const summary = {
    endpoint: ENDPOINT,
    cases: results.length,
    passed: results.filter((r) => r.pass).length,
    failedIds: results.filter((r) => !r.pass).map((r) => r.id),
    errors: results.filter((r) => r.problems.some((p) => p.startsWith('error'))).length,
    latencyMs: { median: pct(0.5), p90: pct(0.9), max: lat[lat.length - 1] || 0 }
  };
  console.log('\nSUMMARY ' + JSON.stringify(summary, null, 2));
  const out = path.join(process.cwd(), 'test-results', `ask-gora-eval-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
  console.log(`Details: ${out}`);
})();
