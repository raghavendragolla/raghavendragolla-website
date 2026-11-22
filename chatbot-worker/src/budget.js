/**
 * Daily Workers AI budget (circuit breaker) for Ask GORA
 * -----------------------------------------------------------------------------
 * Why: the per-IP rate limiter cannot bound TOTAL daily usage. Many clients (or
 * one client rotating IPs) could otherwise spend the whole Workers AI daily
 * allocation, or, on a Workers Paid plan, run up neuron charges.
 *
 * Storage & consistency: ONE global SQLite-backed Durable Object instance
 * (`idFromName('global')`) owns a tiny table with one row per UTC day. A
 * Durable Object runs single-threaded and its SQL calls are synchronous, so
 * every check-and-add below is atomic and strongly consistent across all
 * Cloudflare locations; there is no eventual-consistency window to overshoot.
 *
 * Accounting (reserve -> settle):
 *   1. Before inference the Worker RESERVES a conservative worst-case estimate
 *      (prompt size at a pessimistic chars-per-token ratio + the full output
 *      token cap). If used + estimate would exceed the cap, the request is
 *      refused and the model is never called.
 *   2. After inference it SETTLES: the reservation is replaced by the actual
 *      cost when the model reports token usage; otherwise the conservative
 *      estimate stays charged.
 *   Errors and missing usage therefore only ever OVER-count, never under-count.
 *
 * Cost: ~2 Durable Object requests and ~2 SQLite row writes per chat message,
 * far below the Workers Free limits (100,000 requests and 100,000 rows
 * written per day). On Workers Free, exceeding a Durable Objects limit returns
 * errors, never charges.
 *
 * Failure behaviour: if the budget object cannot be reached or errors, the
 * Worker FAILS CLOSED: no inference, a friendly fallback is returned (see
 * index.js). A counter outage can never silently increase AI usage.
 */

// Workers AI prices for the active model, in neurons per million tokens
// (Cloudflare Workers AI pricing page; confirmed against live `usage` output).
export const NEURONS_PER_M_INPUT_TOKENS = 9091;
export const NEURONS_PER_M_OUTPUT_TOKENS = 27273;

// Default daily cap: 80% of the 10,000-neuron free allocation, leaving headroom.
export const DEFAULT_DAILY_NEURON_BUDGET = 8000;

// Pessimistic characters-per-token ratio for the estimate (measured ratio for
// this prompt is ~4.2 chars/token; a lower ratio means a higher estimate).
const ESTIMATE_CHARS_PER_TOKEN = 3;

// Days of history kept in the table (older rows are pruned).
const RETENTION_DAYS = 7;

