# Raghavendra Golla - Personal Portfolio & Website

> **"Turning data into intelligent solutions."**

Welcome to the repository for [raghavendragolla.com](https://www.raghavendragolla.com/). This is a modern, lightweight, high-performance personal landing page and portfolio built with semantic HTML5, custom CSS3, and modern vanilla JavaScript.

## ✨ Features

- **Dark & Light Mode Theme Toggle**: Automatic detection of OS system preferences (`prefers-color-scheme`) with persistent `localStorage` saving.
- **Micro-Animations**: Custom SVG heartbeat pulse line (`.vitals`), glowing CTA hover states, and smooth page transitions.
- **Social Media Bar**: Quick links to GitHub, LinkedIn, Kaggle, and Email with custom SVG icons and subtle hover animations.
- **Interactive Toast System**: Instant copy-to-clipboard email feedback and non-disruptive notifications.
- **SEO & Social Share Ready**: Complete Open Graph (`og:image`, `og:title`), Twitter Cards, Schema.org `Person` JSON-LD structured data, `robots.txt`, and `sitemap.xml`.
- **Fully Responsive**: Tailored layout rules for desktop, laptop, tablet, mobile, and ultra-small screen sizes.

## 📁 File Structure

```
website/
├── CNAME                   # Custom domain declaration for GitHub Pages
├── google9dd676bcc70ae03c.html # Google Search Console verification
├── index.html              # Main HTML markup
├── README.md               # Project documentation
├── robots.txt              # Search engine crawling rules
├── sitemap.xml             # XML Sitemap for SEO
├── css/
│   ├── animations.css      # Keyframes for line draw, pulse, fade, and toast
│   ├── responsive.css      # Media queries for all breakpoints
│   ├── style.css           # Core component styles and layout
│   └── variables.css       # Design tokens (Light & Dark theme variables)
├── favicon/
│   └── favicon.png         # Website favicon icon
├── images/
│   ├── og-image.jpg        # Open Graph social preview banner
│   └── og-image.png        # PNG version of Open Graph image
└── js/
    └── script.js           # Theme switcher logic, toast system, clipboard copy
```

## 🚀 Local Development

You can run this project locally using any simple HTTP server:

```bash
# Python 3
python -m http.server 8000

# Node.js npx http-server
npx http-server .
```

Then visit `http://localhost:8000` in your web browser.

---
© Raghavendra Golla. All rights reserved.
