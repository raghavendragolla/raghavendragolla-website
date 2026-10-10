/**
 * Production Smoke Suite
 * ---------------------------------------------------------------------------
 * Verifies the LIVE site (https://www.raghavendragolla.com) against what the
 * repository claims. This is the check that closes the "production is never
 * verified" gap: every other suite validates the local server, so a stale
 * deploy, a partial deploy, or a wrong sitemap could previously pass CI.
 *
 * OPT-IN. The whole file skips unless PRODUCTION_SMOKE=1:
 *     npm run test:smoke
 *
 * It targets absolute production URLs (not the `baseURL: localhost:8080` used
 * by the local suites), so it needs no web server and can run from CI after a
 * deployment.
 *
 * EXPECTED vs UNEXPECTED
 * Cloudflare sits in front of the origin and legitimately rewrites HTML. The
 * list below records those tolerated conditions so that genuine problems stand
 * out. Expected conditions never fail a test; they are reported as annotations.
 *
 * NOTE: this suite is served by a different runner than the local suites; it
 * deliberately asserts the project's intentional SEO strategy (portfolio is
 * noindex) rather than "correcting" it.
 */

const { test, expect } = require('@playwright/test');

const PROD = 'https://www.raghavendragolla.com';
const ENABLED = process.env.PRODUCTION_SMOKE === '1';

/** Conditions that are expected on production and must not fail the run. */
const EXPECTED = {
  // Cloudflare Email Address Obfuscation rewrites mailto: links in transit.
  emailObfuscation: '/cdn-cgi/l/email-protection',
  // Cloudflare's injected analytics beacon is deliberately blocked by the
  // site's own CSP, which is why a console error for this host is tolerated.
  analyticsBeaconHost: 'cloudflareinsights.com',
  // No HTTP security headers are configured yet (tracked as a separate task);
  // their absence is recorded rather than asserted.
  missingSecurityHeaders: [
    'strict-transport-security',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'x-frame-options'
  ]
};

test.describe.configure({ mode: 'serial' });

// Skip the entire file unless explicitly enabled.
test.beforeEach(() => {
  test.skip(!ENABLED, 'Set PRODUCTION_SMOKE=1 to run production smoke tests.');
});

