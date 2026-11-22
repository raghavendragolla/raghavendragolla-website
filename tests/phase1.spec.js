const { test, expect } = require('@playwright/test');

// Phase 1 regression suite (performance + Ask GORA reliability).
// Every Ask GORA request is mocked: these tests never reach the live Worker.

const CHAT_URL = 'https://ai.raghavendragolla.com/chat';
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function blockAnalytics(page) {
  await page.route('https://static.cloudflareinsights.com/**', route => route.abort());
}

// chatbot.css is inserted by chatbot.js on first intent; a synthetic focus event triggers that
// without putting the launcher into a hover or focus-visible state.
async function activateChatbotCss(page) {
  await page.evaluate(() => document.getElementById('askGoraLauncher').dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => [...document.styleSheets].some(s => (s.href || '').includes('chatbot.css')));
}

async function sendChat(page, text) {
  await page.locator('#askGoraLauncher').click();
  await page.locator('#askGoraInput').fill(text);
  await page.locator('#askGoraInput').press('Enter');
}

test.describe('Ask GORA: request timeout handling', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
    // Shorten the 15 s production timeout so the suite stays fast.
    await page.addInitScript(() => { window.GORA_TIMEOUT_MS = 1500; });
  });

  test('a request that never responds shows an informative timeout card, and Try again recovers', async ({ page }) => {
    let calls = 0;
    await page.route(CHAT_URL, async route => {
      calls++;
      if (calls === 1) return; // never fulfilled: simulates a hung inference
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Recovered answer.' }) });
    });

    await page.goto('/');
    await sendChat(page, 'What projects has he built?');
    await expect(page.locator('#askGoraTyping')).toBeVisible();

    const card = page.locator('.ask-gora-msg-error');
    await expect(card).toBeVisible({ timeout: 6000 });
    await expect(card.locator('.ask-gora-error-title')).toHaveText('GORA is taking longer than usual');
    await expect(card.locator('.ask-gora-error-text')).toContainText('did not arrive within 2 seconds');
    await expect(page.locator('#askGoraTyping')).toHaveCount(0);
    await expect(page.locator('#askGoraInput')).toBeEnabled();

    await card.locator('.ask-gora-retry-btn').click();
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('Recovered answer.');
    await expect(page.locator('.ask-gora-msg-error')).toHaveCount(0);
    expect(calls).toBe(2);
    // The retried question is not duplicated, and the successful turn is kept in history
    await expect(page.locator('.ask-gora-msg-user')).toHaveCount(1);
    const state = await page.evaluate(() => window.AskGORA.getState());
    expect(state.historyLength).toBe(2);
    expect(state.isLoading).toBe(false);
  });

  test('closing during a hung request still discards it silently (no late timeout card)', async ({ page }) => {
    await page.route(CHAT_URL, () => { /* never fulfilled */ });
    await page.goto('/');
    await sendChat(page, 'Hello?');
    await expect(page.locator('#askGoraTyping')).toBeVisible();

    await page.locator('#askGoraCloseBtn').click();
    await page.waitForTimeout(2500); // longer than the 1.5 s timeout
    await page.locator('#askGoraLauncher').click();

    await expect(page.locator('.ask-gora-msg-error')).toHaveCount(0);
    await expect(page.locator('.ask-gora-msg-user')).toHaveCount(0);
    await expect(page.locator('.ask-gora-chip').first()).toBeVisible();
  });

  test('minimizing during a hung request keeps it; the timeout card is waiting when reopened', async ({ page }) => {
    await page.route(CHAT_URL, () => { /* never fulfilled */ });
    await page.goto('/portfolio/');
    await sendChat(page, 'Tell me about his research');
    await page.locator('#askGoraMinimizeBtn').click();
    await page.waitForTimeout(2500);
    await page.locator('#askGoraLauncher').click();

    await expect(page.locator('.ask-gora-msg-user')).toHaveText(/Tell me about his research/);
    await expect(page.locator('.ask-gora-msg-error .ask-gora-error-title')).toHaveText('GORA is taking longer than usual');
  });
});

test.describe('Ask GORA: daily budget / quota fallback', () => {
  for (const code of ['DAILY_BUDGET_REACHED', 'AI_QUOTA_EXCEEDED']) {
    test(`${code} shows the backend fallbackReply instead of "temporarily busy"`, async ({ page }) => {
      await blockAnalytics(page);
      await page.route(CHAT_URL, route => route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'limit', error_code: code, fallbackReply: 'Ask GORA has reached its daily limit. Please use the contact page.' })
      }));
      await page.goto('/');
      await sendChat(page, 'Are you there?');

      const card = page.locator('.ask-gora-msg-error');
      await expect(card.locator('.ask-gora-error-title')).toHaveText('GORA is resting for today');
      await expect(card.locator('.ask-gora-error-text')).toHaveText('Ask GORA has reached its daily limit. Please use the contact page.');
      await expect(card.locator('.ask-gora-retry-btn')).toBeVisible();
    });
  }
});

