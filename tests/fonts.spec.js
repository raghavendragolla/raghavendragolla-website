const { test, expect } = require('@playwright/test');
const { cmapCodePoints } = require('./helpers/woff2-cmap');

// The Latin faces of Fraunces, IBM Plex Sans and IBM Plex Mono are character subsets
// (scripts/build-fonts.py). These tests read each subset file's real cmap (not a declared
// list) and fail if the site's text needs a character a subset no longer contains.

// Characters the upstream font files never contained either. Before and after subsetting
// they are drawn by the next font in the stack, so they are allowed to fall back.
const FALLBACK_ALL = new Set([
  0x03bc, 0x03c3, // Greek mu, sigma
  0x2190, 0x2192, 0x2197, // arrows
  0x2248, 0x2260, 0x2264, 0x2265, // math
  0x25b9, 0x25cf, // geometric shapes
  0x2600, 0x2615, 0x2699, 0x26a0, 0x26a1, 0x2713, 0x2715, 0x2728, // misc symbols / dingbats
  0xfe0f, // emoji presentation selector
]);
// Characters missing from one family's upstream files only.
const FALLBACK_BY_FAMILY = { Fraunces: new Set([0x2191, 0x2193]) };
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function mayFallBack(family, cp) {
  return FALLBACK_ALL.has(cp) || (FALLBACK_BY_FAMILY[family] || new Set()).has(cp) || PICTOGRAPHIC.test(String.fromCodePoint(cp));
}

/** Parse "U+0020-007E, U+00A0, ..." into a Set of code points. */
function parseUnicodeRange(value) {
  const out = new Set();
  for (const part of value.split(',')) {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-');
    for (let c = parseInt(a, 16); c <= parseInt(b || a, 16); c++) out.add(c);
  }
  return out;
}

