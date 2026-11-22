// @ts-check
// Phase 3 (Ask GORA) frontend tests: streaming, stop, retry, rendering safety, persistence, history.
// The Worker is never called: window.fetch is replaced for the /chat endpoint with a controllable
// stream, so the real incremental reading path (ReadableStream + server-sent events) is exercised.
const { test, expect } = require('@playwright/test');

async function blockAnalytics(page) {
  await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
}

/**
 * Installs a fake /chat endpoint. `scenario` is serialised into the page:
 *   { type: 'sse', chunks: [string...], delayMs, errorAfter?: n }   streamed server-sent events
 *   { type: 'json', status, body }                                   ordinary JSON response
 * Every request body is recorded in window.__goraRequests.
 */
async function fakeChat(page, scenario) {
  await page.addInitScript((sc) => {
    window.__goraRequests = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (url, init) => {
      if (typeof url !== 'string' || !url.endsWith('/chat')) return realFetch(url, init);
      window.__goraRequests.push({ body: JSON.parse(init.body), accept: init.headers && init.headers.Accept });
      const signal = init.signal;
      if (sc.type === 'json') {
        return Promise.resolve(new Response(JSON.stringify(sc.body), { status: sc.status || 200, headers: { 'Content-Type': 'application/json' } }));
      }
      const enc = new TextEncoder();
      let i = 0;
      const body = new ReadableStream({
        async pull(controller) {
          await new Promise((r) => setTimeout(r, sc.delayMs || 0));
          // Like a real fetch body: reads fail with AbortError once the request is aborted.
          if (signal && signal.aborted) { controller.error(new DOMException('Aborted', 'AbortError')); return; }
          if (sc.errorAfter !== undefined && i === sc.errorAfter) { controller.error(new TypeError('network error')); return; }
          if (i >= sc.chunks.length) { controller.close(); return; }
          controller.enqueue(enc.encode(sc.chunks[i++]));
        }
      });
      return new Promise((resolve, reject) => {
        if (signal) signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
      }).then((res) => {
        // Reject reads once aborted, like a real fetch body.
        if (signal) signal.addEventListener('abort', () => { try { body.cancel(); } catch { /* ignore */ } });
        return res;
      });
    };
  }, scenario);
}

const ev = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

async function openAndAsk(page, question) {
  await page.goto('/');
  await page.locator('#askGoraLauncher').click();
  await expect(page.locator('#askGoraPanel')).toBeVisible();
  await page.locator('#askGoraInput').fill(question);
  await page.locator('#askGoraInput').press('Enter');
}