test.describe('Production Smoke (live site)', () => {
  test.describe('HTTP status codes', () => {
    const expect200 = [
      '/',
      '/index.html',
      '/portfolio/',
      '/privacy.html',
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.json',
      '/sw.js',
      '/portfolio/resume/resume.pdf',
      '/portfolio/resume/resume.docx'
    ];

    for (const path of expect200) {
      test(`200 for ${path}`, async ({ request }) => {
        const res = await request.get(PROD + path, { maxRedirects: 0 });
        expect(res.status(), `${path} should return 200`).toBe(200);
      });
    }

    test('404 for an unknown path', async ({ request }) => {
      const res = await request.get(PROD + '/definitely-not-a-real-page-xyz', { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  });

  test.describe('Redirects', () => {
    test('/portfolio redirects to /portfolio/', async ({ request }) => {
      const res = await request.get(PROD + '/portfolio', { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      expect(res.headers()['location']).toContain('/portfolio/');
    });

    test('/redesign redirects to /redesign/', async ({ request }) => {
      const res = await request.get(PROD + '/redesign', { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      expect(res.headers()['location']).toContain('/redesign/');
    });
  });

  test.describe('Canonical URLs and SEO directives', () => {
    test('landing page canonical points at the www origin', async ({ page }) => {
      await page.goto(PROD + '/');
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe('https://www.raghavendragolla.com/');
    });

    test('landing page is indexable', async ({ page }) => {
      await page.goto(PROD + '/');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('index');
    });

    test('portfolio is intentionally noindex, follow', async ({ page }) => {
      await page.goto(PROD + '/portfolio/');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
      expect(robots).toContain('follow');
    });

    test('redesign preview is noindex, nofollow', async ({ page }) => {
      await page.goto(PROD + '/redesign/');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
      expect(robots).toContain('nofollow');
    });
  });

  test.describe('robots.txt', () => {
    test('declares a sitemap and does not block the portfolio', async ({ request }) => {
      const res = await request.get(PROD + '/robots.txt');
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body).toContain('Sitemap:');
      expect(body).not.toMatch(/Disallow:\s*\/portfolio/);
    });
  });

  test.describe('sitemap.xml', () => {
    test('lists the root URL and excludes the noindex portfolio', async ({ request }) => {
      const res = await request.get(PROD + '/sitemap.xml');
      expect(res.status()).toBe(200);
      const body = await res.text();
      const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

      expect(locs).toContain('https://www.raghavendragolla.com/');
      expect(locs.some((l) => l.includes('/portfolio'))).toBe(false);
      // Every loc must use the canonical host.
      for (const loc of locs) {
        expect(loc.startsWith('https://www.raghavendragolla.com'), `non-canonical loc: ${loc}`).toBe(true);
      }
    });
  });

  test.describe('Resume PDF', () => {
    test('is a valid PDF and points at the correct GitHub profile', async ({ request }) => {
      const res = await request.get(PROD + '/portfolio/resume/resume.pdf');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('pdf');

      const body = await res.body();
      expect(body.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const raw = body.toString('latin1');

      // Collect every github.com/... link embedded as a PDF URI action.
      const githubLinks = [...new Set([...raw.matchAll(/github\.com\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]))];
      expect(githubLinks.length, 'resume should embed a GitHub link').toBeGreaterThan(0);

      // The known-broken handle (a dead 404 account) must never reappear.
      // NOTE: only the github.com URL is checked -- the published contact
      // address legitimately begins with a similar stem
      // (raghavendrayadavgolla@gmail.com), so a bare substring test on that
      // stem would be a false positive.
      expect(githubLinks, 'resume must not link the dead GitHub account')
        .not.toContain('raghavendrayadavgolla');

      // And the correct profile must be present.
      expect(githubLinks).toContain('raghavendragolla');
    });
  });

  test.describe('Service worker and asset version agreement', () => {
    test('sw.js declares an ASSET_VERSION that matches the live HTML', async ({ request }) => {
      const swRes = await request.get(PROD + '/sw.js');
      expect(swRes.status()).toBe(200);
      const sw = await swRes.text();

      const match = sw.match(/ASSET_VERSION\s*=\s*'([^']+)'/);
      expect(match, 'ASSET_VERSION must be declared in sw.js').toBeTruthy();
      const swVersion = match[1];
      expect(swVersion).toMatch(/^v\d+\.\d+$/);

      // Modules that are deliberately versioned independently of the core
      // asset stack. push.js is a self-contained module with its own release
      // cadence, so it must NOT be forced to match ASSET_VERSION.
      const INDEPENDENTLY_VERSIONED = ['push.js'];

      // A partial deploy would leave the HTML referencing a different version
      // than the one the service worker precaches.
      const htmlRes = await request.get(PROD + '/');
      const html = await htmlRes.text();

      const refs = [...html.matchAll(/\/([A-Za-z0-9._-]+)\?v=([\d.]+)/g)]
        .map((m) => ({ file: m[1], version: 'v' + m[2] }));

      expect(refs.length, 'HTML should version its assets').toBeGreaterThan(0);

      const mismatched = refs
        .filter((r) => !INDEPENDENTLY_VERSIONED.includes(r.file))
        .filter((r) => r.version !== swVersion)
        .map((r) => `${r.file} -> ${r.version}`);

      expect(mismatched,
        `assets ${JSON.stringify(mismatched)} disagree with sw.js ASSET_VERSION ${swVersion}`)
        .toEqual([]);

      // The core stack must actually carry the SW version (guards against an
      // assertion that passes only because nothing was checked).
      const coreVersions = [...new Set(
        refs.filter((r) => !INDEPENDENTLY_VERSIONED.includes(r.file)).map((r) => r.version)
      )];
      expect(coreVersions).toContain(swVersion);
    });
  });

  test.describe('Assets referenced by the portfolio', () => {
    test('every profile image referenced returns 200', async ({ request }) => {
      const html = await (await request.get(PROD + '/portfolio/')).text();

      const paths = [...new Set(
        [...html.matchAll(/\/portfolio\/images\/profile\/[A-Za-z0-9._-]+/g)].map((m) => m[0])
      )];

      expect(paths.length, 'portfolio should reference profile images').toBeGreaterThan(0);

      for (const p of paths) {
        const r = await request.get(PROD + p, { maxRedirects: 0 });
        expect(r.status(), `${p} should be available`).toBe(200);
      }
    });

    test('all same-origin internal links on the landing page resolve', async ({ request }) => {
      const html = await (await request.get(PROD + '/')).text();
      const hrefs = [...new Set(
        [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1])
      )].filter((h) => !h.startsWith('//'));

      expect(hrefs.length).toBeGreaterThan(0);

      const broken = [];
      for (const href of hrefs) {
        const r = await request.get(PROD + href, { maxRedirects: 5 });
        if (r.status() >= 400) broken.push(`${href} -> ${r.status()}`);
      }
      expect(broken, `broken internal links: ${broken.join(', ')}`).toEqual([]);
    });
  });

  test.describe('Content Security Policy is present', () => {
    for (const path of ['/', '/portfolio/']) {
      test(`CSP meta on ${path} declares default-src 'none' and a script hash`, async ({ page }) => {
        await page.goto(PROD + path);
        const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
        expect(csp, 'CSP meta tag must exist').toBeTruthy();
        expect(csp).toContain("default-src 'none'");
        expect(csp).toMatch(/'sha256-[A-Za-z0-9+/=]+'/);
      });
    }
  });

  test.describe('Console hygiene', () => {
    for (const path of ['/', '/portfolio/']) {
      test(`no unexpected console errors on ${path}`, async ({ page }) => {
        const errors = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto(PROD + path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);

        // Tolerate only the known Cloudflare beacon being blocked by our CSP.
        const unexpected = errors.filter((e) => !e.includes(EXPECTED.analyticsBeaconHost));
        expect(unexpected, `unexpected console errors: ${unexpected.join(' | ')}`).toEqual([]);
      });
    }
  });

  test.describe('Expected third-party conditions (informational)', () => {
    test('records which expected Cloudflare conditions are present', async ({ page, request }) => {
      const observed = [];

      await page.goto(PROD + '/');
      const html = await (await request.get(PROD + '/')).text();

      if (html.includes(EXPECTED.emailObfuscation)) {
        observed.push('Cloudflare email obfuscation is active');
      }
      if (html.includes(EXPECTED.analyticsBeaconHost)) {
        observed.push('Cloudflare analytics beacon is injected (and blocked by CSP)');
      }

      const headers = (await request.get(PROD + '/')).headers();
      const missing = EXPECTED.missingSecurityHeaders.filter((h) => !(h in headers));
      if (missing.length) {
        observed.push(`HTTP security headers still absent: ${missing.join(', ')}`);
      }

      test.info().annotations.push({ type: 'production-expected', description: observed.join('; ') });
      // Informational only: never fails.
      expect(true).toBe(true);
    });
  });
});
