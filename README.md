# Raghavendra Golla - Personal Portfolio & Website

> **"Turning data into intelligent solutions."**

Welcome to the official repository for [raghavendragolla.com](https://www.raghavendragolla.com/). This is a modern, lightweight, high-performance personal landing page and portfolio built with semantic HTML5, custom CSS3, and vanilla JavaScript (no frameworks or bundler dependencies).

## ✨ Core Features & Technical Highlights

- **Consolidated Shared Tokens & Theme Engine**: Unified HSL design tokens (`css/shared/tokens.css`) supporting system dark mode (`prefers-color-scheme`), native `color-scheme` CSS declarations, zero-FOUC initialization, and safe `rg:theme` storage.
- **High-Performance Neural Particle Canvas**: Hardware-accelerated 2D canvas with automatic 30 FPS frame throttling, Retina DPR scaling, dynamic color updates, and `IntersectionObserver` pause/resume.
- **WCAG 2.1 AA Accessibility**: Built-in skip link (`#main-content`), ARIA dialogs (`role="dialog" aria-modal="true"`), accessible focus-trap and keyboard ESC handling for modal dialogs (`window.setupAccessibleModal`).
- **PWA & Offline Service Worker**: Service Worker (`sw.js`) with cache-first static asset caching, custom 404 fallback page, and 30-day banner dismissal management (`rg:pwa-dismissed`).
- **Responsive Layout & Mobile Viewports**: Modern layout handling using CSS Grid & Flexbox, with `100dvh` dynamic viewport unit support for seamless rendering on mobile browsers.
- **SEO & Structured Data**: Open Graph (`og:image`, `og:title`), Twitter Cards, Schema.org `Person` JSON-LD structured data, `robots.txt`, and `sitemap.xml`.

## 📁 Repository Structure

```
.
├── 404.html                     # Custom 404 Error Page
├── CNAME                        # Custom domain declaration for GitHub Pages
├── README.md                    # Repository documentation (not published)
├── _config.yml                  # GitHub Pages publishing rules: excludes dev/test files and /redesign/
├── index.html                   # Main Landing Page
├── manifest.json                # Web App Manifest
├── robots.txt                   # Search Engine Crawler Guidance
├── sitemap.xml                  # XML Sitemap for SEO
├── sw.js                        # Service Worker (Cache management & offline navigation)
├── assets/
│   ├── css/
│   │   ├── animations.css       # Keyframe animations (pulse, fade, float)
│   │   ├── responsive.css       # Breakpoint media queries
│   │   ├── style.css            # Landing page layout & card styling
│   │   └── shared/
│   │       ├── components.css   # Shared UI components & toasts
│   │       ├── fonts.css        # Self-hosted @font-face rules + metric-matched Fraunces fallbacks
│   │       └── tokens.css       # Consolidated design tokens & theme rules
│   ├── favicon/                 # Web App icons & favicons
│   ├── images/
│   │   └── og-image.jpg         # Open Graph social preview banner
│   └── js/
│       ├── push.js              # Career Radar Web Push notifications
│       ├── script.js            # Main page controller & tilt effects
│       └── shared.js            # System engine (Theme, Modal A11y, IST Clock, Toast, SW)
└── portfolio/
    ├── index.html               # Full Portfolio Page
    ├── certificates/            # Verified credential media assets
    ├── css/                     # Portfolio specific styles
    ├── images/                  # Profile avatar images and sized derivatives
    ├── js/
    │   └── script.js            # Portfolio page controller & contact form handler
    └── resume/                  # One-page PDF resume
```

`redesign/`, `scripts/`, `tests/` and the Node tooling files stay in the repository for
development but are excluded from the published site by `_config.yml`
(guarded by `tests/deploy-exclusions.spec.js`).

## 🚀 Local Development

You can run this project locally using any static web server:

```bash
# Python 3
python -m http.server 8000

# Node.js npx http-server
npx http-server .
```

Then navigate to `http://localhost:8000` in your browser.

`npm start` runs `scripts/test-server.js`, which mirrors production routing
(trailing-slash redirects, real 404 status). `npm run check` runs linting, HTML
validation, CSP/precache/privacy verification and the Playwright suites.

When CSS or JS changes, bump the `?v=` query on every reference **and**
`ASSET_VERSION` in `sw.js` together so returning visitors get the new files.

## 🔐 Hosting & Edge Configuration (outside this repository)

GitHub Pages cannot set arbitrary response headers, so these live in Cloudflare.
They are documented here because they cannot be verified from the code:

| Setting | Where | Purpose |
| --- | --- | --- |
| Always Use HTTPS | Cloudflare › SSL/TLS › Edge Certificates | Redirect every `http://` request to `https://` |
| HSTS (staged, no preload at first) | Cloudflare › SSL/TLS › Edge Certificates | Only after HTTPS redirects are verified stable |
| `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` + `Content-Security-Policy: frame-ancestors 'none'` | Cloudflare › Rules › Transform Rules (response headers) | Headers a meta CSP cannot provide |
| `X-Robots-Tag: noindex` on `/portfolio/resume/*` and `/portfolio/certificates/*` | Cloudflare › Rules › Transform Rules (response headers) | Keep documents out of search results |
| Web Analytics (automatic setup) | Cloudflare › Analytics & Logs › Web Analytics | Cookieless analytics; the page CSPs allow `static.cloudflareinsights.com` and `cloudflareinsights.com` |
| Email Address Obfuscation | Cloudflare › Scrape Shield | Described in `privacy.html` section 4 — update the notice if this changes |

The portfolio page itself is intentionally `noindex, follow`, excluded from the
sitemap, and **not** disallowed in `robots.txt` (crawlers must be able to read the
noindex directive).

---
© Raghavendra Golla. All rights reserved.
