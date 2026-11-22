const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Ask GORA AI Assistant - End-to-End & Visual Suite', () => {

  const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', 'chatbot-screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('Visual audit: compare computed styles between homepage and portfolio', async ({ page }) => {
    // 1. Audit homepage
    await page.goto('/');
    await page.locator('#askGoraLauncher').click();
    await page.waitForTimeout(300);
    // Compare the settled, unfocused state: input auto-focus timing differs between first and later opens.
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.waitForFunction(() => document.querySelectorAll('#askGoraRoot *, #askGoraPanel').length > 0 && [...document.querySelectorAll('#askGoraPanel, #askGoraPanel *')].every(el => el.getAnimations().length === 0));
    const homeStyles = await page.evaluate(() => {
      const getStyles = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          border: cs.border,
          borderRadius: cs.borderRadius,
          padding: cs.padding,
          margin: cs.margin,
          boxShadow: cs.boxShadow,
          width: cs.width,
          height: cs.height,
          display: cs.display
        };
      };
      return {
        panel: getStyles('#askGoraPanel'),
        header: getStyles('.ask-gora-header'),
        title: getStyles('.ask-gora-title'),
        subtitle: getStyles('.ask-gora-subtitle'),
        minimizeBtn: getStyles('#askGoraMinimizeBtn'),
        closeBtn: getStyles('#askGoraCloseBtn'),
        messages: getStyles('#askGoraMessages'),
        msgBubble: getStyles('.ask-gora-msg-assistant .ask-gora-msg-bubble'),
        chip: getStyles('.ask-gora-chip'),
        footer: getStyles('.ask-gora-footer'),
        inputWrap: getStyles('.ask-gora-input-wrap'),
        input: getStyles('#askGoraInput'),
        sendBtn: getStyles('#askGoraSendBtn')
      };
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'audit-home-1440.png') });

    // 2. Audit portfolio
    await page.goto('/portfolio/');
    await page.locator('#askGoraLauncher').click();
    await page.waitForTimeout(300);
    // Compare the settled, unfocused state: input auto-focus timing differs between first and later opens.
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.waitForFunction(() => document.querySelectorAll('#askGoraRoot *, #askGoraPanel').length > 0 && [...document.querySelectorAll('#askGoraPanel, #askGoraPanel *')].every(el => el.getAnimations().length === 0));
    const portfolioStyles = await page.evaluate(() => {
      const getStyles = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          border: cs.border,
          borderRadius: cs.borderRadius,
          padding: cs.padding,
          margin: cs.margin,
          boxShadow: cs.boxShadow,
          width: cs.width,
          height: cs.height,
          display: cs.display
        };
      };
      return {
        panel: getStyles('#askGoraPanel'),
        header: getStyles('.ask-gora-header'),
        title: getStyles('.ask-gora-title'),
        subtitle: getStyles('.ask-gora-subtitle'),
        minimizeBtn: getStyles('#askGoraMinimizeBtn'),
        closeBtn: getStyles('#askGoraCloseBtn'),
        messages: getStyles('#askGoraMessages'),
        msgBubble: getStyles('.ask-gora-msg-assistant .ask-gora-msg-bubble'),
        chip: getStyles('.ask-gora-chip'),
        footer: getStyles('.ask-gora-footer'),
        inputWrap: getStyles('.ask-gora-input-wrap'),
        input: getStyles('#askGoraInput'),
        sendBtn: getStyles('#askGoraSendBtn')
      };
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'audit-portfolio-1440.png') });

    const totalDiffs = [];
    for (const key of Object.keys(homeStyles)) {
      const h = homeStyles[key];
      const p = portfolioStyles[key];
      for (const prop of Object.keys(h || {})) {
        if (h[prop] !== p[prop]) {
          totalDiffs.push(`${key}.${prop}: HOME="${h[prop]}" vs PORTFOLIO="${p[prop]}"`);
        }
      }
    }
    expect(totalDiffs).toEqual([]);
  });

  const COMPARISON_VIEWPORTS = [
    { name: '320px', width: 320, height: 568 },
    { name: '375px', width: 375, height: 667 },
    { name: '390px', width: 390, height: 844 },
    { name: '430px', width: 430, height: 932 },
    { name: '768px', width: 768, height: 1024 },
    { name: '1024px', width: 1024, height: 768 },
    { name: '1440px', width: 1440, height: 900 },
    { name: '1920px', width: 1920, height: 1080 }
  ];

  for (const vp of COMPARISON_VIEWPORTS) {
    test(`Visual parity: Homepage vs Portfolio at ${vp.name} (Light & Dark)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const theme of ['light', 'dark']) {
        // 1. Measure Homepage
        await page.goto('/');
        await page.evaluate((t) => {
          if (window.rgTheme) window.rgTheme.setTheme(t);
          else if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
          else document.documentElement.removeAttribute('data-theme');
        }, theme);

        const homeLauncher = page.locator('#askGoraLauncher');
        await expect(homeLauncher).toBeVisible();
        await homeLauncher.click();
        const homePanel = page.locator('#askGoraPanel');
        await expect(homePanel).toBeVisible();
        // Measure the settled panel: wait for its open transition to finish on both pages.
        await page.waitForFunction(() => document.getElementById('askGoraPanel').getAnimations().length === 0);

        const homeMetrics = await page.evaluate(() => {
          const panel = document.getElementById('askGoraPanel');
          const header = document.querySelector('.ask-gora-header');
          const title = document.querySelector('.ask-gora-title');
          const inputWrap = document.querySelector('.ask-gora-input-wrap');
          const pBox = panel.getBoundingClientRect();
          const pStyle = window.getComputedStyle(panel);
          const tStyle = window.getComputedStyle(title);
          return {
            width: Math.round(pBox.width),
            height: Math.round(pBox.height),
            padding: pStyle.padding,
            titleFont: tStyle.fontFamily,
            headerHeight: Math.round(header.getBoundingClientRect().height),
            inputWrapHeight: Math.round(inputWrap.getBoundingClientRect().height)
          };
        });

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `compare-home-${theme}-${vp.name}.png`),
          fullPage: false
        });

        // 2. Measure Portfolio
        await page.goto('/portfolio/');
        await page.evaluate((t) => {
          if (window.rgTheme) window.rgTheme.setTheme(t);
          else if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
          else document.documentElement.removeAttribute('data-theme');
        }, theme);

        const portLauncher = page.locator('#askGoraLauncher');
        await expect(portLauncher).toBeVisible();
        await portLauncher.click();
        const portPanel = page.locator('#askGoraPanel');
        await expect(portPanel).toBeVisible();
        // Measure the settled panel: wait for its open transition to finish on both pages.
        await page.waitForFunction(() => document.getElementById('askGoraPanel').getAnimations().length === 0);

        const portMetrics = await page.evaluate(() => {
          const panel = document.getElementById('askGoraPanel');
          const header = document.querySelector('.ask-gora-header');
          const title = document.querySelector('.ask-gora-title');
          const inputWrap = document.querySelector('.ask-gora-input-wrap');
          const pBox = panel.getBoundingClientRect();
          const pStyle = window.getComputedStyle(panel);
          const tStyle = window.getComputedStyle(title);
          return {
            width: Math.round(pBox.width),
            height: Math.round(pBox.height),
            padding: pStyle.padding,
            titleFont: tStyle.fontFamily,
            headerHeight: Math.round(header.getBoundingClientRect().height),
            inputWrapHeight: Math.round(inputWrap.getBoundingClientRect().height)
          };
        });

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `compare-portfolio-${theme}-${vp.name}.png`),
          fullPage: false
        });

        // Assert exact metrics parity (allowing 2px subpixel rounding tolerance due to page scrollbar gutter differences)
        expect(Math.abs(portMetrics.width - homeMetrics.width)).toBeLessThanOrEqual(2);
        expect(Math.abs(portMetrics.height - homeMetrics.height)).toBeLessThanOrEqual(2);
        expect(portMetrics.padding).toBe(homeMetrics.padding);
        expect(portMetrics.titleFont).toBe(homeMetrics.titleFont);
        expect(Math.abs(portMetrics.headerHeight - homeMetrics.headerHeight)).toBeLessThanOrEqual(1);
        expect(Math.abs(portMetrics.inputWrapHeight - homeMetrics.inputWrapHeight)).toBeLessThanOrEqual(1);
      }
    });
  }

  test('Floating launcher is visible and interactive on landing page', async ({ page }) => {
    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    // Click launcher opens panel
    await launcher.click();
    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');

    // Welcome message is displayed
    const welcomeBubble = panel.locator('.ask-gora-msg-assistant').first();
    await expect(welcomeBubble).toContainText("Hello! I'm GORA.");

    // Suggested questions chips exist
    const chips = panel.locator('.ask-gora-chip');
    await expect(chips).toHaveCount(6);

    // Close button closes panel
    const closeBtn = page.locator('#askGoraCloseBtn');
    await closeBtn.click();
    await expect(panel).not.toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');
    await expect(launcher).toBeFocused();
  });

  test('Popup persistence: Clicking outside the popup, clicking background, or pressing Escape does NOT close it', async ({ page }) => {
    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();
    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();

    // 1. Pressing Escape does NOT close chat
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();

    // 2. Clicking outside popup on background / hero does NOT close chat
    const hero = page.locator('#hero');
    if (await hero.count() > 0) {
      await hero.click({ position: { x: 50, y: 50 }, force: true });
      await expect(panel).toBeVisible();
    }

    // 3. Clicking navigation bar does NOT close chat
    const nav = page.locator('nav');
    if (await nav.count() > 0) {
      await nav.first().click({ position: { x: 10, y: 10 }, force: true });
      await expect(panel).toBeVisible();
    }

    // 4. Clicking the body background does NOT close chat
    await page.mouse.click(20, 20);
    await expect(panel).toBeVisible();

    // 5. Only close button (or minimize) closes/hides it
    const closeBtn = page.locator('#askGoraCloseBtn');
    await closeBtn.click();
    await expect(panel).not.toBeVisible();
  });

  test('Minimize (−) button hides popup, preserves conversation history, launcher reopens it', async ({ page }) => {
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: 'Raghavendra is a Data Analyst specializing in Data Science & Machine Learning.' })
      });
    });

    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();

    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();

    // Send a message
    const input = page.locator('#askGoraInput');
    await input.fill('What is your professional title?');
    await input.press('Enter');

    // Wait for assistant response
    const assistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(assistantMsg).toContainText('Data Analyst specializing in Data Science');

    // Type unsubmitted draft text into composer
    await input.fill('Unsubmitted draft text for testing');
    const sendBtn = page.locator('#askGoraSendBtn');
    await expect(sendBtn).toBeEnabled();

    // Click Minimize button (−)
    const minimizeBtn = page.locator('#askGoraMinimizeBtn');
    await expect(minimizeBtn).toBeVisible();
    await expect(minimizeBtn).toHaveAttribute('aria-label', 'Minimize Ask GORA');
    await minimizeBtn.click();

    // Panel is hidden, launcher remains visible
    await expect(panel).not.toBeVisible();
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    // Click launcher to reopen
    await launcher.click();
    await expect(panel).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');

    // Previous user message and assistant response remain completely intact
    const userMsg = panel.locator('.ask-gora-msg-user');
    await expect(userMsg).toContainText('What is your professional title?');
    const restoredAssistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(restoredAssistantMsg).toContainText('Data Analyst specializing in Data Science');

    // Composer input draft text and send button state are completely preserved
    await expect(input).toHaveValue('Unsubmitted draft text for testing');
    await expect(sendBtn).toBeEnabled();
  });

  test('Close (×) button closes popup, completely resets conversation and state, clears input, restores welcome screen', async ({ page }) => {
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: 'Raghavendra has extensive experience in Python, SQL, and PySpark.' })
      });
    });

    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();

    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();

    const input = page.locator('#askGoraInput');
    const sendBtn = page.locator('#askGoraSendBtn');

    // 1. Submit a user message
    await input.fill('Tell me about your technical skills');
    await input.press('Enter');

    // Wait for assistant response
    const assistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(assistantMsg).toContainText('Raghavendra has extensive experience');

    // 2. Type an unsubmitted draft
    await input.fill('Draft to be cleared');
    await expect(sendBtn).toBeEnabled();

    // 3. Click Close button (×)
    const closeBtn = page.locator('#askGoraCloseBtn');
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toHaveAttribute('aria-label', 'Close Ask GORA');
    await closeBtn.click();

    // Panel is hidden, launcher is collapsed
    await expect(panel).not.toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');

    // 4. Reopen chat via launcher
    await launcher.click();
    await expect(panel).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-expanded', 'true');

    // 5. Verify conversation is completely reset
    // No user messages remain
    await expect(panel.locator('.ask-gora-msg-user')).toHaveCount(0);
    // Only 1 assistant message remains (the initial welcome greeting)
    await expect(panel.locator('.ask-gora-msg-assistant')).toHaveCount(1);
    await expect(panel.locator('.ask-gora-msg-assistant').first()).toContainText("Hello! I'm GORA.");

    // Input text is cleared and send button is disabled
    await expect(input).toHaveValue('');
    await expect(sendBtn).toBeDisabled();

    // 6. Verify suggestion chips on restored welcome screen are fully interactive
    const chip = panel.locator('.ask-gora-chip', { hasText: 'Tell me about his research.' });
    await expect(chip).toBeVisible();
    await chip.click();

    // Verified that clicking chip in reset session submits immediately
    const newUserMsg = panel.locator('.ask-gora-msg-user');
    await expect(newUserMsg).toHaveCount(1);
    await expect(newUserMsg).toContainText('Tell me about his research.');
  });

  test('Closing (×) while request is in flight resets conversation and discards delayed response', async ({ page }) => {
    let requestStarted = false;

    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      requestStarted = true;
      await page.waitForTimeout(400);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: 'Stale delayed response that should be discarded.' })
      });
    });

    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();

    const panel = page.locator('#askGoraPanel');
    const input = page.locator('#askGoraInput');

    await input.fill('Delayed request query');
    await input.press('Enter');

    // Wait until network request has dispatched
    await expect.poll(() => requestStarted, { timeout: 3000 }).toBe(true);

    // Immediately click Close (×) while request is in-flight
    const closeBtn = page.locator('#askGoraCloseBtn');
    await closeBtn.click();
    await expect(panel).not.toBeVisible();

    // Wait for the delayed network request to conclude
    await page.waitForTimeout(500);

    // Reopen popup via launcher
    await launcher.click();
    await expect(panel).toBeVisible();

    // Verify conversation was reset and delayed response was discarded
    await expect(panel.locator('.ask-gora-msg-user')).toHaveCount(0);
    await expect(panel.locator('.ask-gora-msg-assistant')).toHaveCount(1);
    await expect(panel.locator('.ask-gora-msg-assistant')).not.toContainText('Stale delayed response');
  });

  test('Ongoing request is NOT cancelled when minimizing, response renders when reopened', async ({ page }) => {
    let requestHandled = false;

    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      // Simulate network latency of 300ms
      await page.waitForTimeout(300);
      requestHandled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: 'Background response successfully processed without abortion.' })
      });
    });

    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();

    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();

    const input = page.locator('#askGoraInput');
    await input.fill('Are background jobs processed?');
    await input.press('Enter');

    // Immediately click minimize while request is in-flight
    const minimizeBtn = page.locator('#askGoraMinimizeBtn');
    await minimizeBtn.click();
    await expect(panel).not.toBeVisible();

    // Wait for the background request to fulfill
    await expect.poll(() => requestHandled, { timeout: 4000 }).toBe(true);

    // Reopen popup via launcher
    await launcher.click();
    await expect(panel).toBeVisible();

    // Verify response arrived and rendered cleanly
    const assistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(assistantMsg).toContainText('Background response successfully processed');
  });

  test('Portfolio page: Both Minimize (−) and Close (×) buttons function properly with parity', async ({ page }) => {
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: 'Portfolio assistant response is verified.' })
      });
    });

    await page.goto('/portfolio/');
    const launcher = page.locator('#askGoraLauncher');
    await expect(launcher).toBeVisible();

    await launcher.click();
    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();

    const input = page.locator('#askGoraInput');
    const sendBtn = page.locator('#askGoraSendBtn');

    // 1. Submit message
    await input.fill('Portfolio test query');
    await input.press('Enter');

    const assistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(assistantMsg).toContainText('Portfolio assistant response is verified.');

    // 2. Type draft text
    await input.fill('Draft on portfolio');

    // 3. Test minimize button: hides and preserves everything
    const minimizeBtn = page.locator('#askGoraMinimizeBtn');
    await expect(minimizeBtn).toBeVisible();
    await minimizeBtn.click();
    await expect(panel).not.toBeVisible();

    // Reopen via launcher: verify everything is preserved
    await launcher.click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.ask-gora-msg-user')).toHaveCount(1);
    await expect(input).toHaveValue('Draft on portfolio');

    // 4. Test close button: hides and resets conversation completely
    const closeBtn = page.locator('#askGoraCloseBtn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(panel).not.toBeVisible();

    // Reopen via launcher: verify fresh conversation
    await launcher.click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.ask-gora-msg-user')).toHaveCount(0);
    await expect(panel.locator('.ask-gora-msg-assistant')).toHaveCount(1);
    await expect(input).toHaveValue('');
    await expect(sendBtn).toBeDisabled();
  });

  test('Composer: typing text enables send button, Enter submits, friendly hiccup error displays with Try again', async ({ page }) => {
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service Unavailable' })
      });
    });

    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();

    const input = page.locator('#askGoraInput');
    const sendBtn = page.locator('#askGoraSendBtn');
    await expect(sendBtn).toBeDisabled();

    // Type a message
    await input.fill('Tell me about your research');
    await expect(sendBtn).toBeEnabled();

    // Submit via Enter
    await input.press('Enter');

    // User message is rendered
    const userMsg = page.locator('.ask-gora-msg-user');
    await expect(userMsg).toHaveText(/Tell me about your research/);

    // Friendly error card appears
    const errorCard = page.locator('.ask-gora-msg-error');
    await expect(errorCard).toBeVisible();
    await expect(errorCard.locator('.ask-gora-error-title')).toHaveText('A little hiccup!');
    await expect(errorCard.locator('.ask-gora-error-text')).toHaveText('Something went wrong while preparing your answer. Please try again in a moment.');

    // Try again button exists and is clickable
    const retryBtn = errorCard.locator('.ask-gora-retry-btn');
    await expect(retryBtn).toBeVisible();
  });

  test('Regression: Clicking "Try again" resubmits the original question, keeps popup open through retries, preserves conversation history', async ({ page }) => {
    let requestCount = 0;
    const submittedPayloads = [];

    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      requestCount++;
      const postData = route.request().postDataJSON();
      submittedPayloads.push(postData);

      // Simulate backend failure (500)
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Edge failure simulation' })
      });
    });

    await page.goto('/');
    const launcher = page.locator('#askGoraLauncher');
    await launcher.click();

    const panel = page.locator('#askGoraPanel');
    await expect(panel).toBeVisible();

    const input = page.locator('#askGoraInput');
    await input.fill('Tell me about your dissertation research');
    await input.press('Enter');

    // 1. First failure displays error card
    const errorCard = panel.locator('.ask-gora-msg-error');
    await expect(errorCard).toBeVisible();
    await expect(errorCard.locator('.ask-gora-error-title')).toHaveText('A little hiccup!');
    expect(requestCount).toBe(1);
    expect(submittedPayloads[0].message).toBe('Tell me about your dissertation research');

    // 2. Click "Try again"
    const retryBtn = errorCard.locator('.ask-gora-retry-btn');
    await retryBtn.click();

    // 3. Popup MUST remain open immediately and throughout retry
    await expect(panel).toBeVisible();

    // 4. Exactly the same original question is resubmitted
    await expect.poll(() => requestCount).toBe(2);
    expect(submittedPayloads[1].message).toBe('Tell me about your dissertation research');

    // 5. Subsequent failure appears inside existing popup, popup remains open
    await expect(panel).toBeVisible();
    await expect(panel.locator('.ask-gora-msg-error')).toBeVisible();

    // 6. User message is preserved and not duplicated
    const userMsgs = panel.locator('.ask-gora-msg-user');
    await expect(userMsgs).toHaveCount(1);
    await expect(userMsgs.first()).toContainText('Tell me about your dissertation research');

    // 7. Close button works
    const closeBtn = page.locator('#askGoraCloseBtn');
    await closeBtn.click();
    await expect(panel).not.toBeVisible();

    // 8. Reopening works and Escape does NOT close
    await launcher.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await closeBtn.click();
    await expect(panel).not.toBeVisible();
  });

  test('Retry success: clicking "Try again" after failure successfully renders assistant response without closing popup', async ({ page }) => {
    let callCount = 0;
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'Raghavendra has extensive research on automated anomaly detection in edge networks.' })
        });
      }
    });

    await page.goto('/');
    await page.locator('#askGoraLauncher').click();
    const panel = page.locator('#askGoraPanel');

    const input = page.locator('#askGoraInput');
    await input.fill('What is his research?');
    await input.press('Enter');

    // First attempt fails
    const errorCard = panel.locator('.ask-gora-msg-error');
    await expect(errorCard).toBeVisible();

    // Click retry
    await errorCard.locator('.ask-gora-retry-btn').click();

    // Popup stays open
    await expect(panel).toBeVisible();

    // Assistant response renders
    const assistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(assistantMsg).toContainText('Raghavendra has extensive research');
    await expect(panel).toBeVisible();
  });

  test('Composer: successfully renders assistant response when backend returns "reply" field format', async ({ page }) => {
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Raghavendra is a Data Analyst specializing in Machine Learning.' })
      });
    });

    await page.goto('/');
    await page.locator('#askGoraLauncher').click();
    const panel = page.locator('#askGoraPanel');

    const input = page.locator('#askGoraInput');
    await input.fill('Who is Raghavendra?');
    await input.press('Enter');

    const assistantMsg = panel.locator('.ask-gora-msg-assistant').last();
    await expect(assistantMsg).toContainText('Raghavendra is a Data Analyst');
  });

  test('Composer: Rate limit (HTTP 429) displays friendly busy message with Try again', async ({ page }) => {
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rate limit exceeded' })
      });
    });

    await page.goto('/');
    await page.locator('#askGoraLauncher').click();

    const input = page.locator('#askGoraInput');
    await input.fill('Are you busy?');
    await input.press('Enter');

    const errorCard = page.locator('.ask-gora-msg-error');
    await expect(errorCard).toBeVisible();
    await expect(errorCard.locator('.ask-gora-error-title')).toHaveText('GORA is temporarily busy');
    await expect(errorCard.locator('.ask-gora-retry-btn')).toBeVisible();
  });

  test('Suggested question chips submit instantly on click', async ({ page }) => {
    // Mocked: this suite must never reach the live Worker (and never spend Workers AI neurons).
    // The optional live check lives in tests/live-api.smoke.spec.js (npm run test:live-api).
    let sentMessage = null;
    await page.route('https://ai.raghavendragolla.com/chat', async route => {
      sentMessage = route.request().postDataJSON().message;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Python, SQL, Power BI and Scikit-Learn (mocked).' })
      });
    });

    await page.goto('/');
    await page.locator('#askGoraLauncher').click();

    const chip = page.locator('.ask-gora-chip', { hasText: 'What are his technical skills?' });
    await chip.click();

    const userMsg = page.locator('.ask-gora-msg-user');
    await expect(userMsg).toHaveText(/What are his technical skills\?/);
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('(mocked)');
    expect(sentMessage).toBe('What are his technical skills?');
  });

  test('Portfolio page: Back-to-top button stacks properly above Ask GORA launcher without overlap', async ({ page }) => {
    await page.goto('/portfolio/');
    const launcher = page.locator('#askGoraLauncher');
    await expect(launcher).toBeVisible();

    // Scroll down to trigger back to top button
    await page.evaluate(() => window.scrollTo(0, 1000));
    const backToTop = page.locator('#backToTopBtn');
    await expect(backToTop).toHaveClass(/show/);

    const launcherBox = await launcher.boundingBox();
    const backToTopBox = await backToTop.boundingBox();

    expect(launcherBox).not.toBeNull();
    expect(backToTopBox).not.toBeNull();

    // Back to top must sit strictly above the launcher
    expect(backToTopBox.y + backToTopBox.height).toBeLessThanOrEqual(launcherBox.y + 4);
  });

  // Comprehensive multi-viewport testing across all 12 requested sizes
  const VIEWPORTS = [
    { name: 'Small mobile (320px)', width: 320, height: 568 },
    { name: 'Standard mobile (360px)', width: 360, height: 640 },
    { name: 'Mobile (375px)', width: 375, height: 667 },
    { name: 'Large mobile (390px)', width: 390, height: 844 },
    { name: 'Large mobile (430px)', width: 430, height: 932 },
    { name: 'Small tablet (600px)', width: 600, height: 800 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Large tablet (1024px)', width: 1024, height: 768 },
    { name: 'Laptop (1280px)', width: 1280, height: 800 },
    { name: 'Desktop (1440px)', width: 1440, height: 900 },
    { name: 'Large desktop (1920px)', width: 1920, height: 1080 },
    { name: 'Ultra-wide (2560px)', width: 2560, height: 1440 }
  ];

  for (const vp of VIEWPORTS) {
    test(`Responsive layout check: ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Check no horizontal overflow before opening chat
      const hasOverflowBefore = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(hasOverflowBefore).toBe(false);

      const launcher = page.locator('#askGoraLauncher');
      await expect(launcher).toBeVisible();

      // Open chat
      await launcher.click();
      const panel = page.locator('#askGoraPanel');
      await expect(panel).toBeVisible();

      // Check no horizontal overflow with chat open
      const hasOverflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(hasOverflowAfter).toBe(false);

      // Verify header, composer, minimize and close buttons are all visible
      await expect(page.locator('.ask-gora-header')).toBeVisible();
      await expect(page.locator('#askGoraMinimizeBtn')).toBeVisible();
      await expect(page.locator('#askGoraCloseBtn')).toBeVisible();
      await expect(page.locator('#askGoraInput')).toBeVisible();
      await expect(page.locator('#askGoraSendBtn')).toBeVisible();

      // Capture representative screenshots
      if ([320, 390, 768, 1024, 1440, 2560].includes(vp.width)) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `ask-gora-light-${vp.width}px.png`),
          fullPage: false
        });

        // Also test dark mode
        await page.evaluate(() => {
          if (window.rgTheme) {
            window.rgTheme.setTheme('dark');
          } else {
            document.documentElement.setAttribute('data-theme', 'dark');
          }
        });
        // Ensure panel is open
        if (!await panel.isVisible()) {
          await launcher.click();
        }
        await page.waitForTimeout(100);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `ask-gora-dark-${vp.width}px.png`),
          fullPage: false
        });
      }
    });
  }

  test('Landscape orientation on mobile and tablet displays cleanly without overflow', async ({ page }) => {
    // Mobile landscape (844x390)
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.locator('#askGoraLauncher').click();
    await expect(page.locator('#askGoraPanel')).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    // Tablet landscape (1024x768)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.locator('#askGoraLauncher').click();
    await expect(page.locator('#askGoraPanel')).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
