/**
 * Cross-Browser Smoke Suite
 * ---------------------------------------------------------------------------
 * A deliberately SMALL, high-value suite that runs on Firefox and WebKit (and
 * Chromium) to catch engine-specific breakage that the Chromium-only
 * behavioural suites cannot see.
 *
 * Scope is intentionally narrow — navigation, theme toggle, a dialog, the
 * contact form's client-side validation, the tab pattern, responsive layout,
 * service-worker registration and scroll restoration. Anything deeper belongs
 * in the dedicated per-page suites.
 *
 * Run all three engines:  npm run test:cross-browser
 * Run one engine:         npx playwright test --project=webkit-smoke
 */

const { test, expect } = require('@playwright/test');

test.describe('Cross-Browser Smoke', () => {
  test('landing page renders with its primary landmarks and headings', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');

    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.enter')).toBeVisible();
    await expect(page).toHaveTitle(/Raghavendra Golla/);

    expect(errors).toEqual([]);
  });

  test('portfolio page renders its shell and hero', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/portfolio/');

    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('theme toggle switches theme and persists across navigation', async ({ page }) => {
    await page.goto('/');

    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));

    await page.locator('#theme-toggle').click();

    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));

    expect(after).not.toBe(before);

    // Persisted into storage and applied on the next document.
    await page.goto('/portfolio/');
    const persisted = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));
    expect(persisted).toBe(after);
  });

  test('thoughts drawer dialog opens, is modal, and closes on Escape', async ({ page }) => {
    await page.goto('/');

    const trigger = page.locator('#thoughts-footer-btn');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const drawer = page.locator('#thoughtsDrawer');
    await expect(drawer).toHaveAttribute('aria-hidden', 'false');

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  });

  test('contact form blocks an invalid email before submitting', async ({ page }) => {
    await page.goto('/portfolio/');

    // The form must not navigate away when validation fails.
    await page.locator('#senderName').fill('Smoke Tester');
    await page.locator('#senderEmail').fill('not-an-email');
    await page.locator('#senderMessage').fill('Cross-browser validation check.');

    const beforeUrl = page.url();
    await page.locator('#submitBtn').click();

    // Either native constraint validation or the custom handler must intervene.
    await page.waitForTimeout(500);
    expect(page.url()).toBe(beforeUrl);

    const invalid = await page.locator('#senderEmail').evaluate((el) => ({
      ariaInvalid: el.getAttribute('aria-invalid'),
      valid: el.checkValidity(),
    }));
    expect(invalid.valid).toBe(false);
  });

  test('dashboard tab pattern responds to arrow keys', async ({ page }) => {
    await page.goto('/');

    // The tablist lives inside the thoughts drawer, so it must be opened first.
    await page.locator('#thoughts-footer-btn').click();

    const firstTab = page.locator('#tab-thoughts');
    await expect(firstTab).toBeVisible();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');

    // Exactly one tab must be selected at all times.
    const selected = await page.locator('[role="tab"][aria-selected="true"]').count();
    expect(selected).toBe(1);
  });

  test('no horizontal overflow at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('service worker registers successfully', async ({ page }) => {
    await page.goto('/');

    const registered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? 'registered' : 'none';
    });

    // WebKit/Firefox may run the SW differently in a test harness; only fail
    // when the API is supported but registration genuinely did not happen.
    if (registered !== 'unsupported') {
      expect(registered).toBe('registered');
    }
  });

  test('reload from a scrolled position returns to the top', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);

    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeLessThan(50);
  });
});