test.describe('Ask GORA: chatbot.css no longer blocks first paint', () => {
  for (const path of ['/', '/portfolio/']) {
    test(`${path}: chatbot.css is async, launcher is styled before it loads, panel works after`, async ({ page, request }) => {
      // 1. Markup: only a prefetch hint during load (chatbot.js inserts the stylesheet on intent);
      //    the only real stylesheet reference is the <noscript> fallback.
      const html = await (await request.get(path)).text();
      expect(html).toMatch(/<link rel="prefetch" href="\/assets\/css\/shared\/chatbot\.css\?v=[\d.]+" as="style" data-gora-css>/);
      expect(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')).not.toMatch(/<link rel="stylesheet" href="\/assets\/css\/shared\/chatbot\.css/);

      // 2. Hold chatbot.css back for 2.5 s: the launcher must already look right from the inline critical styles
      await blockAnalytics(page);
      let releaseCss;
      const cssGate = new Promise(resolve => { releaseCss = resolve; });
      await page.route('**/assets/css/shared/chatbot.css*', async route => { await cssGate; await route.continue(); });
      await page.goto(path, { waitUntil: 'domcontentloaded' });

      const snapshot = () => page.evaluate(() => {
        const l = document.getElementById('askGoraLauncher');
        const cs = getComputedStyle(l);
        const r = l.getBoundingClientRect();
        const icon = document.querySelector('.ask-gora-launcher-icon').getBoundingClientRect();
        return {
          loaded: [...document.styleSheets].some(s => (s.href || '').includes('chatbot.css')),
          panelDisplay: getComputedStyle(document.getElementById('askGoraPanel')).display,
          launcher: {
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            icon: [Math.round(icon.width), Math.round(icon.height)],
            position: cs.position, display: cs.display, radius: cs.borderTopLeftRadius,
            background: cs.backgroundColor, border: cs.borderTopColor, color: cs.color,
            font: `${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}`, shadow: cs.boxShadow, backdrop: cs.backdropFilter
          }
        };
      });

      // Web fonts load independently of chatbot.css; wait for them so text widths are comparable.
      await page.evaluate(() => document.fonts.ready);
      const early = await snapshot();
      expect(early.loaded).toBe(false);
      expect(early.launcher.position).toBe('fixed');
      expect(early.launcher.rect[3]).toBe(46);
      expect(early.panelDisplay).toBe('none'); // still [hidden]

      // 3. Release the prefetch: once downloaded the file still is not part of the style engine
      //    (no style recalculation during page load) until the visitor shows intent.
      releaseCss();
      await page.waitForResponse(r => r.url().includes('/assets/css/shared/chatbot.css'));
      await page.waitForLoadState('load');
      await page.waitForTimeout(1000);
      expect(await page.evaluate(() => [...document.styleSheets].some(s => (s.href || '').includes('chatbot.css')))).toBe(false);

      // 4. On intent the stylesheet applies; the launcher must not move or restyle, and the panel works
      await activateChatbotCss(page);
      const late = await snapshot();
      expect(late.launcher).toEqual(early.launcher);
      await page.locator('#askGoraLauncher').click();
      const panel = page.locator('#askGoraPanel');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(panel).toHaveCSS('display', 'flex');
      await expect(page.locator('#askGoraInput')).toBeVisible();
      await expect(page.locator('#askGoraInput')).toBeEditable();
    });
  }
});

test.describe('Mobile rendering performance (<= 768px)', () => {
  test('homepage: glows are static, CTA border settles, launcher and dark footer drop live blur', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await page.addInitScript(() => { try { localStorage.setItem('rg:theme', 'dark'); } catch { /* storage unavailable */ } });
    await page.goto('/');
    await activateChatbotCss(page);

    const r = await page.evaluate(() => {
      const cs = sel => getComputedStyle(document.querySelector(sel));
      return {
        glows: ['.ambient-glow-1', '.ambient-glow-2', '.ambient-glow-3', '.aurora-sun', '.aurora-swoosh'].map(s => cs(s).animationName),
        glowFilter: getComputedStyle(document.querySelector('.ambient-glow-1'), '::before').filter, // blur is painted by the glow's ::before
        enterIterations: cs('.enter').animationIterationCount,
        launcherBackdrop: cs('#askGoraLauncher').backdropFilter,
        footerBackdrop: cs('.footer-container').backdropFilter
      };
    });
    expect(r.glows).toEqual(['none', 'none', 'none', 'none', 'none']);
    expect(r.glowFilter).toContain('blur'); // the glow look itself is kept
    expect(r.enterIterations).toBe('2');
    expect(r.launcherBackdrop).toBe('none');
    expect(r.footerBackdrop).toBe('none');
    await ctx.close();
  });

  test('portfolio: glows are static and the launcher drops live blur', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await page.goto('/portfolio/');
    await activateChatbotCss(page);
    const r = await page.evaluate(() => ({
      glows: ['.ambient-glow-1', '.ambient-glow-2'].map(s => getComputedStyle(document.querySelector(s)).animationName),
      launcherBackdrop: getComputedStyle(document.getElementById('askGoraLauncher')).backdropFilter
    }));
    expect(r.glows).toEqual(['none', 'none']);
    expect(r.launcherBackdrop).toBe('none');
    await ctx.close();
  });

  test('desktop keeps the animated glows, spinning CTA and launcher glass', async ({ page }) => {
    await blockAnalytics(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await activateChatbotCss(page);
    const r = await page.evaluate(() => ({
      glow: getComputedStyle(document.querySelector('.ambient-glow-1')).animationName,
      enterIterations: getComputedStyle(document.querySelector('.enter')).animationIterationCount,
      launcherBackdrop: getComputedStyle(document.getElementById('askGoraLauncher')).backdropFilter
    }));
    expect(r.glow).toBe('floatGlow1');
    expect(r.enterIterations).toBe('infinite');
    expect(r.launcherBackdrop).toContain('blur');
  });
});