/** @font-face rules of the subset files, read from the served fonts.css. */
async function subsetFaces(request) {
  const css = await (await request.get('/assets/css/shared/fonts.css')).text();
  const faces = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) || []) {
    const url = (block.match(/url\('([^']*latin-subset\.woff2)'\)/) || [])[1];
    if (!url) continue;
    faces.push({
      url,
      family: block.match(/font-family:\s*([^;]+);/)[1].trim().replace(/^['"]|['"]$/g, ''),
      style: block.match(/font-style:\s*(\w+)/)[1],
      declared: parseUnicodeRange(block.match(/unicode-range:\s*([^;]+);/)[1]),
    });
  }
  return faces;
}

const cmapCache = new Map();
async function cmapOf(request, url) {
  if (!cmapCache.has(url)) cmapCache.set(url, cmapCodePoints(await (await request.get(url)).body()));
  return cmapCache.get(url);
}

/** Map "Family|style" -> real cmap of the subset file used for that family and style. */
async function coverageByFace(request) {
  const coverage = {};
  for (const face of await subsetFaces(request)) coverage[`${face.family}|${face.style}`] = await cmapOf(request, face.url);
  return coverage;
}

const fmt = (cp) => `"${String.fromCodePoint(cp)}" U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const PAGES = ['/', '/portfolio/', '/privacy.html', '/404.html'];

test.describe('Self-hosted web fonts', () => {
  test('every font file referenced by fonts.css is served as WOFF2', async ({ request }) => {
    const css = await (await request.get('/assets/css/shared/fonts.css')).text();
    const urls = [...new Set(css.match(/\/assets\/fonts\/[^')]+\.woff2/g))];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect((await res.body()).subarray(0, 4).toString('latin1'), `${url} is not WOFF2`).toBe('wOF2');
    }
  });

  test('each subset face declares exactly the characters its file contains', async ({ request }) => {
    const faces = await subsetFaces(request);
    for (const key of ['Fraunces|normal', 'Fraunces|italic', 'IBM Plex Sans|normal', 'IBM Plex Mono|normal']) {
      expect(faces.some((f) => `${f.family}|${f.style}` === key), `${key} subset face`).toBe(true);
    }
    for (const face of faces) {
      const cmap = await cmapOf(request, face.url);
      const declaredOnly = [...face.declared].filter((c) => !cmap.has(c)).map(fmt);
      const undeclared = [...cmap].filter((c) => !face.declared.has(c)).map(fmt);
      expect({ declaredOnly, undeclared }, `${face.url} unicode-range vs real cmap`).toEqual({ declaredOnly: [], undeclared: [] });
    }
  });

  for (const url of PAGES) {
    test(`every character rendered in a subset face is in that face's glyphs on ${url}`, async ({ page, request }) => {
      await page.route('https://api.github.com/**', (route) => route.abort());
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);

      const used = await page.evaluate(() => {
        const out = {};
        const add = (el, text) => {
          const cs = getComputedStyle(el);
          const key = `${cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()}|${cs.fontStyle === 'italic' ? 'italic' : 'normal'}`;
          for (const ch of text) (out[key] = out[key] || new Set()).add(ch.codePointAt(0));
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) if (node.parentElement && node.textContent.trim()) add(node.parentElement, node.textContent);
        // Generated content (::before / ::after) is drawn with the element's pseudo style.
        for (const el of document.body.querySelectorAll('*')) {
          for (const pseudo of ['::before', '::after']) {
            const c = getComputedStyle(el, pseudo).content;
            if (c && c !== 'none' && c !== 'normal' && /^["']/.test(c)) add(el, c.slice(1, -1));
          }
        }
        return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
      });

      const coverage = await coverageByFace(request);
      const missing = [];
      for (const [key, cps] of Object.entries(used)) {
        const cmap = coverage[key];
        if (!cmap) continue; // not a subset face (system fallback font)
        const family = key.split('|')[0];
        for (const cp of cps) {
          if (cp < 0x20 || /\s/.test(String.fromCodePoint(cp)) && cp !== 0x20 && cp !== 0xa0) continue;
          if (!cmap.has(cp) && !mayFallBack(family, cp)) missing.push(`${key}: ${fmt(cp)}`);
        }
      }
      expect(missing, 'characters missing from the subset fonts; add them in scripts/build-fonts.py').toEqual([]);
    });
  }

  test('text in the deployed HTML, scripts and CSS content is covered by every subset face', async ({ request }) => {
    // Covers text that is only shown after interaction (toasts, dialogs, rotating headline, errors),
    // which the rendered-page checks above cannot see on first load.
    const sources = [];
    const seen = new Set();
    for (const pageUrl of PAGES) {
      const html = await (await request.get(pageUrl)).text();
      const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
      const text = visible.replace(/<[^>]+>/g, ' ');
      const attrs = (visible.match(/(?:aria-label|title|alt|placeholder|value|data-[a-z-]+)="[^"]*"/g) || []).join(' ');
      sources.push({ where: pageUrl, text: decodeEntities(`${text} ${attrs}`) });
      for (const [, src] of html.matchAll(/<(?:script[^>]+src|link[^>]+rel="stylesheet"[^>]+href)="(\/[^"?]+)/g)) {
        if (seen.has(src)) continue;
        seen.add(src);
        const body = await (await request.get(src)).text();
        if (src.endsWith('.js')) {
          const literals = body.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
          sources.push({ where: src, text: literals.join(' ').replace(/\\u\{?([0-9a-fA-F]{4,5})\}?/g, (_, h) => String.fromCodePoint(parseInt(h, 16))) });
        } else {
          const contents = [...body.matchAll(/content:\s*(['"])(.*?)\1/g)].map((m) => m[2].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16))));
          sources.push({ where: src, text: contents.join(' ') });
        }
      }
    }
    expect(seen.size, 'scripts and stylesheets scanned').toBeGreaterThan(5);

    const faces = await subsetFaces(request);
    const missing = new Set();
    for (const { where, text } of sources) {
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp < 0x20 || (/\s/.test(ch) && cp !== 0x20 && cp !== 0xa0)) continue;
        for (const face of faces) {
          if (!(await cmapOf(request, face.url)).has(cp) && !mayFallBack(face.family, cp)) {
            missing.add(`${fmt(cp)} (in ${where}) missing from ${face.url}`);
          }
        }
      }
    }
    expect([...missing], 'characters missing from the subset fonts; add them in scripts/build-fonts.py').toEqual([]);
  });
});

/** Decode the HTML entities that appear in the site's markup (named + numeric). */
function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', mdash: '—', ndash: '–',
    hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·',
    rarr: '→', larr: '←', darr: '↓', uarr: '↑', nearr: '↗', times: '×', minus: '−', sup2: '²', asymp: '≈' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return named[e.toLowerCase()] !== undefined ? named[e.toLowerCase()] : m;
  });
}
