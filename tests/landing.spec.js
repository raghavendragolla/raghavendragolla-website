const { test, expect } = require('@playwright/test');

test.describe('Landing Page (/index.html)', () => {
  test('renders without console errors or warnings', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    expect(errors).toEqual([]);
  });

  test('skip link is the first tab stop and becomes visible upon focus', async ({ page }) => {
    await page.goto('/');
    const skipLink = page.locator('a.skip-link');
    
    // Tab into the page
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
  });

  test('theme toggle switches theme and persists preference in storage', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.locator('#theme-toggle');

    const initialTheme = await html.getAttribute('data-theme');
    await toggle.click();
    
    const switchedTheme = await html.getAttribute('data-theme');
    expect(switchedTheme).not.toBe(initialTheme);

    // Reload page to assert persistence
    await page.reload();
    const persistedTheme = await html.getAttribute('data-theme');
    expect(persistedTheme).toBe(switchedTheme);
  });

  test('Phase 1 guards: no visitor-count element and no counterapi string in scripts', async ({ page }) => {
    await page.goto('/');
    const visitorCountEl = page.locator('#visitor-count');
    await expect(visitorCountEl).toHaveCount(0);

    const scriptContents = await page.$$eval('script:not([src])', scripts => scripts.map(s => s.textContent).join(' '));
    expect(scriptContents).not.toContain('counterapi');
    expect(scriptContents).not.toContain('cached_visits');
  });

  test('Thoughts Drawer WAI-ARIA Tab pattern: roving tabindex and arrow key navigation', async ({ page }) => {
    await page.goto('/');
    const openBtn = page.locator('#thoughts-footer-btn');
    await openBtn.click();

    const drawer = page.locator('#thoughtsDrawer');
    await expect(drawer).toHaveClass(/active/);

    const tabThoughts = page.locator('#tab-thoughts');
    const tabNow = page.locator('#tab-now');
    const tabMarket = page.locator('#tab-market');

    // Thoughts tab initially active and tabindex=0
    await expect(tabThoughts).toHaveAttribute('aria-selected', 'true');
    await expect(tabThoughts).toHaveAttribute('tabindex', '0');
    await expect(tabNow).toHaveAttribute('tabindex', '-1');

    // ArrowRight moves focus to Now tab and activates it
    await tabThoughts.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabNow).toBeFocused();
    await expect(tabNow).toHaveAttribute('aria-selected', 'true');
    await expect(tabNow).toHaveAttribute('tabindex', '0');
    await expect(tabThoughts).toHaveAttribute('tabindex', '-1');

    // ArrowRight moves focus to Market tab
    await page.keyboard.press('ArrowRight');
    await expect(tabMarket).toBeFocused();
    await expect(tabMarket).toHaveAttribute('aria-selected', 'true');

    // ArrowRight wraps around to first tab (Thoughts)
    await page.keyboard.press('ArrowRight');
    await expect(tabThoughts).toBeFocused();
    await expect(tabThoughts).toHaveAttribute('aria-selected', 'true');

    // Escape closes the drawer
    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/active/);
  });

  test('deterministic canvas rAF loop: no duplicate callbacks share identical timestamp', async ({ page }) => {
    await page.goto('/');

    // Instrument requestAnimationFrame to collect canvas callback invocation timestamps
    await page.evaluate(() => {
      window.__canvasRafTimestamps = [];
      const originalRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        return originalRaf(function (time) {
          if (cb.name === 'animateCanvas' || cb.name === 'renderFrame' || cb.toString().includes('clearRect')) {
            window.__canvasRafTimestamps.push(time);
          }
          cb(time);
        });
      };
    });

    // Repeatedly toggle tab visibility to test against visibility change listener leakage
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(50);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(50);
    }

    // Sample for 1 second
    await page.waitForTimeout(1000);

    const countsPerTimestamp = await page.evaluate(() => {
      const counts = {};
      for (const t of window.__canvasRafTimestamps) {
        counts[t] = (counts[t] || 0) + 1;
      }
      return Object.values(counts);
    });

    // Every animation frame must have at most 1 canvas rAF callback
    expect(countsPerTimestamp.length).toBeGreaterThan(0);
    const maxPerFrame = Math.max(...countsPerTimestamp);
    expect(maxPerFrame).toBe(1);
  });
});