// Counts canvas frames by wrapping clearRect (called once per drawn frame) and records shadowBlur use.
async function instrumentCanvas(page) {
  await page.addInitScript(() => {
    window.__canvasFrames = 0;
    window.__shadowBlurSets = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const clear = proto.clearRect;
    proto.clearRect = function (...args) {
      if (this.canvas && this.canvas.id === 'neural-canvas') window.__canvasFrames++;
      return clear.apply(this, args);
    };
    const desc = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
    Object.defineProperty(proto, 'shadowBlur', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { if (v > 0) window.__shadowBlurSets++; desc.set.call(this, v); }
    });
  });
}

async function framesOverOneSecond(page) {
  return page.evaluate(() => new Promise(resolve => {
    const start = window.__canvasFrames;
    setTimeout(() => resolve(window.__canvasFrames - start), 1000);
  }));
}

test.describe('Neural canvas performance', () => {
  test('homepage mobile: canvas starts after load and is capped near 30 fps', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await instrumentCanvas(page);
    await page.goto('/');
    await page.waitForFunction(() => window.__canvasFrames > 0, null, { timeout: 4000 });
    const frames = await framesOverOneSecond(page);
    expect(frames).toBeGreaterThan(5);
    expect(frames).toBeLessThanOrEqual(36);
    await ctx.close();
  });

  test('homepage desktop: wave glow no longer uses ctx.shadowBlur', async ({ page }) => {
    await blockAnalytics(page);
    await instrumentCanvas(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.__canvasFrames > 10, null, { timeout: 5000 });
    expect(await page.evaluate(() => window.__shadowBlurSets)).toBe(0);
  });

  test('portfolio mobile: canvas pauses when the hero is scrolled away and resumes at the top', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await instrumentCanvas(page);
    await page.goto('/portfolio/');
    await page.waitForFunction(() => window.__canvasFrames > 0, null, { timeout: 5000 });

    await page.evaluate(() => document.getElementById('contact').scrollIntoView({ behavior: 'instant', block: 'start' }));
    await page.waitForTimeout(400);
    expect(await framesOverOneSecond(page)).toBe(0);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => {
      if (window.__resumeStart === undefined) window.__resumeStart = window.__canvasFrames;
      return window.__canvasFrames - window.__resumeStart > 3;
    }, null, { timeout: 4000 });
    await ctx.close();
  });

  test('reduced motion: canvas renders a static frame and does not loop', async ({ browser }) => {
    const ctx = await browser.newContext({ ...MOBILE, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await instrumentCanvas(page);
    await page.goto('/');
    await page.waitForTimeout(1500);
    expect(await framesOverOneSecond(page)).toBeLessThanOrEqual(1);
    await ctx.close();
  });
});