export function utcDay(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Parses the configured cap; invalid or non-positive values fall back to the default. */
export function resolveDailyBudget(env) {
  const raw = env && env.AI_DAILY_NEURON_BUDGET;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_NEURON_BUDGET;
}

/** Conservative worst-case neuron cost of one chat request. */
export function estimateRequestNeurons(messages, maxOutputTokens) {
  const chars = (messages || []).reduce(
    (sum, m) => sum + (m && typeof m.content === 'string' ? m.content.length : 0) + 16, // +16: role/template overhead
    0
  );
  const inputTokens = Math.ceil(chars / ESTIMATE_CHARS_PER_TOKEN);
  return (
    (inputTokens * NEURONS_PER_M_INPUT_TOKENS) / 1e6 +
    (maxOutputTokens * NEURONS_PER_M_OUTPUT_TOKENS) / 1e6
  );
}

/**
 * Actual neuron cost from a Workers AI response, or null when it does not report usage.
 * Accepts an explicit `neurons` figure or prompt/completion token counts.
 */
export function actualNeuronsFromResponse(aiResponse) {
  const usage = aiResponse && typeof aiResponse === 'object' ? aiResponse.usage : null;
  if (!usage || typeof usage !== 'object') return null;
  if (Number.isFinite(usage.neurons) && usage.neurons >= 0) return usage.neurons;
  const input = Number(usage.prompt_tokens);
  const output = Number(usage.completion_tokens);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return (input * NEURONS_PER_M_INPUT_TOKENS) / 1e6 + (output * NEURONS_PER_M_OUTPUT_TOKENS) / 1e6;
}

/** SQLite-backed store used by the Durable Object (one row per UTC day). */
export class SqlUsageStore {
  constructor(sql) {
    this.sql = sql;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS daily_usage (' +
      'day TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0)'
    );
  }

  get(day) {
    const rows = this.sql.exec('SELECT neurons, requests FROM daily_usage WHERE day = ?', day).toArray();
    return rows.length ? { neurons: Number(rows[0].neurons), requests: Number(rows[0].requests) } : { neurons: 0, requests: 0 };
  }

  add(day, neurons, requests) {
    this.sql.exec(
      'INSERT INTO daily_usage (day, neurons, requests) VALUES (?, ?, ?) ' +
      'ON CONFLICT(day) DO UPDATE SET neurons = MAX(0, neurons + excluded.neurons), requests = requests + excluded.requests',
      day, neurons, requests
    );
  }

  prune(oldestDayToKeep) {
    this.sql.exec('DELETE FROM daily_usage WHERE day < ?', oldestDayToKeep);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Durable Object class (SQLite storage backend; declared in wrangler.toml).
 * Internal API, reachable only through the AI_BUDGET binding (never from the internet):
 *   POST /reserve { estimate, cap } -> { allowed, day, used, cap }
 *   POST /settle  { day, estimate, actual } -> { ok }
 */
export class AiBudget {
  constructor(state, env, store, now) {
    this.store = store || new SqlUsageStore(state.storage.sql);
    this.now = now || (() => Date.now());
    this.lastPrunedDay = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid body' }, 400);
    }

    if (url.pathname === '/reserve') {
      const estimate = Number(body.estimate);
      const cap = Number(body.cap);
      if (!Number.isFinite(estimate) || estimate <= 0 || !Number.isFinite(cap) || cap <= 0) {
        return json({ error: 'invalid estimate or cap' }, 400);
      }
      const day = utcDay(this.now());
      this.pruneOldDays(day);
      const used = this.store.get(day).neurons;
      if (used + estimate > cap) {
        return json({ allowed: false, day, used, cap });
      }
      this.store.add(day, estimate, 1);
      return json({ allowed: true, day, used: used + estimate, cap });
    }

    if (url.pathname === '/settle') {
      const estimate = Number(body.estimate);
      const actual = Number(body.actual);
      if (typeof body.day !== 'string' || !Number.isFinite(estimate) || !Number.isFinite(actual) || actual < 0) {
        return json({ error: 'invalid settle payload' }, 400);
      }
      // Settles against the day the reservation was made, so a request that crosses
      // midnight UTC corrects the right row.
      this.store.add(body.day, actual - estimate, 0);
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  }

  pruneOldDays(today) {
    if (this.lastPrunedDay === today || typeof this.store.prune !== 'function') return;
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    this.store.prune(cutoff.toISOString().slice(0, 10));
    this.lastPrunedDay = today;
  }
}

/** Worker-side helpers: talk to the single global budget object through its binding. */
function budgetStub(env) {
  return env.AI_BUDGET.get(env.AI_BUDGET.idFromName('global'));
}

export async function reserveBudget(env, estimate) {
  const res = await budgetStub(env).fetch('https://ai-budget/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estimate, cap: resolveDailyBudget(env) })
  });
  if (!res.ok) throw new Error(`budget reserve failed: ${res.status}`);
  const data = await res.json();
  if (typeof data.allowed !== 'boolean' || typeof data.day !== 'string') throw new Error('budget reserve: malformed response');
  return data;
}

export async function settleBudget(env, day, estimate, actual) {
  const res = await budgetStub(env).fetch('https://ai-budget/settle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day, estimate, actual })
  });
  if (!res.ok) throw new Error(`budget settle failed: ${res.status}`);
}
