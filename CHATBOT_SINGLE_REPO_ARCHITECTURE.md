# Single-Repository Architecture Review: AI Chatbot Integration
**Repository:** [raghavendrayadavgolla/raghavendragolla-website](https://github.com/raghavendrayadavgolla/raghavendragolla-website)  
**Proposed Backend Directory:** `/chatbot-worker/`  
**Date:** November 19, 2026  
**Status:** Architectural Review & Feasibility Assessment (Pre-Implementation)

---

## Executive Verdict

**The single-repository architecture is completely viable, clean, and highly recommended.**

Housing the frontend and backend in one repository provides strong advantages for personal portfolio maintenance:
- **Synchronized Versioning:** Changes to your professional background (resume, new publications, new projects) can be updated across both the frontend HTML and the AI knowledge base in a single commit and release tag.
- **Zero Repository Sprawl:** No need to manage, track, or authenticate separate GitHub repositories.
- **Strict Logical & Physical Isolation:** By placing the backend inside `/chatbot-worker/` with its own isolated dependencies, configuration, and build lifecycle, the backend is decoupled from the frontend while residing in the same git tree.
- **Zero Cost & Zero Secret Leakage:** The Cloudflare Workers AI free tier requires no paid billing or third-party API keys. The worker configuration contains zero credentials, and GitHub Pages can be strictly configured to never serve backend source code.

---

## 1. Architectural Map of the Single Repository

```
raghavendragolla-website/
├── assets/
│   ├── css/
│   │   └── shared/
│   │       ├── chatbot.css              # [FRONTEND] Chatbot widget styling & theme integration
│   │       ├── components.css           # Existing shared UI components
│   │       └── tokens.css               # Existing design tokens (Light/Dark mode)
│   └── js/
│       ├── chatbot.js                   # [FRONTEND] Zero-dependency client (SSE stream fetch, UI events)
│       ├── script.js                    # Existing homepage controller
│       └── shared.js                    # Existing shared engine (modal a11y, theme, storage)
│
├── chatbot-worker/                      # [BACKEND - ISOLATED]
│   ├── src/
│   │   ├── index.js                     # Edge router, CORS, IP rate-limiter, SSE streaming handler
│   │   └── knowledge.js                 # Structured professional profile, research & project context
│   ├── package.json                     # Worker dependencies (Wrangler devDependency only)
│   ├── package-lock.json
│   ├── wrangler.toml                    # Cloudflare Worker configuration & [ai] binding
│   └── .gitignore                       # Worker-specific ignores (.wrangler/, node_modules/)
│
├── portfolio/                           # Existing portfolio pages and assets
├── scripts/                             # Existing test and verification tooling
├── tests/                               # Existing Playwright & A11y test suites
├── _config.yml                          # Jekyll deploy exclusions (MUST EXCLUDE chatbot-worker/)
├── index.html                           # Homepage (includes chat widget markup & CSP connect-src)
├── privacy.html                         # Privacy Notice (includes AI data processing disclosure)
├── sw.js                                # Service Worker (bypasses /chat requests)
└── package.json                         # Root project manifest (frontend linting & Playwright)
```

---

## 2. Technical Conflicts & How to Resolve Them

Our audit identified six specific technical intersection points between the proposed `chatbot-worker/` folder and the existing website toolchain:

| Area | Potential Conflict | Severity | Architectural Resolution |
| :--- | :--- | :--- | :--- |
| **1. Jekyll Public Exposure** | GitHub Pages builds the repository root with Jekyll. By default, unexcluded directories are published publicly to `https://www.raghavendragolla.com/chatbot-worker/`. | **HIGH** | Add `- chatbot-worker/` to the `exclude:` list in `_config.yml`. Update `tests/deploy-exclusions.spec.js` to assert that `chatbot-worker` is never published. |
| **2. ESLint Scanner Collision** | The root `eslint .` command (using `eslint.config.mjs`) expects browser-based vanilla scripts in `assets/js` and commonjs/ESM in `tests/`. Cloudflare Worker code uses Cloudflare V8 worker globals (`Response`, `Request`, `env.AI`). Running root ESLint on `chatbot-worker/` would trigger syntax or undefined global errors. | **MEDIUM** | Add `"chatbot-worker/"` to the root `ignores:` array in `eslint.config.mjs`. The worker can maintain its own optional `npm run lint` script inside its subfolder. |
| **3. Dependency Management** | Running `npm install` in the repository root might conflict if root and subfolder dependencies are commingled. | **LOW** | Do not add a root workspace. Keep `chatbot-worker/package.json` completely independent. Dependencies installed in `chatbot-worker/` remain in `chatbot-worker/node_modules/`. |
| **4. PII & Privacy Scanner** | `scripts/privacy-scan.js` scans all tracked files for accidental secrets, email addresses, and phone numbers. If `chatbot-worker/src/knowledge.js` contains developer email or contact strings, it must align with scanner allowlists. | **LOW** | `scripts/privacy-scan.js` already allowlists `raghavendrayadavgolla@gmail.com` and `contact@raghavendragolla.com`. Add `'chatbot-worker'` to `EXCLUDE_DIRS` in `scripts/privacy-scan.js` or keep public profile text aligned with allowlisted domains. |
| **5. Local Test Server** | `scripts/test-server.js` serves files directly from the repository root at `localhost:8080`. Navigating to `http://localhost:8080/chatbot-worker/wrangler.toml` would return the file during local tests. | **LOW** | Add an explicit block in `scripts/test-server.js` returning 404 for any request targeting `/chatbot-worker/*` to accurately mirror production Jekyll behavior. |
| **6. CSP & Service Worker** | The browser's Content Security Policy and Service Worker will block or inappropriately cache Worker API calls if unconfigured. | **MEDIUM** | Add the worker endpoint (e.g. `https://ai.raghavendragolla.com`) to `connect-src` in page CSPs. Ensure `sw.js` network fetch handler ignores the AI API origin so streaming responses are never intercepted or cached by the Service Worker. |

---

## 3. Required Deployment Configuration

The single-repository model allows **100% independent deployments**:
- A commit updating the homepage HTML deploys only the frontend.
- A commit updating the system prompt or worker code deploys the Cloudflare Worker.

### A. Frontend Deployment (GitHub Pages)
- **Deployment Mechanism:** Fully automated by GitHub Pages.
- **Triggers:** Push to `main` branch.
- **Configuration Required in `_config.yml`:**
  ```yaml
  exclude:
    # Jekyll defaults
    - Gemfile
    - Gemfile.lock
    - node_modules/
    - vendor/
    # Node tooling and documentation
    - package.json
    - package-lock.json
    - README.md
    - eslint.config.mjs
    - playwright.config.js
    - lighthouserc.json
    # Development, test and audit tooling
    - scripts/
    - tests/
    - test-results/
    - playwright-report/
    - scratch/
    # Chatbot backend worker (NEVER PUBLISHED TO PUBLIC WEBSITE)
    - chatbot-worker/
  ```

### B. Backend Deployment (Cloudflare Workers)
- **Deployment Mechanism:** Can be deployed in two independent ways:
  1. **Option A (Manual / Local):**
     From your local terminal, navigate to the worker folder and deploy:
     ```bash
     cd chatbot-worker
     npx wrangler deploy
     ```
  2. **Option B (Automated via GitHub Actions):**
     A lightweight GitHub Actions workflow (`.github/workflows/deploy-worker.yml`) triggered **only** when files inside `chatbot-worker/**` are changed.

### C. Worker Configuration (`chatbot-worker/wrangler.toml`)
The configuration contains **no secrets**, only infrastructure definitions:
```toml
name = "raghavendragolla-ai-bot"
main = "src/index.js"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

# Native Cloudflare Workers AI Binding (Zero external API keys needed)
[ai]
binding = "AI"

# Optional Custom Domain Routing (Runs on your existing Cloudflare DNS)
# routes = [
#   { pattern = "ai.raghavendragolla.com/*", zone_name = "raghavendragolla.com" }
# ]
```

---

## 4. GitHub Actions CI/CD Implications

### Existing CI Workflow (`.github/workflows/ci.yml`)
The current CI workflow enforces strict quality controls (ESLint, Stylelint, HTML-Validate, CSP verification, Precache verification, Privacy scan, Playwright E2E, Lighthouse).

- **Does `chatbot-worker/` break existing CI?**
  **No**, provided that:
  1. Root `eslint.config.mjs` ignores `chatbot-worker/`.
  2. Root `package.json` test scripts remain scoped to the root repository.
  3. `tests/deploy-exclusions.spec.js` includes `chatbot-worker` in its `mustExclude` list.

### Proposed Independent Worker Deployment Workflow
To deploy the worker automatically without running the heavy Playwright/Lighthouse browser test suite on backend-only changes:

```yaml
# .github/workflows/deploy-worker.yml
name: Deploy Chatbot Worker

on:
  push:
    branches: [ main ]
    paths:
      - 'chatbot-worker/**'
  workflow_dispatch:

jobs:
  deploy:
    name: Deploy to Cloudflare Workers
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Worker via Wrangler
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: 'chatbot-worker'
```

---

## 5. Security & Privacy Considerations

### 1. Zero Secrets in the Repository
- **No Third-Party AI API Keys:** Cloudflare Workers AI uses the native platform binding `[ai]`. There are no OpenAI, Anthropic, or Gemini API keys to store, manage, or accidentally leak.
- **No Cloudflare Credentials in `wrangler.toml`:** Cloudflare API tokens are passed via GitHub Secrets (for CI) or stored locally in `~/.wrangler` (for local CLI deployment).
- **Public Repository Safety:** Because your GitHub repository is public, `chatbot-worker/wrangler.toml`, `index.js`, and `knowledge.js` will be publicly visible on GitHub. This is standard and completely safe because:
  - `knowledge.js` contains only information you already publish openly on your resume, LinkedIn, and website.
  - The worker code contains logic and rate limiters, not credentials.

### 2. Guarding Against Deployment Leaks (GitHub Pages)
- If someone visits `https://www.raghavendragolla.com/chatbot-worker/src/index.js`, GitHub Pages must return **404 Not Found**.
- This is guaranteed by adding `chatbot-worker/` to `_config.yml` and testing it with Playwright in `tests/deploy-exclusions.spec.js`.

### 3. Edge Rate Limiting & Abuse Prevention
Because Cloudflare Workers AI gives a generous free allocation of 10,000 Neurons per day, an open API could be drained by automated bots. The Worker inside `chatbot-worker/src/index.js` must implement:
- **CORS & Allowed Origins:** Only accept requests with `Origin: https://www.raghavendragolla.com`, `https://raghavendragolla.com`, or `http://localhost:8080`.
- **IP-Based Rate Limiting:** Enforce a limit (e.g., maximum 5 requests per minute per IP) using the Cloudflare Cache API directly in worker memory.
- **Payload Constraints:** Reject incoming messages exceeding 400 characters; cap output to 300 tokens (`max_tokens: 300`).

---

## 6. Single vs Multi-Repository Trade-Off Analysis

| Feature | Single Repository (Monorepo) | Multi-Repository (Separate Backend) |
| :--- | :--- | :--- |
| **Maintenance Burden** | **Very Low:** Single repo to clone, pull, and commit. | **High:** Multiple repos, sync issues, multiple sets of git credentials. |
| **Knowledge Base Sync** | **Instant:** Update resume, projects, and AI context in a single PR/commit. | **Lagged:** Must remember to update the second repository whenever the resume changes. |
| **Deployment Isolation** | **Complete:** Frontend via GitHub Pages; Backend via Cloudflare Wrangler. | **Complete:** Both deploy independently. |
| **Secrets Exposure** | **Zero:** Native Workers AI binding requires no API keys. | **Zero:** Native Workers AI binding requires no API keys. |
| **Release Tagging** | **Unified:** Single release tag (e.g. `v2.6.0`) covers UI + Worker. | **Fragmented:** Independent release numbers. |
| **Recommended?** | **YES (Recommended Choice)** | No (Unnecessary complexity for this scale) |

---

## Conclusion & Next Steps

The proposed single-repository architecture is robust, secure, and preserves the simplicity of your personal website.

### Future Implementation Checklist:
1. **Repository Setup:**
   - Add `- chatbot-worker/` to `_config.yml`.
   - Add `'chatbot-worker/'` to `ignores:` in `eslint.config.mjs`.
   - Add `'chatbot-worker'` to `tests/deploy-exclusions.spec.js`.
2. **Backend Construction (`chatbot-worker/`):**
   - Create `package.json`, `wrangler.toml`, `src/index.js`, and `src/knowledge.js`.
   - Test worker locally with `npx wrangler dev`.
   - Deploy worker to Cloudflare (e.g., `https://ai.raghavendragolla.com`).
3. **Frontend Integration (`assets/`):**
   - Create `assets/css/shared/chatbot.css` and `assets/js/chatbot.js`.
   - Add chatbot UI markup to `index.html` and `portfolio/index.html`.
   - Update CSP `connect-src` and re-verify CSP hashes via `npm run verify:csp`.
   - Update `sw.js` and `verify-precache.js` to ensure clean precaching.
4. **End-to-End Verification:**
   - Verify `npm run check` (Lint, Validate, CSP, Precache, Privacy, Playwright).
