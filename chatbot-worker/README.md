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
    "maxOutputTokens": 300,
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
    "maxTokens": 300
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
  3. A typical query (~1,000 input tokens including knowledge base + 250 output tokens) consumes approximately 15.9 Neurons.
  4. This allows hundreds of visitor interactions daily under Cloudflare's **10,000 Neurons/day free allocation**, providing high reasoning capability at zero monetary cost.

### Rate Limiting & Security Considerations

#### 1. Payload & Context Bounding (Application Layer)
- **Request Body Cap (`10 KB`):** Checks `Content-Length` header before processing JSON.
- **Input Length Cap (`400` characters):** Prevents prompt-stuffing attacks.
- **History Turn Cap (`4` turns):** Retains only the 2 most recent user/assistant turns, bounding total prompt tokens.
- **Output Token Cap (`300` tokens):** Restricts maximum generation length, preventing runaway token generation.

#### 2. Ephemeral In-Memory Rate Limiting (Isolate Layer)
- An IP-based token window limits single-client bursts to 10 requests per minute.
- **LIMITATION:** In Cloudflare Workers, code executes across hundreds of edge data centers. In-memory maps exist only within a single V8 isolate in a single data center and reset when the isolate spins down. This is **not a globally synchronized rate limiter**.

#### 3. True Production Edge Protection (Network Layer)
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