test.describe('Ask GORA: first open without prior hover (touch / keyboard / programmatic)', () => {
  test('opening via a real tap applies the stylesheet and shows the panel fully', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.locator('#askGoraLauncher').tap();
    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS('opacity', '1');
    await expect(page.locator('.ask-gora-chip').first()).toBeVisible();
    await ctx.close();
  });

  test('window.AskGORA.open() works before any launcher interaction', async ({ page }) => {
    await blockAnalytics(page);
    await page.goto('/portfolio/');
    await page.waitForLoadState('load');
    await page.evaluate(() => window.AskGORA.open());
    await expect(page.locator('#askGoraPanel')).toHaveCSS('opacity', '1');
    await expect(page.locator('#askGoraPanel')).toHaveCSS('display', 'flex');
  });
});

test.describe('Ask GORA: explicit error codes (cleanup)', () => {
  const cases = [
    { name: 'per-IP 429 RATE_LIMITED', status: 429, body: { error: 'x', error_code: 'RATE_LIMITED' }, title: 'GORA is temporarily busy' },
    { name: '503 AI_BUSY (Workers AI 3040)', status: 503, body: { error: 'x', error_code: 'AI_BUSY', fallbackReply: 'busy' }, title: 'GORA is temporarily busy' },
    { name: '500 AI_UNAVAILABLE', status: 500, body: { error: 'x', error_code: 'AI_UNAVAILABLE', fallbackReply: 'down' }, title: 'A little hiccup!' },
    { name: '503 BUDGET_UNAVAILABLE', status: 503, body: { error: 'x', error_code: 'BUDGET_UNAVAILABLE', fallbackReply: 'down' }, title: 'A little hiccup!' },
    { name: '429 with an unknown code', status: 429, body: { error: 'limit exceeded', error_code: 'SOMETHING_NEW' }, title: 'A little hiccup!' },
    { name: '429 without any code (older backend)', status: 429, body: { error: 'Rate limit exceeded' }, title: 'GORA is temporarily busy' }
  ];
  for (const c of cases) {
    test(`${c.name} never shows "resting for today", and Try again works`, async ({ page }) => {
      await blockAnalytics(page);
      let calls = 0;
      await page.route(CHAT_URL, route => {
        calls++;
        if (calls === 1) return route.fulfill({ status: c.status, contentType: 'application/json', body: JSON.stringify(c.body) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Second try worked.' }) });
      });
      await page.goto('/');
      await sendChat(page, 'Hello');
      const card = page.locator('.ask-gora-msg-error');
      await expect(card.locator('.ask-gora-error-title')).toHaveText(c.title);
      await expect(page.getByText('GORA is resting for today')).toHaveCount(0);
      await card.locator('.ask-gora-retry-btn').click();
      await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('Second try worked.');
    });
  }
});

test.describe('Accessibility names (cleanup)', () => {
  test('portfolio "Main Site" link has an accessible name on phones and desktop, without a tooltip', async ({ browser }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await blockAnalytics(page);
      await page.goto('/portfolio/');
      const link = page.locator('a.back-hub');
      await expect(page.getByRole('link', { name: 'Main Site', exact: true })).toHaveCount(1);
      await expect(link).not.toHaveAttribute('title', /.*/);
      await ctx.close();
    }
  });

  test('chat launcher accessible name contains its visible text (WCAG 2.5.3), without a tooltip', async ({ page }) => {
    for (const path of ['/', '/portfolio/']) {
      await blockAnalytics(page);
      await page.goto(path);
      const launcher = page.getByRole('button', { name: 'Ask GORA AI Assistant', exact: true });
      await expect(launcher).toHaveCount(1);
      await expect(launcher).toHaveAttribute('aria-expanded', 'false');
      await expect(launcher).not.toHaveAttribute('title', /.*/);
    }
  });
});

// Back-button support for the Ask GORA panel and its interaction with the portfolio project filter.
test.describe('Ask GORA: browser Back button (cleanup)', () => {
  async function startFrom(page, path, viewport = { width: 1440, height: 900 }) {
    await page.setViewportSize(viewport);
    await blockAnalytics(page);
    await page.goto('/404.html');                       // a previous history entry to go Back to
    await page.goto(path);
    await page.waitForLoadState('load');
  }
  const chatOpen = (page) => page.evaluate(() => window.AskGORA.getState().isOpen);
  const activeFilter = (page) => page.evaluate(() => document.querySelector('.filter-btn.active').dataset.filter);

  for (const path of ['/', '/portfolio/']) {
    test(`${path}: open -> Back minimizes and stays on the page; reopen -> minimize/close buttons -> Back leaves`, async ({ page }) => {
      await startFrom(page, path);
      await page.locator('#askGoraLauncher').click();
      await expect.poll(() => chatOpen(page)).toBe(true);
      await page.goBack();
      await expect.poll(() => chatOpen(page)).toBe(false);
      expect(new URL(page.url()).pathname).toBe(path);

      await page.locator('#askGoraLauncher').click();
      await expect.poll(() => chatOpen(page)).toBe(true);
      await page.locator('#askGoraMinimizeBtn').click();
      await expect.poll(() => chatOpen(page)).toBe(false);
      await page.locator('#askGoraLauncher').click();
      await expect.poll(() => chatOpen(page)).toBe(true);
      await page.locator('#askGoraCloseBtn').click();
      await expect.poll(() => chatOpen(page)).toBe(false);
      expect(new URL(page.url()).pathname).toBe(path);

      await page.goBack(); // no leftover panel entry: the very next Back leaves the page
      await expect(page).toHaveURL(/\/404\.html$/);
    });
  }

  test('portfolio: a filter chosen while the panel is open survives Minimize and Back (URL and UI agree)', async ({ page }) => {
    await startFrom(page, '/portfolio/');
    await page.locator('#askGoraLauncher').click();
    await expect.poll(() => chatOpen(page)).toBe(true);
    await page.locator('.filter-btn[data-filter="ml"]').click();
    await page.locator('#askGoraMinimizeBtn').click();
    await expect.poll(() => chatOpen(page)).toBe(false);
    await expect(page).toHaveURL(/#filter=ml$/);
    expect(await activeFilter(page)).toBe('ml');
    await page.goBack();
    await expect(page).toHaveURL(/\/404\.html$/); // no dead Back press
  });

  test('portfolio: a filter chosen while the panel is open survives browser Back', async ({ page }) => {
    await startFrom(page, '/portfolio/');
    await page.locator('#askGoraLauncher').click();
    await expect.poll(() => chatOpen(page)).toBe(true);
    await page.locator('.filter-btn[data-filter="ml"]').click();
    await page.goBack();
    await expect.poll(() => chatOpen(page)).toBe(false);
    await expect(page).toHaveURL(/#filter=ml$/);
    expect(await activeFilter(page)).toBe('ml');
    await expect(page.locator('.project-card:visible')).toHaveCount(3);
  });

  test('portfolio: the project filter alone still adds no history entries', async ({ page }) => {
    await startFrom(page, '/portfolio/');
    const lengthBefore = await page.evaluate(() => history.length);
    for (const f of ['ml', 'all', 'analytics']) await page.locator(`.filter-btn[data-filter="${f}"]`).click();
    await expect(page).toHaveURL(/#filter=analytics$/);
    expect(await page.evaluate(() => history.length)).toBe(lengthBefore);
    await page.goBack();
    await expect(page).toHaveURL(/\/404\.html$/);
  });

  test('portfolio: following an in-page anchor keeps the panel open; Back returns to it, then minimizes', async ({ page }) => {
    await startFrom(page, '/portfolio/');
    await page.locator('#askGoraLauncher').click();
    await expect.poll(() => chatOpen(page)).toBe(true);
    await page.evaluate(() => { location.hash = '#projects'; });
    await expect(page).toHaveURL(/#projects$/);
    expect(await chatOpen(page)).toBe(true);
    await page.goBack();
    await expect.poll(() => chatOpen(page)).toBe(true);
    await page.goBack();
    await expect.poll(() => chatOpen(page)).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/404\.html$/);
  });

  test('mobile: Back closes the full-screen panel instead of leaving the site', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await blockAnalytics(page);
    await page.goto('/404.html');
    await page.goto('/portfolio/');
    await page.waitForLoadState('load');
    await page.locator('#askGoraLauncher').tap();
    await expect(page.locator('#askGoraPanel')).toHaveCSS('opacity', '1');
    await page.goBack();
    await expect.poll(() => chatOpen(page)).toBe(false);
    await expect(page).toHaveURL(/\/portfolio\/$/);
    await expect(page.locator('body')).not.toHaveClass(/gora-scroll-lock/);
    await ctx.close();
  });

  test('reload while the panel is open leaves no stale panel entry', async ({ page }) => {
    await startFrom(page, '/');
    await page.locator('#askGoraLauncher').click();
    await expect.poll(() => chatOpen(page)).toBe(true);
    await page.reload();
    await page.waitForLoadState('load');
    expect(await chatOpen(page)).toBe(false);
    expect(await page.evaluate(() => history.state && history.state.askGoraOpen)).toBeFalsy();
  });
});
