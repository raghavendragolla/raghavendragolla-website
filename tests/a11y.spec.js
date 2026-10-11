const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('Accessibility Scans & Keyboard Audits (@axe-core/playwright)', () => {
  const pagesToTest = [
    { name: 'Landing Page', url: '/' },
    { name: 'Portfolio Page', url: '/portfolio/' },
    { name: '404 Page', url: '/404.html' },
    { name: 'Privacy Page', url: '/privacy.html' }
  ];

  // The portfolio page fires a live fetch() to the real GitHub API (via
  // requestIdleCallback, with no timeout) that rewrites part of the DOM
  // whenever it resolves. Left unmocked, that network call can land at an
  // unpredictable moment — including mid-scan — making the a11y scan
  // non-deterministic. Block it so every run sees the same static,
  // already-accessible markup.
  async function stabilizePage(page) {
    await page.route('https://api.github.com/**', route => route.abort());
    await page.route('https://api.web3forms.com/**', route => route.abort());
  }

  async function settleAndInjectStyle(page, applyStyles, arg) {
    await page.evaluate(applyStyles, arg);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(150);
  }

  for (const pageInfo of pagesToTest) {
    test(`${pageInfo.name} has no detectable a11y violations in Light Mode`, async ({ page }) => {
      await stabilizePage(page);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(pageInfo.url);
      await settleAndInjectStyle(page, () => {
        localStorage.removeItem('theme');
        localStorage.removeItem('rg:theme');
        document.documentElement.removeAttribute('data-theme');
        const style = document.createElement('style');
        style.textContent = '* { transition: none !important; animation: none !important; }';
        document.head.appendChild(style);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test(`${pageInfo.name} has no detectable a11y violations in Dark Mode`, async ({ page }) => {
      await stabilizePage(page);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(pageInfo.url);
      await settleAndInjectStyle(page, () => {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('rg:theme', 'dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        const style = document.createElement('style');
        style.textContent = '* { transition: none !important; animation: none !important; }';
        document.head.appendChild(style);
      });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }

  // -------------------------------------------------------------------------
  // Phone-width scans, including WCAG 2.2 AA rules (e.g. 2.5.8 Target Size).
  //
  // The desktop scans above missed a real contrast failure: the Streamlit link
  // in `.demo-disclaimer` measured 4.47:1 against the card background that only
  // appears at narrow widths. These scans run at a 390 px viewport in both
  // themes so layout-dependent colours and target sizes are covered too.
  // -------------------------------------------------------------------------
  for (const pageInfo of pagesToTest) {
    for (const theme of ['light', 'dark']) {
      test(`${pageInfo.name} has no WCAG 2.2 AA violations at 390px in ${theme} mode`, async ({ page }) => {
        await stabilizePage(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(pageInfo.url);
        await settleAndInjectStyle(page, (t) => {
          localStorage.setItem('theme', t);
          localStorage.setItem('rg:theme', t);
          document.documentElement.setAttribute('data-theme', t);
          const style = document.createElement('style');
          style.textContent = '* { transition: none !important; animation: none !important; }';
          document.head.appendChild(style);
        }, theme);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();

        const describe = results.violations.flatMap(v =>
          v.nodes.map(n => `${v.id}: ${n.target}`));
        expect(describe).toEqual([]);
      });
    }
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

  // -------------------------------------------------------------------------
  // WCAG 2.5.3 "Label in Name" (Level A)
  //
  // The `label-content-name-mismatch` rule is tagged `experimental` upstream, so
  // it is NOT part of the `wcag2a/wcag2aa/wcag21a/wcag21aa` tag set used by the
  // scans above, and it is also absent from an untagged default scan. A real
  // Level-A violation therefore shipped once while these tests reported zero
  // violations. These tests opt the rule in explicitly so it can never silently
  // disappear again.
  // -------------------------------------------------------------------------
  const labelInNameRule = 'label-content-name-mismatch';

  for (const url of ['/', '/portfolio/', '/404.html', '/privacy.html']) {
    test(`WCAG 2.5.3: visible labels are contained in accessible names on ${url}`, async ({ page }) => {
      await stabilizePage(page);
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withRules([labelInNameRule])
        .analyze();

      const describe = results.violations.flatMap(v =>
        v.nodes.map(n => `${n.target}: ${(n.failureSummary || '').split('\n').pop()}`));

      expect(describe).toEqual([]);
    });
  }

  test('Regression: sidebar theme toggle accessible name contains its visible text', async ({ page }) => {
    await stabilizePage(page);
    await page.goto('/portfolio/');

    const btn = page.locator('#theme-toggle-sidebar');
    await expect(btn).toBeVisible();

    const { visible, aria } = await btn.evaluate(el => ({
      visible: (el.innerText || '').trim(),
      aria: el.getAttribute('aria-label') || ''
    }));

    expect(visible.length).toBeGreaterThan(0);
    // WCAG 2.5.3: the accessible name must contain the visible label text.
    expect(aria.toLowerCase()).toContain(visible.toLowerCase());
  });
});
