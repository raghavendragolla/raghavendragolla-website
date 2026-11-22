# Ask GORA Worker: recovery build ("safe mode")

Prepared 2026-11-22. Branch `recovery/worker-safe-mode` (Git worktree `E:\Documents\my-website-recovery`).
**Not deployed. Not committed.** Deploy it only if the Phase 1–3 release Worker misbehaves in production.

## What it is
| Part | Recovery build | Release build (main) |
|---|---|---|
| Request handling (`src/index.js`) | **Phase 1 Worker**: origin allow-list, rate limit, validation, daily budget, streaming passed straight through | Phase 3: adds retrieval, stream usage settlement, capped body read, history limits |
| Knowledge (`src/knowledge.js`) | Same file as the release: owner-approved facts (BSc in Mathematics, no score); uses the full-profile prompt `buildSystemPrompt()` | Grounded prompt with retrieval |
| Budget (`src/budget.js`) | Identical | Identical |
| Entry (`src/worker.js`) | Identical: exports only the handler and `AiBudget` | Identical |
| `wrangler.toml` | **Byte-identical**: same name, `AI`, `RATE_LIMITER` (10/60 s), `AI_BUDGET` + migration `v1-ai-budget`, `AI_DAILY_NEURON_BUDGET = "8000"`, the `ai.raghavendragolla.com` Custom Domain declared, and `workers_dev = true` (explicit) | same |
| `/health` | `maxHistoryTurns: 4`, no `streaming` field (an easy way to tell which build is live) | `maxHistoryTurns: 6`, `streaming: true` |

Because the Durable Object class and the migration are unchanged, deploying this build is a normal forward deployment. It does **not** cross the Durable Object lifecycle change, so the stored daily counters are kept. **Never** add a `deleted_classes` migration.

Streams in this build keep the conservative estimate charged (it over-counts and never under-counts), so the 8,000-neuron cap stays safe.

## Verified locally (2026-11-22)
- `npm test`: 60/60 (the Phase 1 tests, with the owner-approved degree facts).
- `wrangler deploy --dry-run`: valid, 63 KiB; same bindings as the release build.
- Starts in the local runtime (`wrangler dev`); `/health` returns 200; a foreign Origin gets 403.
- Accepts the new website's request shape (`stream: true`, SSE Accept, 8 history items): 200 `text/event-stream` with CORS for the site, and the budget is charged.

## How to use it (only with the owner's approval)
1. Confirm the problem is in the Worker: check `https://ai.raghavendragolla.com/health` and the Workers → Metrics errors.
2. `cd E:\Documents\my-website-recovery\chatbot-worker` and run `npx wrangler deploy`.
3. Check: `/health` shows `maxHistoryTurns: 4`; ask one question on the website; check Metrics.
4. The website needs no change; it works with both builds.

**Emergency stop instead** (no AI calls at all): in the release or recovery folder, deploy once with `npx wrangler deploy --var AI_DAILY_NEURON_BUDGET:1`. Every question then gets the "resting for today" fallback. Redeploy normally to undo.
