# AI Chatbot Integration Audit Report
**Target Project:** Personal Portfolio Website ([raghavendragolla.com](https://www.raghavendragolla.com/))  
**Repository:** [raghavendrayadavgolla/raghavendragolla-website](https://github.com/raghavendrayadavgolla/raghavendragolla-website)  
**Date:** November 19, 2026  
**Status:** Audit & Feasibility Inspection (Read-Only / Pre-Implementation)

---

## Executive Summary

An architectural and technical inspection of the repository was conducted to assess the feasibility of integrating a **100% free, AI-powered personal portfolio chatbot** backed by **Cloudflare Workers** and **Cloudflare Workers AI**.

### Core Verdict
**The website architecture is ideal for this integration.**
1. The domain `raghavendragolla.com` is already configured and proxied through **Cloudflare** for DNS, TLS, Transform Rules, and Web Analytics.
2. Cloudflare Workers AI offers a **100% free tier** of **10,000 Neurons per day**, allowing state-of-the-art inference using models such as `@cf/meta/llama-3.2-3b-instruct` or `@cf/meta/llama-3.1-8b-instruct` with **zero subscription costs and zero third-party API keys**.
3. The existing frontend is pure Vanilla HTML5/CSS3/JavaScript without bundler overhead, featuring a modular token-driven CSS architecture, dark/light theme switching, and an existing accessible slide-out drawer mechanism (`.thoughts-drawer` / `window.setupAccessibleModal`) that can be adapted for a chat widget.
4. **Zero secrets in the frontend:** All AI execution and prompt engineering remain strictly protected within the serverless Cloudflare Worker at the edge.

---

## 1. Current Architecture & Technology Stack

| Layer | Implementation Details |
| :--- | :--- |
| **Frontend Foundation** | Semantic HTML5, CSS3 with native CSS Custom Properties (HSL/Hex design tokens), Vanilla JavaScript (ES6+ with IIFE modularization). No React, Vue, Angular, jQuery, or build bundlers (Webpack/Vite). |
| **Hosting & Deployment** | GitHub Pages (`main` branch origin) behind Cloudflare CDN/Edge proxy. Publishing rules governed by `_config.yml`. |
| **PWA & Offline** | Service Worker (`sw.js`) with cache-first static precaching (37 core assets, versioned via `ASSET_VERSION = 'v24.5'`) and Web App Manifest (`manifest.json`). |
| **Security & Headers** | Strict Content Security Policy (CSP) delivered via `<meta http-equiv="Content-Security-Policy">` with SHA-256 script hashing, verified at build time by `scripts/verify-csp.js`. Edge HTTP headers (`X-Content-Type-Options`, `HSTS`, `X-Frame-Options`, `Permissions-Policy`, `X-Robots-Tag`) injected via Cloudflare Transform Rules. |
| **Theme Engine** | Light Mode default (as of v2.5.1) with dark mode toggle. Unified tokens in `assets/css/shared/tokens.css` with `:root` (Light) and `[data-theme="dark"]`. Persisted in `localStorage` under `rg:theme` and `theme`. Zero-FOUC inline `<head>` initializers. |
| **Design Language** | Editorial Swiss-Tech palette (Deep Technical Teal `#B83D20`, Orange `#E85D3F`, Dark Slate `#0a0e14`, Paper `#F7F6F2`), Fraunces serif headings, IBM Plex Sans body, and IBM Plex Mono accents. |
| **Testing & CI Gate** | GitHub Actions (`.github/workflows/ci.yml`) enforcing ESLint, Stylelint, HTML-Validate, CSP inline-script verification, Service Worker precache verification, Python-based PII/secrets scan (`pypdf` + `Pillow`), QPDF resume check, Playwright E2E/A11y tests, Linkinator, and Lighthouse CI. |

---

## 2. Complete Folder and File Structure

```
raghavendragolla-website/
├── .github/
│   └── workflows/
│       └── ci.yml                       # CI pipeline (Lint, Validate, CSP, PII, Playwright, Lighthouse)
├── .vscode/
│   └── settings.json                    # Editor configuration
├── assets/
│   ├── css/
│   │   ├── shared/
│   │   │   ├── components.css           # Badges, PWA banners, toasts, PSR cards, modals
│   │   │   ├── fonts.css                # Self-hosted @font-face rules & font fallbacks
│   │   │   └── tokens.css               # Design tokens, color schemes, fluid typography & spacing
│   │   ├── animations.css               # Keyframe animations (pulse, float, glow, spin)
│   │   ├── responsive.css               # Breakpoint ladder (360px up to 2560px ultrawide)
│   │   └── style.css                    # Homepage layout, cards, hero, and thoughts drawer
│   ├── favicon/                         # Icons (PNG 192x192, 256x256, 512x512, Apple Touch)
│   ├── fonts/                           # Self-hosted WOFF2 subset font binaries
│   ├── images/
│   │   └── og-image.jpg                 # Open Graph social banner
│   └── js/
│       ├── push.js                      # Career Radar web push pairing handler
│       ├── script.js                    # Homepage controller, canvas engine, card tilt, stats counter
│       └── shared.js                    # Shared engine (Theme, IST Clock, Toast, Modal A11y, SW init)
├── portfolio/
│   ├── certificates/                    # Verified credential thumbnails and full images
│   ├── css/
│   │   ├── animations.css               # Portfolio-specific animations
│   │   ├── responsive.css               # Portfolio-specific breakpoint rules
│   │   └── style.css                    # Portfolio layout, project studios, timeline, back-to-top btn
│   ├── images/
│   │   └── profile/                     # Profile avatar in 48px, 96px, 144px (WebP & JPEG)
│   ├── js/
│   │   └── script.js                    # Portfolio controller, filter tabs, studios, Web3Forms contact
│   ├── resume/
│   │   └── resume.pdf                   # Official verified 1-page PDF resume
│   └── index.html                       # In-depth Portfolio page (noindex, follow)
├── scripts/
│   ├── build-fonts.py                   # WOFF2 font subsetting tool
│   ├── privacy-scan.js                  # PII & secret scanner (pypdf text extractor + Pillow EXIF check)
│   ├── run-production-smoke.js          # Production smoke harness
│   ├── test-server.js                   # Local server mirroring production routing & 404 behavior
│   ├── verify-csp.js                    # SHA-256 validator comparing inline scripts against CSP meta tags
│   └── verify-precache.js               # Service Worker precache integrity checker
├── tests/
│   ├── helpers/                         # PDF link and WOFF2 font test helpers
│   ├── a11y.spec.js                     # Axe accessibility audit
│   ├── contact.spec.js                  # Contact form validation tests
│   ├── content-integrity.spec.js        # Content, resume link, and CSP directive verification
│   ├── cross-browser.smoke.spec.js      # Cross-browser smoke tests (Firefox/WebKit)
│   ├── deploy-exclusions.spec.js        # _config.yml deployment leak prevention tests
│   ├── fonts.spec.js                    # Self-hosted font loading tests
│   ├── landing.spec.js                  # Homepage functional tests
│   ├── portfolio.spec.js                # Portfolio functional tests
│   ├── production.smoke.spec.js         # Live site verification
│   └── routing.spec.js                  # Trailing slash and 404 routing tests
├── .gitattributes
├── .gitignore
├── .htmlvalidate.json                   # HTML validation rules
├── .stylelintrc.json                    # CSS linting rules
├── _config.yml                          # Jekyll deploy exclusions (excludes dev/test files)
├── 404.html                             # Custom 404 page (noindex, follow)
├── CNAME                                # Custom domain: www.raghavendragolla.com
├── eslint.config.mjs                    # ESLint flat config
├── google9dd676bcc70ae03c.html          # Google Search Console site verification
├── index.html                           # Main Landing Page / Hub (index, follow)
├── lighthouserc.json                    # Lighthouse CI performance & accessibility budgets
├── manifest.json                        # Progressive Web App manifest
├── package.json                         # Project scripts & devDependencies (v2.5.1)
├── package-lock.json
├── playwright.config.js                 # Playwright test suite runner config
├── privacy.html                         # Privacy Notice & Data Processing Disclosure
├── README.md                            # Repository technical documentation
├── robots.txt                           # Search engine crawling rules
├── sitemap.xml                          # XML Sitemap (homepage & privacy page)
└── sw.js                                # Offline Service Worker & precache manager
```

---

## 3. Existing Cloudflare & Hosting Configuration

### Hosting: GitHub Pages behind Cloudflare
1. **Origin:** GitHub Pages statically serves the site from the `main` branch.
2. **Edge Proxy:** The custom domain `raghavendragolla.com` (and `www.raghavendragolla.com` via `CNAME`) is proxied through Cloudflare (`orange-clouded` DNS).
3. **Cloudflare Services Active:**
   - **TLS/SSL:** Strict TLS termination with automated edge certificates and HSTS.
   - **Transform Rules:** Edge HTTP response headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, `Content-Security-Policy: frame-ancestors 'none'`, and `X-Robots-Tag: noindex` for `/portfolio/resume/*` and `/portfolio/certificates/*`).
   - **Web Analytics:** Cookieless aggregate telemetry via `static.cloudflareinsights.com` and `cloudflareinsights.com`.
   - **Scrape Shield:** Email address obfuscation via `/cdn-cgi/scripts/.../email-decode.min.js`.
4. **Cloudflare Workers Advantage:**
   - Because the domain is **already hosted on Cloudflare**, a Cloudflare Worker can be deployed on a custom subdomain (e.g., `https://ai.raghavendragolla.com` or `https://api.raghavendragolla.com`) or as a route (e.g., `https://www.raghavendragolla.com/api/chat*`) with zero DNS configuration hurdles and zero cost.

---

## 4. Existing JavaScript and CSS Structure

### JavaScript Architecture
1. **Zero External Runtime Dependencies:** All client-side JavaScript is native ES6+ without third-party frameworks.
2. **`assets/js/shared.js`:** The core runtime engine loaded on all pages:
   - `window.rgStorage`: Safe wrapper around `localStorage` protecting against Private Browsing exceptions.
   - `window.rgTheme`: Manages Light/Dark theme switching, canvas color updates, and storage persistence.
   - `window.setupAccessibleModal`: Accessible dialog helper handling focus trapping, `Escape` key listeners, background scroll lock (`scroll-locked`), and focus restoration.
   - `window.showToast`: Lightweight non-intrusive notification pill.
   - `window.initISTClock`: Live Indian Standard Time (IST) clock for vitals displays.
   - `window.initPWA`: Authoritative Service Worker registration (`/sw.js`).
3. **`assets/js/script.js`:** Homepage controller:
   - Interactive 60 FPS Neural Particle Canvas with mouse/touch physics.
   - Dynamic rotating headline text.
   - Metric number count-up animation.
   - 3D magnetic card tilt & specular sheen effects.
   - Thoughts/Now/Market drawer controller (`#thoughtsDrawer`).
4. **`portfolio/js/script.js`:** Portfolio page controller:
   - Project category filtering tabs (All, Data Analytics, Applied ML, Deep Learning).
   - Interactive data studio presets (Capstone Tech Studio & California Housing Studio).
   - Accessible BibTeX citation modal & certificate verification modal.
   - Web3Forms asynchronous contact form submission.

### CSS Architecture
1. **Design Tokens (`assets/css/shared/tokens.css`):**
   - Single source of truth for semantic color tokens (`--primary`, `--accent`, `--bg`, `--surface`, `--surface-elevated`, `--text`, `--text-muted`, `--border`, `--border-subtle`).
   - Theme variables switch automatically between `:root` (Light Mode) and `[data-theme="dark"]` (Dark Mode).
   - Fluid typography (`clamp()`) and spacing scale (`--space-4` to `--space-80`).
2. **Components (`assets/css/shared/components.css`):**
   - Standardized styling for badges, buttons, cards, toasts, skip links, and dialogs.
3. **Responsive Ladder (`assets/css/responsive.css` & `portfolio/css/responsive.css`):**
   - Rigorous breakpoints covering mobile (360px, 480px), tablet (640px, 768px), desktop (1024px, 1280px, 1440px), and ultrawide (1920px, 2560px).
   - Safe-area inset handling (`env(safe-area-inset-bottom)`) for notched mobile displays.

---

## 5. Existing Navigation and Pages

| Page | Path | SEO Status | Description |
| :--- | :--- | :--- | :--- |
| **Homepage (Hub)** | `/index.html` | `index, follow` | Executive landing page: bio, vitals heartbeat, highlight cards, skills matrix, Thoughts & Market Intelligence drawer. |
| **Portfolio** | `/portfolio/index.html` | `noindex, follow` | In-depth portfolio: MSc background, interactive project studios, research citations, certificates, resume viewer, contact form. |
| **Privacy Notice** | `/privacy.html` | `index, follow` | Legal and privacy disclosures detailing data processing, hosting, Cloudflare analytics, and contact form handling. |
| **404 Not Found** | `/404.html` | `noindex, follow` | Branded error recovery page directing users back to the homepage or portfolio. |

---

## 6. Existing Profile & Knowledge Base Data (Candidate Source of Truth)

The AI chatbot's knowledge base can be extracted directly from verified, public assets currently in the repository:

1. **Identity & Education:**
   - **Full Name:** Raghavendra Golla
   - **Location:** Chandigarh, India
   - **Current Degree:** Master of Science (MSc) in Data Science, Chandigarh University (2025 – Expected June 2027). Focus on advanced statistical modeling and distributed systems.
   - **Undergraduate Degree:** Bachelor of Science (BSc) in Mathematics, Krishna University, Andhra Pradesh (2017 – 2020).
2. **Current Career Objective:**
   - Actively seeking Data Analyst, Machine Learning Intern, or Junior Data Scientist roles (Remote or Relocation).
3. **Technical Skill Matrix:**
   - **Data Analysis & Processing:** Python, Pandas, NumPy, Data Cleaning, Exploratory Data Analysis (EDA), Feature Engineering.
   - **SQL & Databases:** Advanced SQL (CTEs, Window Functions, Complex Joins, Aggregations), SQLite, MongoDB.
   - **Visualization & BI:** Power BI, Microsoft Excel, Streamlit, Matplotlib, Seaborn, Plotly.
   - **Machine Learning & Modeling:** Scikit-Learn, PyTorch, Linear/Logistic Regression, Random Forest, XGBoost, Support Vector Machines (SVM), Explainable AI (SHAP, LIME).
   - **Languages:** English, Telugu, Hindi, German (Elementary).
4. **Primary Research (MSc Dissertation in Progress):**
   - **Title:** *Cross-Dataset Evaluation of Machine Learning Models for Heart Disease Prediction*
   - **Supervisor:** Dr. Naveen Kumar Mani
   - **Repository:** `github.com/raghavendragolla/cvd`
   - **Key Finding:** Harmonized 4 UCI heart disease cohorts (918 patient records), ran 24 cross-dataset transfer experiments; established that high in-cohort ROC-AUC does not guarantee generalizable or calibrated risk prediction under dataset shift.
5. **Key Featured Projects:**
   - **Tech Trends & Skills Analysis (IBM Capstone):** Analyzed 11,398 developer survey responses combined with 27,005 job postings; wrote 10 analytical SQL queries on SQLite; tested hypotheses using Mann-Whitney U, Welch's t-test, and Chi-square; deployed interactive Streamlit dashboard (`ibm-capstone.streamlit.app`).
   - **California Housing Demographic Analytics:** Compared 3 regression models on 20,640 records; Gradient Boosting achieved $R^2 = 0.84$ vs $0.60$ linear baseline; deployed interactive Streamlit map app (`house-price-prediction-raghav.streamlit.app`).
   - **Work Experience:** Machine Learning Intern at SmartED Innovations (Jan 2026 – Mar 2026).
6. **Verified Certifications:**
   - **IBM Data Analyst Professional Certificate** (Coursera / IBM, Apr 2026).
   - **Machine Learning Certificate** (SmartED Innovations, Mar 2026).
7. **Contact & Social Profiles:**
   - Email: `raghavendrayadavgolla@gmail.com`
   - LinkedIn: `https://www.linkedin.com/in/raghavendragolla`
   - GitHub: `https://github.com/raghavendragolla`
   - Website: `https://www.raghavendragolla.com/`

---

## 7. Cloudflare Worker API Integration Feasibility

### Can the static frontend communicate with a Cloudflare Worker?
**Yes, seamlessly.**
The architecture requires zero changes to the underlying GitHub Pages hosting. Communication occurs via standard browser `fetch()` requests from the frontend client to the Cloudflare Worker endpoint.

### Recommended Backend Architecture (Cloudflare Workers + Workers AI)
```
┌────────────────────────────────┐         HTTPS POST /chat         ┌─────────────────────────────────┐
│     raghavendragolla.com       │  ──────────────────────────────> │   ai.raghavendragolla.com       │
│                                │                                  │   (Cloudflare Worker Edge)      │
│  - Vanilla JS Chat Widget      │  <────────────────────────────── │                                 │
│  - Theme-Aware CSS UI          │      Server-Sent Events (SSE)    │   - CORS & Origin Guard         │
│  - Zero API Secrets in Client  │         Streaming Response       │   - IP Rate Limiter (Cache API) │
└────────────────────────────────┘                                  │   - Strict System Prompt & RAG  │
                                                                    └────────────────┬────────────────┘
                                                                                     │
                                                                    env.AI.run(...)  │ Cloudflare Internal
                                                                    (Zero API Key)   │ Tensor Network
                                                                                     ▼
                                                                    ┌─────────────────────────────────┐
                                                                    │      Cloudflare Workers AI      │
                                                                    │   @cf/meta/llama-3.2-3b-instruct │
                                                                    │   (Free: 10,000 Neurons/day)    │
                                                                    └─────────────────────────────────┘
```

1. **Free Cloudflare Workers AI Model Allocation:**
   - **Model:** `@cf/meta/llama-3.2-3b-instruct` (or `@cf/meta/llama-3.1-8b-instruct`).
   - **Cost:** **$0.00** (Included in Cloudflare's free tier of 10,000 Neurons/day).
   - **Execution:** Runs natively via the Cloudflare V8 runtime binding:
     ```javascript
     const response = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
       messages: [
         { role: 'system', content: RAGHAVENDRA_SYSTEM_PROMPT },
         ...userConversationHistory
       ],
       stream: true,
       max_tokens: 300
     });
     ```
2. **Zero Secrets in Frontend:**
   - The frontend never holds an API token or private key.
   - The worker runs inside Cloudflare's authenticated edge boundary using native environment bindings (`env.AI`).
3. **Low Latency & Real-Time Streaming:**
   - The worker streams tokens using Server-Sent Events (SSE) (`text/event-stream`).
   - The client consumes the stream with `ReadableStreamDefaultReader` on `response.body`, producing an immediate, real-time typing effect with sub-500ms Time-to-First-Token (TTFT).

---

## 8. Potential Integration Conflicts & Security Concerns

### A. Content Security Policy (CSP) Restrictions (Critical)
- **Current Situation:**
  `index.html` restricts network connections:
  `connect-src 'self' https://cloudflareinsights.com https://career.raghavendragolla.com;`
  `portfolio/index.html` restricts:
  `connect-src 'self' https://cloudflareinsights.com https://api.web3forms.com;`
- **Impact:** Any `fetch()` to an unlisted origin will be blocked by the browser.
- **Required Resolution:**
  The Cloudflare Worker domain (e.g. `https://ai.raghavendragolla.com`) must be added to `connect-src` in the `<meta http-equiv="Content-Security-Policy">` of both pages.
- **Verification Rule:** Updating the HTML will require updating the inline script hashes if touched, and running `npm run verify:csp` to guarantee build compliance.

### B. Service Worker Precache Management
- **Current Situation:**
  `sw.js` precaches 37 static assets. `scripts/verify-precache.js` verifies that every precache asset exists on disk.
- **Impact:**
  - Dynamic chat API requests to `https://ai.raghavendragolla.com/chat` must **bypass the service worker cache** (network-only).
  - New static assets (`chatbot.js`, `chatbot.css`) should either be registered in `sw.js` and `verify-precache.js` with an asset version bump (`ASSET_VERSION = 'v24.6'`), or loaded as standard static files.

### C. UI Stacking & Layout Collision (Z-Index & Mobile Layout)
- **Portfolio Collision:**
  In `portfolio/index.html`, a `.back-to-top-btn` sits at `bottom: 28px; right: 28px;` (`z-index: 99`). A bottom-right floating chat button must not overlap it.
  *Solution:* Position the Chatbot FAB at `bottom: 84px; right: 28px;` on the portfolio page (stacked above the back-to-top button), or position the Chatbot FAB at `bottom: 24px; right: 24px;` and shift `.back-to-top-btn` to the left (`right: 80px;`).
- **Thoughts Drawer Collision:**
  On the homepage, the existing `.thoughts-drawer` uses `z-index: 9999`. The Chatbot modal/drawer should use a coordinated `z-index` (e.g., `9990`) and automatically close the chat if the thoughts drawer opens (or vice versa) to prevent conflicting body scroll locks.

### D. Rate Limiting & Neuron Exhaustion
- **Risk:** Malicious visitors or web scrapers could send automated queries and drain the 10,000 neurons/day free allocation.
- **Mitigation on Cloudflare Worker:**
  1. **Origin Verification:** Reject requests whose `Origin` header is not `https://www.raghavendragolla.com`, `https://raghavendragolla.com`, or `http://localhost:8080`.
  2. **Edge IP Rate Limiting:** Enforce a limit of 5 requests per minute per IP using the Cloudflare Cache API.
  3. **Input Sanitization:** Reject prompts longer than 400 characters.
  4. **Output Token Cap:** Set `max_tokens: 300` per answer.
  5. **Context Window Cap:** Retain only the last 4 conversation turns (2 user, 2 assistant) to minimize input tokens.

### E. Prompt Injection & Hallucination Guardrails
- **Risk:** Attackers might prompt the LLM to ignore instructions, output harmful content, or invent false qualifications.
- **Mitigation:**
  A hardened system prompt with strict boundary instructions:
  - *"You are the AI portfolio assistant for Raghavendra Golla. Your sole role is to answer questions regarding Raghavendra's professional experience, research, projects, education, and skills based exclusively on the provided context."*
  - *"If asked about unrelated topics (e.g., coding assistance, homework, general knowledge, or creative writing), politely decline and redirect the visitor to Raghavendra's portfolio."*
  - *"Never invent projects, grades, or employment history not explicitly stated in your context."*

---

## 9. Recommended Chatbot Integration Location

### Recommended UI Approach: Hybrid Floating Dock + Slide-Out Drawer / Floating Card

1. **Floating Trigger Pill (FAB):**
   - Placed in the bottom-right corner across all pages (`index.html`, `portfolio/index.html`, `404.html`, `privacy.html`).
   - Compact, non-intrusive design:
     - Avatar / Sparkle icon `✦` + label *"Ask AI"* (collapses to an icon on mobile screens $< 640\text{px}$).
     - Subtle status dot showing green *"Ready"*.
     - Positioned with `env(safe-area-inset-bottom)` awareness.
2. **Chat Window / Panel:**
   - **Desktop ($\ge 768\text{px}$):** Floating card docked in the bottom-right (`width: 380px; height: 520px; border-radius: 16px; box-shadow: var(--shadow-lg)`).
   - **Mobile ($< 768\text{px}$):** Bottom sheet modal sliding up (`height: 85dvh; width: 100%`) with swipe-to-dismiss.
3. **Quick Suggestion Starter Chips:**
   - *"Tell me about your MSc heart disease research"*
   - *"What are your top skills in Data Science & SQL?"*
   - *"Walk me through the IBM capstone project"*
   - *"Are you available for an internship?"*
4. **Theme Synchronization:**
   - Uses the existing CSS token architecture (`var(--bg)`, `var(--surface)`, `var(--text)`, `var(--primary)`, `var(--border)`).
   - Works immediately in both Light Mode and Dark Mode without extra CSS overrides.

---

## 10. Required Files for Future Implementation

When you are ready to proceed with implementation, the following files will be created or updated:

### Inside this Repository (`raghavendrayadavgolla/raghavendragolla-website`)

| Action | Path | Purpose |
| :--- | :--- | :--- |
| **Create** | `assets/css/shared/chatbot.css` | Styles for the floating trigger, message bubbles, streaming cursor, quick pills, and responsive dialog. |
| **Create** | `assets/js/chatbot.js` | Zero-dependency client: handles open/close, SSE streaming fetch, history management, quick-pill clicks, and focus trapping. |
| **Modify** | `index.html` & `portfolio/index.html` | Add chatbot HTML markup template, script tag, and update CSP `connect-src` with `https://ai.raghavendragolla.com`. |
| **Modify** | `404.html` & `privacy.html` | Update CSP `connect-src` for consistency. Update `privacy.html` with plain-language disclosure of real-time AI query processing. |
| **Modify** | `sw.js` & `scripts/verify-precache.js` | Include `chatbot.css` and `chatbot.js` in static precache with version bump (`v24.6`). Ensure `/chat` API bypasses cache. |

### In a Separate Cloudflare Worker Project (e.g. `raghavendragolla-ai-worker`)
*(Can live in a separate GitHub repo or in a `.gitignore` / `_config.yml` excluded folder)*

| File | Purpose |
| :--- | :--- |
| `wrangler.toml` | Cloudflare Worker configuration, routes, and `[ai]` binding. |
| `src/index.js` | Edge router, CORS handling, IP rate limiting, prompt construction with Raghavendra's knowledge base, and streaming `env.AI.run()` call. |
| `src/knowledge.js` | Structured, token-optimized factual profile data for Raghavendra Golla. |

---

## 11. Recommended Step-by-Step Implementation Roadmap

```
Phase 1: Cloudflare Worker Deployment
  ├── Step 1: Initialize Cloudflare Worker project with Wrangler
  ├── Step 2: Configure [ai] binding for @cf/meta/llama-3.2-3b-instruct
  ├── Step 3: Implement CORS, rate limiting, and structured knowledge prompt
  ├── Step 4: Deploy to custom route (https://ai.raghavendragolla.com)
  └── Step 5: Test streaming response with curl / Postman

Phase 2: Frontend Integration in Website
  ├── Step 1: Create assets/css/shared/chatbot.css using existing design tokens
  ├── Step 2: Create assets/js/chatbot.js with native SSE streaming and a11y focus trap
  ├── Step 3: Insert chat widget markup into index.html and portfolio/index.html
  ├── Step 4: Update CSP connect-src and verify hashes (npm run verify:csp)
  ├── Step 5: Update Service Worker precache and test offline behavior
  └── Step 6: Update privacy.html with data processing disclosure

Phase 3: Verification & Automated CI Gate
  ├── Step 1: Run full quality suite (npm run lint, validate, verify)
  ├── Step 2: Test Light Mode & Dark Mode visual fidelity
  ├── Step 3: Test mobile keyboard open/close and viewport resizing (100dvh)
  ├── Step 4: Run Playwright accessibility tests (zero axe violations)
  └── Step 5: Commit and tag release
```

---

## Conclusion
Integrating a free, privacy-first, edge-accelerated AI chatbot into **raghavendragolla.com** is completely feasible with zero architectural redesign, zero paid subscriptions, and zero API secret exposure. All necessary components are mapped and ready for execution upon your approval.
