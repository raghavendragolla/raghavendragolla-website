const { test, expect } = require('@playwright/test');

test.describe('Routing & URL Normalization', () => {
  test('landing page / renders with highlights grid and proper title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Raghavendra Golla/);
    const highlights = page.locator('.highlights-grid');
    await expect(highlights).toBeVisible();
  });

  test('portfolio /portfolio/ renders with grid shell and sticky sidebar', async ({ page }) => {
    await page.goto('/portfolio/');
    const shell = page.locator('.shell');
    await expect(shell).toBeVisible();

    const display = await shell.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('grid');

    const sidebar = page.locator('.sidebar');
    const position = await sidebar.evaluate(el => window.getComputedStyle(el).position);
    expect(position).toBe('sticky');
  });

  test('/portfolio/index.html renders identically to /portfolio/', async ({ page }) => {
    await page.goto('/portfolio/index.html');
    const shell = page.locator('.shell');
    await expect(shell).toBeVisible();
    const display = await shell.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('grid');
  });

  test('TRAP A GUARD: /portfolio (no trailing slash) resolves /portfolio/css/ stylesheets, NOT /css/', async ({ page }) => {
    // The production-faithful test server 301s /portfolio to /portfolio/
    // (Playwright follows the redirect). The resolved page must still load its
    // stylesheets from /portfolio/css/, never the root /css/.
    await page.goto('/portfolio');

    // Verify stylesheets loaded contain /portfolio/css/
    const stylesheetHrefs = await page.$$eval('link[rel="stylesheet"]', links => links.map(l => l.href));
    
    // Every page-specific stylesheet must resolve to /portfolio/css/
    const pageStyles = stylesheetHrefs.filter(href => href.includes('style.css'));
    expect(pageStyles.length).toBeGreaterThan(0);
    for (const href of pageStyles) {
      expect(href).toContain('/portfolio/css/');
      expect(href).not.toMatch(/^https?:\/\/[^/]+\/css\/style\.css/);
    }

    // Shell must still render as grid
    const shell = page.locator('.shell');
    await expect(shell).toBeVisible();
    const display = await shell.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('grid');
  });

  test('404 page renders and navigation back to / works', async ({ page }) => {
    const response = await page.goto('/non-existent-page-test-404');
    expect(response.status()).toBe(404);
    await expect(page.locator('.error-code')).toHaveText('404');
    
    // Link back to /
    const homeLink = page.locator('a.error-btn[href="/"]');
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL(/localhost:8080\/$/);
  });

  test('privacy page /privacy.html renders with valid content and links', async ({ page }) => {
    await page.goto('/privacy.html');
    await expect(page).toHaveTitle(/Privacy Notice/);
    await expect(page.locator('h1')).toContainText('Privacy Notice');
  });

  const viewports = [
    { name: 'Desktop (1440px)', width: 1440, height: 900 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Mobile (390px)', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    test(`Responsive verification: no horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const routes = ['/', '/portfolio/', '/404.html', '/privacy.html'];
      for (const route of routes) {
        await page.goto(route);
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasOverflow).toBe(false);
      }
    });
  }

  test('404 page theme toggle switches theme and persists preference', async ({ page }) => {
    await page.goto('/404.html');
    const html = page.locator('html');
    const toggle = page.locator('#theme-toggle');

    await expect(toggle).toBeVisible();
    const initialTheme = (await html.getAttribute('data-theme')) || 'light';

    await toggle.click();
    const switchedAttr = await html.getAttribute('data-theme');
    const switchedTheme = switchedAttr || 'light';
    expect(switchedTheme).not.toBe(initialTheme);

    // Verify localStorage persistence
    const storedTheme = await page.evaluate(() => localStorage.getItem('rg:theme') || localStorage.getItem('theme'));
    expect(storedTheme).toBe(switchedTheme);

    // Reload 404 and ensure persistence
    await page.reload();
    const reloadedAttr = await html.getAttribute('data-theme');
    const reloadedTheme = reloadedAttr || 'light';
    expect(reloadedTheme).toBe(switchedTheme);
  });

  test('SEO & Robots directives: / indexed, /portfolio/ strictly noindex, follow, /redesign/ and /404.html noindex', async ({ page }) => {
    // 1. Root landing page
    await page.goto('/');
    const rootRobots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(rootRobots).toMatch(/\bindex\b/i);
    expect(rootRobots).not.toMatch(/\bnoindex\b/i);
    const rootCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(rootCanonical).toBe('https://www.raghavendragolla.com/');

    // 2. Portfolio page
    await page.goto('/portfolio/');
    const portfolioRobots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(portfolioRobots).toBe('noindex, follow');

    // 3. Redesign page
    await page.goto('/redesign/');
    const redesignRobots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(redesignRobots).toContain('noindex');

    // 4. 404 page
    await page.goto('/404.html');
    const notFoundRobots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(notFoundRobots).toContain('noindex');
  });

  test('Sitemap integrity: contains root landing page and strictly excludes /portfolio', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('https://www.raghavendragolla.com/');
    expect(xml).not.toContain('/portfolio');
    expect(xml).not.toContain('portfolio/index.html');
  });

  test('Landing internal links: portfolio links must use /portfolio/, never portfolio/index.html', async ({ page }) => {
    await page.goto('/');
    const links = await page.$$eval('a[href*="portfolio"]', els => els.map(a => a.getAttribute('href')));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).not.toContain('portfolio/index.html');
      expect(href).toMatch(/^(\/portfolio\/|https:\/\/www\.raghavendragolla\.com\/portfolio\/)/);
    }
  });

  test('Resume PDF verification: serves valid PDF starting with %PDF- header', async ({ request }) => {
    const res = await request.get('/portfolio/resume/resume.pdf');
    expect(res.status()).toBe(200);
    const buffer = await res.body();
    const magic = buffer.slice(0, 5).toString('ascii');
    expect(magic).toBe('%PDF-');
  });

  test('Privacy guard: tracked public files do not leak personal phone numbers', async () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '..');

    const phoneRegex = /(?:\+?91[\s.-]?)?[6-9]\d{9}\b/g;

    const filesToCheck = [
      'index.html',
      'portfolio/index.html',
      'privacy.html',
      '404.html',
      'redesign/index.html',
      'assets/js/script.js',
      'assets/js/shared.js',
      'assets/js/push.js',
      'portfolio/js/script.js'
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.join(root, relPath);
      if (fs.existsSync(fullPath)) {
        const text = fs.readFileSync(fullPath, 'utf8');
        const matches = text.match(phoneRegex) || [];
        expect(matches, `Found phone number pattern in ${relPath}`).toEqual([]);
      }
    }
  });
});

