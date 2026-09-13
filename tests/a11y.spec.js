const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('Accessibility Scans & Keyboard Audits (@axe-core/playwright)', () => {
  const pagesToTest = [
    { name: 'Landing Page', url: '/' },
    { name: 'Portfolio Page', url: '/portfolio/' },
    { name: '404 Page', url: '/404.html' },
    { name: 'Privacy Page', url: '/privacy.html' }
  ];

  for (const pageInfo of pagesToTest) {
    test(`${pageInfo.name} has no detectable a11y violations in Light Mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(pageInfo.url);
      await page.evaluate(() => {
        localStorage.removeItem('theme');
        localStorage.removeItem('rg:theme');
        document.documentElement.removeAttribute('data-theme');
        const style = document.createElement('style');
        style.textContent = '* { transition: none !important; animation: none !important; }';
        document.head.appendChild(style);
      });
      await page.waitForTimeout(100);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test(`${pageInfo.name} has no detectable a11y violations in Dark Mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(pageInfo.url);
      await page.evaluate(() => {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('rg:theme', 'dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        const style = document.createElement('style');
        style.textContent = '* { transition: none !important; animation: none !important; }';
        document.head.appendChild(style);
      });
      await page.waitForTimeout(100);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }

  test('Focus visible check: interactive elements display distinct focus ring on keyboard navigation', async ({ page }) => {
    await page.goto('/');
    
    // Tab into the theme toggle
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // theme toggle
    
    const focusedEl = page.locator(':focus');
    const outline = await focusedEl.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle || style.boxShadow;
    });

    expect(outline).not.toBe('none');
  });
});
