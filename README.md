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
├── README.md                    # Repository documentation
├── index.html                   # Main Landing Page
├── manifest.json                # Web App Manifest
├── robots.txt                   # Search Engine Crawler Guidance
├── sitemap.xml                  # XML Sitemap for SEO
├── sw.js                        # Service Worker (Cache management & offline navigation)
├── css/
│   ├── animations.css           # Keyframe animations (pulse, fade, float)
│   ├── responsive.css           # Breakpoint media queries
│   ├── style.css                # Landing page layout & card styling
│   ├── variables.css            # Base design variables
│   └── shared/
│       ├── components.css       # Shared UI components & toasts
│       └── tokens.css           # Consolidated design tokens & theme rules
├── favicon/                     # Web App icons & favicons
├── images/
│   └── og-image.jpg             # Open Graph social preview banner
├── js/
│   ├── script.js                # Main page controller & tilt effects
│   └── shared.js                # System engine (Theme, Canvas, Modal A11y, IST Clock, Toast, PWA)
└── portfolio/
    ├── index.html               # Full Portfolio & Resume Page
    ├── certificates/            # Verified credential media assets
    ├── css/                     # Portfolio specific styles
    └── js/
        └── script.js            # Portfolio page controller & contact form handler
```

## 🚀 Local Development

You can run this project locally using any static web server:

```bash
# Python 3
python -m http.server 8000

# Node.js npx http-server
npx http-server .
```

Then navigate to `http://localhost:8000` in your browser.

---
© Raghavendra Golla. All rights reserved.
