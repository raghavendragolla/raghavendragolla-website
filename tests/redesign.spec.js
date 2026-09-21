import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test.describe('Google Pomelli Redesign Preview (/redesign/)', () => {
  test('renders /redesign/ with correct metadata, headings, and zero console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto('/redesign/');
    expect(response?.status()).toBe(200);
    expect(consoleErrors).toHaveLength(0);

    // Verify robots meta is noindex, nofollow (SEO safety)
    const robots = await page.getAttribute('meta[name="robots"]', 'content');
    expect(robots).toBe('noindex, nofollow');

    // Title and Hero Headline
    await expect(page).toHaveTitle(/Pomelli Redesign Preview/);
    const heroTitle = page.locator('#hero-heading');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText('Turning data into');
    await expect(heroTitle).toContainText('predictive models.');

    // 4 Capabilities Cards
    const cards = page.locator('.domain-card');
    await expect(cards).toHaveCount(4);

    // Research & Values
    await expect(page.locator('#research-heading')).toBeVisible();
    await expect(page.locator('#values-heading')).toBeVisible();
    await expect(page.locator('#methodology-heading')).toBeVisible();
  });

  test('no horizontal overflow across viewports', async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('/redesign/');
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow).toBe(false);
    }
  });

  test('accessible mobile navigation toggle and keyboard escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/redesign/');

    const menuBtn = page.locator('#mobileMenuBtn');
    await expect(menuBtn).toBeVisible();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');

    await menuBtn.click();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    const nav = page.locator('.site-nav');
    await expect(nav).toHaveClass(/mobile-nav-active/);

    await page.keyboard.press('Escape');
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).not.toHaveClass(/mobile-nav-active/);
  });

  test('has no detectable accessibility violations in Light mode', async ({ page }) => {
    await page.goto('/redesign/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