test.describe('Ask GORA Phase 3 — streaming chat experience', () => {
  test.beforeEach(async ({ page }) => { await blockAnalytics(page); });

  test('streams the answer progressively and renders Markdown when complete', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 250, chunks: [
      ev({ response: 'He has **four** projects:\n' }),
      ev({ response: '- Digit Recognition\n- House Price Predictor\n' }),
      ev({ choices: [{ delta: { content: 'Repo: https://github.com/raghavendragolla' } }] }),
      'data: [DONE]\n\n'
    ] });
    // Record every rendered state of the streaming bubble, so the check does not depend on how
    // fast the test itself polls (slow engines such as WebKit-on-Windows lag behind the stream).
    await page.addInitScript(() => {
      window.__goraSnapshots = [];
      new MutationObserver(() => {
        const b = document.querySelector('.ask-gora-msg-assistant.is-streaming .ask-gora-msg-bubble');
        if (b) window.__goraSnapshots.push(b.textContent);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await openAndAsk(page, 'What projects has he built?');
    const last = page.locator('.ask-gora-msg-assistant').last();
    await expect(last.locator('li')).toHaveCount(2);
    // The answer was shown incrementally: a state existed with the first chunk but not yet the second.
    const snaps = await page.evaluate(() => window.__goraSnapshots);
    expect(snaps.some((t) => t.includes('He has four projects') && !t.includes('House Price Predictor'))).toBe(true);
    await expect(last.locator('strong')).toHaveText('four');
    await expect(last.locator('a[href="https://github.com/raghavendragolla"]')).toBeVisible();
    await expect(page.locator('#askGoraInput')).toBeEnabled();
    await expect(page.locator('#askGoraSendBtn')).toHaveAttribute('aria-label', 'Send message');
  });

  test('sends the question with stream:true, an SSE Accept header and the conversation context', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 10, chunks: [ev({ response: 'First answer.' }), 'data: [DONE]\n\n'] });
    await openAndAsk(page, 'First question');
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('First answer.');
    await page.locator('#askGoraInput').fill('Follow-up question');
    await page.locator('#askGoraInput').press('Enter');
    await expect(page.locator('.ask-gora-msg-user')).toHaveCount(2);
    const reqs = await page.evaluate(() => window.__goraRequests);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].body.stream).toBe(true);
    expect(reqs[0].accept).toContain('text/event-stream');
    expect(reqs[1].body.history).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer.' }
    ]);
  });

  test('Stop keeps the partial answer, re-enables the composer and needs no error card', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 300, chunks: Array.from({ length: 30 }, (_, i) => ev({ response: `word${i} ` })) });
    await openAndAsk(page, 'Tell me everything');
    const send = page.locator('#askGoraSendBtn');
    await expect(send).toHaveAttribute('aria-label', 'Stop generating');
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('word1');
    await send.click();
    const last = page.locator('.ask-gora-msg-assistant').last();
    await expect(last.locator('.ask-gora-msg-meta')).toHaveText(/stopped/);
    await expect(last).toContainText('word0');
    await expect(page.locator('.ask-gora-msg-error')).toHaveCount(0);
    await expect(page.locator('#askGoraInput')).toBeEnabled();
    await expect(send).toHaveAttribute('aria-label', 'Send message');
    expect(await page.evaluate(() => window.AskGORA.getState().isLoading)).toBe(false);
  });

  test('an interrupted stream keeps the partial text and offers a working retry', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 50, chunks: [ev({ response: 'Partial answer' }), ev({ error_code: 'STREAM_INTERRUPTED' })] });
    await openAndAsk(page, 'Question');
    await expect(page.locator('.ask-gora-msg-error')).toContainText('cut short');
    await expect(page.locator('.ask-gora-msg-assistant').filter({ hasText: 'Partial answer' })).toHaveCount(1);
    await page.locator('.ask-gora-retry-btn').click();
    await expect.poll(() => page.evaluate(() => window.__goraRequests.length)).toBe(2);
  });

  test('a network failure mid-stream is reported, not left hanging', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 50, errorAfter: 1, chunks: [ev({ response: 'Half' }), ev({ response: ' never' })] });
    await openAndAsk(page, 'Question');
    await expect(page.locator('.ask-gora-msg-error')).toBeVisible();
    await expect(page.locator('#askGoraInput')).toBeEnabled();
  });

  test('an empty stream shows the friendly error card', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 10, chunks: [ev({ error_code: 'EMPTY_RESPONSE' }), 'data: [DONE]\n\n'] });
    await openAndAsk(page, 'Question');
    await expect(page.locator('.ask-gora-msg-error')).toContainText('A little hiccup');
  });

  test('duplicate submissions are ignored while an answer is pending', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 400, chunks: [ev({ response: 'One answer' }), 'data: [DONE]\n\n'] });
    await openAndAsk(page, 'Only once');
    // While pending: a suggested-question chip and Enter in the composer must not send again.
    // (Submitting the form itself now means "Stop" — covered by the Stop test.)
    await page.locator('.ask-gora-chip').first().click({ force: true }).catch(() => {});
    await page.evaluate(() => document.getElementById('askGoraInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('One answer');
    expect(await page.evaluate(() => window.__goraRequests.length)).toBe(1);
  });

  test('model output cannot inject HTML or script links', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 10, chunks: [ev({ response: '<img src=x onerror="window.__pwned=1"> [click](javascript:window.__pwned=2) <script>window.__pwned=3</script>' }), 'data: [DONE]\n\n'] });
    await openAndAsk(page, 'Inject');
    const last = page.locator('.ask-gora-msg-assistant').last();
    await expect(last).toContainText('<img src=x');
    await expect(last.locator('img, script')).toHaveCount(0);
    await expect(last.locator('a[href^="javascript"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('code blocks render with a working Copy button', async ({ page, context }) => {
    // Clipboard permission names are Chromium-specific; other engines use their own defaults.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await fakeChat(page, { type: 'sse', delayMs: 10, chunks: [ev({ response: 'Example:\n```python\nprint("hi")\n```\n' }), 'data: [DONE]\n\n'] });
    await openAndAsk(page, 'Show code');
    const block = page.locator('.ask-gora-code').last();
    await expect(block.locator('code')).toHaveText('print("hi")');
    await block.locator('.ask-gora-copy-btn').click();
    await expect(block.locator('.ask-gora-copy-btn')).toHaveText(/Copied|Copy failed/);
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (copied !== null) expect(copied).toBe('print("hi")');
  });

  test('the conversation survives a refresh in the same tab and Close clears it', async ({ page }) => {
    await fakeChat(page, { type: 'sse', delayMs: 10, chunks: [ev({ response: 'Remembered answer.' }), 'data: [DONE]\n\n'] });
    await openAndAsk(page, 'Remember me');
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('Remembered answer.');
    await page.reload();
    await page.locator('#askGoraLauncher').click();
    await expect(page.locator('.ask-gora-msg-user')).toContainText('Remember me');
    await expect(page.locator('.ask-gora-msg-assistant').last()).toContainText('Remembered answer.');
    expect(await page.evaluate(() => window.AskGORA.getState().historyLength)).toBe(2);
    await page.locator('#askGoraCloseBtn').click();
    await page.reload();
    await page.locator('#askGoraLauncher').click();
    await expect(page.locator('.ask-gora-msg-user')).toHaveCount(0);
  });

  test('Back while the chat is still opening cancels it and stays on the page', async ({ page }) => {
    await page.goto('/404.html');
    await page.goto('/');
    await page.waitForLoadState('load');
    // Slow down chatbot.css so the panel is still waiting for it when Back is pressed.
    await page.route('**/assets/css/shared/chatbot.css*', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    await page.locator('#askGoraLauncher').click();
    expect(await page.evaluate(() => history.state && history.state.askGoraOpen)).toBe(true);
    await page.goBack();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => window.AskGORA.getState().isOpen)).toBe(false);
  });
});
