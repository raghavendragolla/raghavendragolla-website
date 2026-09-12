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
    // Request /portfolio on server that does NOT redirect
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
});
