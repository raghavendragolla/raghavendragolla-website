# Raghavendra Golla - Portfolio AI Chatbot Worker

Edge-accelerated serverless AI backend for the personal portfolio website of Raghavendra Golla ([raghavendragolla.com](https://www.raghavendragolla.com/)).

Powered by **Cloudflare Workers** and **Cloudflare Workers AI**, running Google's **Gemma 4 26B (4B active Mixture-of-Experts) Instruct** model (`@cf/google/gemma-4-26b-a4b-it`) directly on Cloudflare's edge GPU tensor network.

---

## 1. Architecture Highlights

- **100% Free Inference:** Operates entirely within Cloudflare's free daily allocation (10,000 Neurons per day on Workers AI + 100,000 requests per day on Workers).
- **Native Workers AI Binding (`env.AI`):** Binds directly to Cloudflare's internal tensor network. No OpenAI, Anthropic, Gemini, or third-party paid API keys or subscriptions.
- **Zero Client Secrets:** The public website never holds an API token or private key; all prompt construction, validation, and execution happen securely within the worker isolate.
- **Factual Single Source of Truth:** `src/knowledge.js` houses the candidate profile (`CANDIDATE_PROFILE`) and system prompt generator (`buildSystemPrompt()`), enforcing strict guardrails to prevent hallucinations, protect privacy, and resist prompt injection.

---

## 2. API Endpoints

### `GET /health`
Returns service status, model configuration, and input/output bounds.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "raghavendragolla-ai-bot",
  "model": "@cf/google/gemma-4-26b-a4b-it",
  "limits": {
    "maxInputLength": 400,
    "maxOutputTokens": 512,
    "maxHistoryTurns": 4,
    "maxPayloadBytes": 10240
  },
  "timestamp": "2026-11-19T10:00:00.000Z"
}
```

### `POST /chat`
Processes conversational queries about Raghavendra's professional background.

**Request Headers:**
- `Content-Type: application/json`
- `Accept: application/json` (or `text/event-stream` for real-time streaming)

**Request Body:**
```json
{
  "message": "What is Raghavendra's educational background?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! How can I help you explore Raghavendra's portfolio?" }
  ],
  "stream": false
}
```

**Response (200 OK):**
```json
{
  "reply": "Raghavendra holds a Bachelor of Science (BSc) in Physics, Chemistry and Mathematics (PCM) from Krishna University (completed in 2020 with 68%), and is currently pursuing a Master of Science (MSc) in Data Science at Chandigarh University (expected June 2027)...",
  "model": "@cf/google/gemma-4-26b-a4b-it",
  "usage": {
    "maxTokens": 512
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing message, empty message, non-JSON body, or message $> 400$ characters.
- `413 Payload Too Large`: Raw request body exceeds 10 KB (`MAX_PAYLOAD_BYTES`).
- `429 Too Many Requests`: Triggered when local burst rate limits are exceeded, or when Cloudflare's free daily AI allocation limit is reached (returns polite message inviting visitor to contact directly via email).
- `500 Internal Server Error`: Edge GPU timeout or runtime exception.
- `503 Service Unavailable`: Workers AI binding not bound in environment.

---

## 3. Free Usage Protection & Rate Limiting

### Model Selection: `@cf/google/gemma-4-26b-a4b-it`
- **Why this model?**
  1. Built on Google's research with a Mixture-of-Experts (MoE) architecture (26B total parameters, but only 4B parameters active per forward pass).
  2. Billed on Cloudflare Workers AI at 9,091 Neurons per million input tokens and 27,273 Neurons per million output tokens.
  3. A typical query now uses ~2,700 input tokens (system prompt + knowledge base, measured) plus 100–250 output tokens: roughly 28–36 Neurons (≈280–360 messages per 10,000-Neuron day).
  4. This allows hundreds of visitor interactions daily under Cloudflare's **10,000 Neurons/day free allocation**, providing high reasoning capability at zero monetary cost.

### Rate Limiting & Security Considerations

#### 1. Payload & Context Bounding (Application Layer)
- **Request Body Cap (`10 KB`):** Checks `Content-Length` header before processing JSON.
- **Input Length Cap (`400` characters):** Prevents prompt-stuffing attacks.
- **History Turn Cap (`4` turns):** Retains only the 2 most recent user/assistant turns, bounding total prompt tokens.
- **Output Token Cap (`512` tokens):** Restricts maximum generation length, preventing runaway token generation.

#### 2. Server-side Origin Allow-list
- `POST /chat` is rejected with `403 ORIGIN_NOT_ALLOWED` unless `Origin` is `https://www.raghavendragolla.com` or `https://raghavendragolla.com`, before any rate-limit or AI work.
- Loopback origins (`http://localhost:*`, `http://127.0.0.1:*`) are accepted only when `ALLOW_DEV_ORIGINS="true"` (put it in `.dev.vars` for `wrangler dev`; never set it in production). A page served by `scripts/test-server.js` therefore cannot use the deployed Worker.
- **Limitation:** non-browser clients can forge `Origin`. This is a cheap filter, not authentication.

#### 3. Daily AI Budget (Durable Object circuit breaker)
- One global SQLite-backed Durable Object (`AI_BUDGET`, class `AiBudget`, `src/budget.js`) counts Neurons per UTC day. Strongly consistent; resets at 00:00 UTC (05:30 IST).
- Before inference the Worker reserves a conservative estimate; after inference the reservation is settled to the actual usage when the model reports it. Errors only ever over-count.
- Cap: `AI_DAILY_NEURON_BUDGET` (default `8000`, 80% of the free allocation). At the cap: `429 DAILY_BUDGET_REACHED` with a friendly `fallbackReply`; the model is not called.
- If the counter is unavailable the Worker **fails closed**: `503 BUDGET_UNAVAILABLE`, no inference.
- Cost: ~2 Durable Object requests and ~2 SQLite row writes per message (Workers Free: 100,000 of each per day). Streamed responses keep the conservative estimate (usage is not settled).

#### 4. Ephemeral In-Memory Rate Limiting (Isolate Layer)
- An IP-based token window limits single-client bursts to 10 requests per minute.
- **LIMITATION:** In Cloudflare Workers, code executes across hundreds of edge data centers. In-memory maps exist only within a single V8 isolate in a single data center and reset when the isolate spins down. This is **not a globally synchronized rate limiter**.

#### 5. True Production Edge Protection (Network Layer)
- For globally synchronized protection against DDoS or scrapers, configure a **Rate Limiting Rule** in the Cloudflare Dashboard:
  - **Location:** Cloudflare Dashboard › Security › WAF › Rate Limiting Rules.
  - **Target:** `ai.raghavendragolla.com/chat`.
  - **Rule:** Max 5 requests per 10 seconds per IP address.
  - **Action:** Block with HTTP 429 for 60 seconds.
  - This stops malicious traffic at Cloudflare's network perimeter before it ever invokes the Worker or consumes free Neurons.

---

## 4. Local Development & Testing

### Running Tests Locally
From the project root:
```bash
node --test chatbot-worker/test/index.test.js
```
Or from within `chatbot-worker/`:
```bash
npm test
```

### Running the Worker Locally with Wrangler
From within `chatbot-worker/`:
```bash
npx wrangler dev
```
*(To test actual Workers AI inference locally, run `npx wrangler dev --remote` to connect to your free Cloudflare account binding).*

---

## 5. Manual Deployment to Cloudflare (When Ready)

When you are ready to deploy:
```bash
cd chatbot-worker
npx wrangler login
npx wrangler deploy
```
*(Note: Do not deploy until you are ready; this phase is purely local preparation).*

---

## 6. Phase 3 architecture and operations guide (2026-11-22)

### 6.1 Request flow

**Browser (`assets/js/chatbot.js`)**
1. The visitor asks a question (composer, Enter, or a suggested-question chip). One request at a time; while an answer is generating, the send button becomes **Stop**.
2. `POST https://ai.raghavendragolla.com/chat` with `{ message, history (last 8 messages), stream: true }` and `Accept: text/event-stream, application/json`.
3. A `text/event-stream` answer is read incrementally (`ReadableStream`) and rendered as it arrives (safe Markdown subset, DOM-only, never `innerHTML`). JSON responses (errors, or a non-streaming Worker) are handled as before.
4. Timeouts: 15 s for the first text, then 15 s of silence between chunks. Stop keeps the partial answer. Interrupted, empty or failed answers show an error card with **Try again**.
5. The conversation is kept in `sessionStorage` (this tab only, cleared when the tab closes or on **Close**), so it survives a refresh or a move between the homepage and the portfolio.

**Worker (`src/index.js`; the entry module `src/worker.js` exports only the handler and the `AiBudget` class, because workerd treats every named export of the entry module as an entry point)**
1. CORS / Origin allow-list → rate limiter (binding, 10/min per IP, in-memory fallback) → `Content-Length` check → body read with a **hard 10 KB cap on the bytes actually received** → JSON / field validation (`message` 1–400 chars, `history` array ≤ 20 items).
2. Context: `sanitizeHistory` keeps ≤ 6 earlier messages, newest first, ≤ 2,400 characters in total, earlier answers trimmed to 700 characters, starting with a user turn.
3. Knowledge: `buildGroundedPrompt(question, history)` = operating rules + the **core profile** + the knowledge sections retrieved for this question and the last turns (`retrieveSections`: deterministic keyword scoring with stem matching, ≤ 5,600 characters of knowledge). `buildSystemPrompt()` still returns the complete knowledge base (used by the drift tests).
4. Daily budget: reserve a conservative estimate in the `AI_BUDGET` Durable Object; refuse with `DAILY_BUDGET_REACHED` (and a static fallback reply) if it would exceed the cap; fail closed if the counter is unavailable.
5. `env.AI.run('@cf/google/gemma-4-26b-a4b-it', { messages, max_tokens: 512, stream, chat_template_kwargs: { enable_thinking: false } })`.
6. Streaming: `accountedStream` passes the model's server-sent events through unchanged, records the final `usage` event and settles the budget with the real cost, appends `{"error_code":"EMPTY_RESPONSE"}` or `{"error_code":"STREAM_INTERRUPTED"}` when needed, and cancels the model stream if the visitor stops.

### 6.2 Knowledge maintenance
All facts live in `CANDIDATE_PROFILE` (`src/knowledge.js`). The structured sections (`KNOWLEDGE_SECTIONS`: core, education, skills, experience, projects overview, one section per project, research, GitHub, certifications, career, links, FAQ) are generated from it, so a fact is changed in one place only. The drift tests fail if a portfolio project, repository, demo, résumé or certificate link is missing. If a common question does not retrieve the right section, add keywords to that section and a case to `eval/ask-gora-eval.json`.

**Case studies (Phase 4).** Each project has a `caseStudy` (objective, data source, preparation, method and, where the repository documents them, limitations) and `research` has questions, data source, preparation and a disclaimer. These facts come from the projects' public GitHub READMEs and are shown on the portfolio page in the "Read the case study" panels. `test/phase4.test.js` checks that distinctive facts appear in **both** places, so the page and Ask GORA cannot drift apart: update both together.

**Retrieval and rules (Phase 4).** Up to 5,600 characters of knowledge per question. A question that names a section topic ("research", "skills", "education") prefers that section. Role-fit questions (fit, suitable, qualified, hire, recruiter...) retrieve skills, experience, projects overview, certifications and career first. Rule 9 structures project answers (objective, data, approach, verified result, links; limitations only when asked). Rule 10 answers role-fit questions with verified evidence only and offers the résumé and email.

**Frontend (Phase 4).** After an answer about hiring, contact or availability, or one that says information is not available, the chat shows contact links (Resume PDF, Email, LinkedIn, Contact form); out-of-scope refusals never get them. On the portfolio, "Contact form" minimizes the chat and jumps to the contact section. A "Is he a good fit for a Data Analyst role?" suggestion is offered, the composer shows an `N/400` counter from 320 characters (the limit is announced once to screen readers), and phone keyboards show a "Send" key.

### 6.3 Free-tier limits (verified 2026-11-22 from the official documentation)
| Service | Free allocation | When exceeded on the Free plan | Source |
|---|---|---|---|
| Workers AI | 10,000 neurons/day, resets 00:00 UTC | Requests fail with an error (no charge) | developers.cloudflare.com/workers-ai/platform/pricing/ |
| Gemma 4 26B A4B | 9,091 neurons per M input tokens, 27,273 per M output tokens; not listed as needing paid billing | — | same page; /workers-ai/models/gemma-4-26b-a4b-it/ |
| Workers | 100,000 requests/day; 10 ms CPU per request; 50 subrequests | Error 1027 (requests) / 1102 (CPU) | /workers/platform/limits/ |
| Durable Objects (SQLite) | Available on Free; 100,000 requests, 13,000 GB-s, 5 M rows read, 100,000 rows written per day; 5 GB storage | Operations fail with an error | /durable-objects/platform/pricing/ |
| Rate Limiting binding | Free availability and cost **not stated** in the docs | — | /workers/runtime-apis/bindings/rate-limit/ |

The account's actual plan was **not** verified (no account access from this environment). On a **Workers Paid** plan, Workers AI above 10,000 neurons/day is billed ($0.011 per 1,000 neurons); the `AI_BUDGET` cap is what prevents that, so keep it below 10,000.

### 6.4 Budget policy
- `AI_DAILY_NEURON_BUDGET = 8000` (80 % of the free allocation, 20 % headroom). Do not raise it above about 9,000.
- Per message (computed with `budget.js` from the measured prompt sizes): the grounded prompt is 3.6–7.1k characters (old full prompt: 11.4k). The conservative **reservation** is 25–36 neurons (old: 48.6); a **realistic** cost with a 200-token answer is about 13–21 neurons (old: about 30), i.e. roughly **470 messages per day** under the 8,000 cap (old: about 265). These are calculations from the published token prices, not live measurements.
- Only the real cost is settled; when usage is not reported the conservative estimate stays charged (over-counts, never under-counts). At the cap the Worker stops calling the model and returns `DAILY_BUDGET_REACHED` with a static fallback until 00:00 UTC (05:30 IST); the browser shows "GORA is resting for today" and never retries automatically.
- No polling and no background requests: one request per visitor question.

### 6.5 Monitoring usage (no paid analytics)
- Cloudflare dashboard → Workers & Pages → `raghavendragolla-ai-bot` → Metrics (requests, errors, CPU), and AI → Workers AI usage (neurons per day).
- The `daily_usage` table in the `AiBudget` Durable Object holds one row per UTC day (neurons, requests; 7 days kept). `observability` is disabled in `wrangler.toml` so no request logs are stored.
- If visitors often see "resting for today", the cap is being reached: check for abuse (rate-limit 429s) first. There is **no paid fallback** by design.

### 6.6 Testing
- Worker unit tests (mocked AI, no network, no neurons): `cd chatbot-worker && npm test` (97 tests in `test/index.test.js`, `test/phase3.test.js` and `test/phase4.test.js`; CI runs them in the "Ask GORA Worker Unit Tests" job).
- Frontend (mocked API): `npx playwright test tests/chatbot.spec.js tests/phase1.spec.js tests/phase3.spec.js tests/phase4.spec.js --project=chromium --workers=1`.
- Live evaluation (consumes free neurons; run deliberately): `npm run eval:ask-gora -- --endpoint <url>` (about 650 neurons for all 42 cases; the results file keeps a 300-character preview of each answer, scoring uses the full answer). `--dry-run` checks the setup without sending anything.

### 6.7 Troubleshooting
| Symptom | Likely cause | Action |
|---|---|---|
| "GORA is resting for today" | `DAILY_BUDGET_REACHED` or `AI_QUOTA_EXCEEDED` | Wait for 00:00 UTC; check for abuse |
| "GORA is temporarily busy" | Rate limit (10/min per IP) or `AI_BUSY` (3040) | Wait a minute |
| "taking longer than usual" | No text for 15 s | Retry; check Workers AI status |
| "The answer was cut short" | Stream interrupted (`STREAM_INTERRUPTED` or network) | Retry |
| 403 `ORIGIN_NOT_ALLOWED` | Request not from the website origin | Expected for non-browser calls; for `wrangler dev` set `ALLOW_DEV_ORIGINS="true"` in `.dev.vars` |

### 6.8 Security notes and known limitations
- The Origin check is a cheap filter, not authentication (non-browser clients can forge it); the per-IP rate limit and the global daily budget are the real abuse controls.
- Prompt injection: visitor text is only ever a user message, and the rules tell the model to treat it as a question. This reduces but cannot eliminate injection risk. Answers are rendered as text (no HTML), and links only for `http(s)`.
- Retrieval is keyword-based: an unusual phrasing can miss a section (the core profile is always included as a safety net).
- No conversation content is stored server-side; the Durable Object stores only daily counters.
- No external web search: questions needing current external information get "not available" (no verified free search source is integrated).
