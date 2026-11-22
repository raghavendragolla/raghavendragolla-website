// @ts-check
// Phase 4.2 / 4.3 / 4.5 frontend tests: Ask GORA recruiter hand-off, role-fit suggestion,
// character counter, mobile keyboard hint, and the portfolio project case studies.
// The Worker is never called: window.fetch is replaced for the /chat endpoint.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function blockAnalytics(page) {
  await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
}

/** Fake /chat that streams `answer` as server-sent events and records each request body. */
async function fakeChat(page, answer) {
  await page.addInitScript((text) => {
    window.__goraRequests = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (url, init) => {
      if (typeof url !== 'string' || !url.endsWith('/chat')) return realFetch(url, init);
      window.__goraRequests.push(JSON.parse(init.body));
      const enc = new TextEncoder();
      const chunks = [`data: ${JSON.stringify({ response: text })}\n\n`, 'data: [DONE]\n\n'];
      let i = 0;
      const body = new ReadableStream({
        pull(controller) {
          if (i >= chunks.length) { controller.close(); return; }
          controller.enqueue(enc.encode(chunks[i++]));
        }
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    };
  }, answer);
}

async function openChat(page, path = '/') {
  await page.goto(path);
  await page.locator('#askGoraLauncher').click();
  await expect(page.locator('#askGoraPanel')).toBeVisible();
}

async function ask(page, question) {
  await page.locator('#askGoraInput').fill(question);
  await page.locator('#askGoraInput').press('Enter');
  await expect(page.locator('.ask-gora-msg-assistant:not(.is-streaming)').last()).not.toContainText("Hello! I'm GORA", { timeout: 10000 });
}

const NOT_AVAILABLE = "That information is not available in Raghavendra's verified public records.";
const OUT_OF_SCOPE = "I'm Raghavendra's portfolio assistant and can only help with questions about his background, projects, research and skills.";

test.describe('Phase 4.2 — Ask GORA recruiter features', () => {
  test.beforeEach(async ({ page }) => { await blockAnalytics(page); });

  test('a hiring question gets the contact hand-off with safe, correct links', async ({ page }) => {
    await fakeChat(page, 'He is actively seeking Data Analyst roles.');
    await openChat(page);
    await ask(page, 'Is he available for a Data Analyst role?');
    const handoff = page.locator('.ask-gora-msg-assistant').last().locator('.ask-gora-handoff');
    await expect(handoff).toBeVisible();
    await expect(handoff).toHaveAttribute('role', 'group');
    await expect(handoff).toHaveAttribute('aria-label', 'Contact Raghavendra');
    const links = handoff.locator('a');
    await expect(links).toHaveText(['Resume (PDF)', 'Email', 'LinkedIn', 'Contact form']);
    await expect(links.nth(0)).toHaveAttribute('href', '/portfolio/resume/resume.pdf');
    await expect(links.nth(1)).toHaveAttribute('href', 'mailto:raghavendrayadavgolla@gmail.com');
    await expect(links.nth(2)).toHaveAttribute('href', 'https://www.linkedin.com/in/raghavendragolla');
    for (const i of [0, 2]) {
      await expect(links.nth(i)).toHaveAttribute('target', '_blank');
      await expect(links.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(links.nth(3)).toHaveAttribute('href', '/portfolio/#contact');
  });

  test('a "not available" answer offers the hand-off even for a neutral question', async ({ page }) => {
    await fakeChat(page, NOT_AVAILABLE);
    await openChat(page);
    await ask(page, 'Which high school did he attend?');
    await expect(page.locator('.ask-gora-msg-assistant').last().locator('.ask-gora-handoff')).toBeVisible();
  });

  test('ordinary and out-of-scope answers get no hand-off', async ({ page }) => {
    await fakeChat(page, OUT_OF_SCOPE);
    await openChat(page);
    await ask(page, 'Write me a poem about contact lenses.');
    await expect(page.locator('.ask-gora-handoff')).toHaveCount(0);
    await fakeChat(page, 'He knows Python, SQL and Power BI.');
    await openChat(page);
    await ask(page, 'What are his technical skills?');
    await expect(page.locator('.ask-gora-handoff')).toHaveCount(0);
  });

  test('the hand-off is restored with the conversation after a reload', async ({ page }) => {
    await fakeChat(page, 'He is actively seeking Data Analyst roles.');
    await openChat(page);
    await ask(page, 'How can I contact him about an interview?');
    await expect(page.locator('.ask-gora-handoff')).toHaveCount(1);
    await page.reload();
    await page.locator('#askGoraLauncher').click();
    await expect(page.locator('.ask-gora-handoff')).toHaveCount(1);
  });

  test('on the portfolio, "Contact form" minimizes the chat and jumps to the contact section', async ({ page }) => {
    await fakeChat(page, NOT_AVAILABLE);
    await openChat(page, '/portfolio/');
    await ask(page, 'What is his phone number?');
    await page.locator('.ask-gora-handoff a', { hasText: 'Contact form' }).click();
    await expect(page.locator('#askGoraPanel')).toBeHidden();
    await expect(page).toHaveURL(/\/portfolio\/#contact$/);
    await expect(page.locator('#contact')).toBeInViewport();
    // The conversation is kept (minimized, not closed).
    await page.locator('#askGoraLauncher').click();
    await expect(page.locator('.ask-gora-handoff')).toHaveCount(1);
  });

  // One test per page: closing the panel pops its history entry asynchronously, so closing and then
  // navigating inside one test would race that pop (seen in WebKit), which real visitors never do.
  for (const path of ['/', '/portfolio/']) {
    test(`the role-fit suggestion is offered on ${path} and sends its question`, async ({ page }) => {
      await fakeChat(page, 'Evidence: SQL, Python, Power BI.');
      await openChat(page, path);
      const chip = page.locator('.ask-gora-chip', { hasText: 'Is he a good fit for a Data Analyst role?' });
      await expect(chip).toBeVisible();
      await chip.click();
      await expect(page.locator('.ask-gora-msg-user').last()).toContainText('Is he a good fit for a Data Analyst role?');
      expect((await page.evaluate(() => window.__goraRequests))[0].message).toBe('Is he a good fit for a Data Analyst role?');
    });
  }

  test('the character counter appears near the limit and the phone keyboard shows "Send"', async ({ page }) => {
    await openChat(page);
    const input = page.locator('#askGoraInput');
    const counter = page.locator('.ask-gora-counter');
    await expect(input).toHaveAttribute('enterkeyhint', 'send');
    await input.fill('x'.repeat(100));
    await expect(counter).toBeHidden();
    await input.fill('x'.repeat(330));
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText('330/400');
    await input.fill('x'.repeat(400));
    await expect(counter).toHaveClass(/is-at-limit/);
    await expect(page.locator('#askGoraForm [role="status"]')).toHaveText('Character limit of 400 reached.');
    await input.fill('');
    await expect(counter).toBeHidden();
  });
});

test.describe('Phase 4.3 — portfolio case studies', () => {
  test.beforeEach(async ({ page }) => { await blockAnalytics(page); });

  test('every project has a closed, keyboard-operable case study', async ({ page }) => {
    await page.goto('/portfolio/');
    const studies = page.locator('details.case-study');
    await expect(studies).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const d = studies.nth(i);
      await expect(d).not.toHaveAttribute('open', '');
      await expect(d.locator('.case-study-body')).toBeHidden();
    }
    const first = studies.first();
    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('open', '');
    await expect(first.locator('.case-study-body')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(first).not.toHaveAttribute('open', '');
  });

  test('case studies show the documented facts and a unique accessible name', async ({ page }) => {
    await page.goto('/portfolio/');
    const studies = page.locator('details.case-study');
    const expectations = [
      ['IBM Data Analyst Capstone', ['PromptCloud', 'SHA-256', 'Limitations']],
      ['California House Price Predictor', ['1990 census', 'R² 0.836']],
      ['Handwritten Digit Recognition', ['28×28', '99.64%']],
      ['Heart Disease Prediction', ['CC BY 4.0', 'not a clinical diagnostic tool']]
    ];
    for (let i = 0; i < 4; i++) {
      const [name, facts] = expectations[i];
      await expect(studies.nth(i).locator('summary')).toContainText(name);
      await studies.nth(i).locator('summary').click();
      for (const fact of facts) await expect(studies.nth(i)).toContainText(fact);
    }
    const doi = studies.nth(3).locator('a[href="https://doi.org/10.24432/C52P4X"]');
    await expect(doi).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('opened case studies pass the accessibility scan', async ({ page }) => {
    await page.goto('/portfolio/');
    await page.evaluate(() => document.querySelectorAll('details.case-study').forEach((d) => { d.open = true; }));
    const results = await new AxeBuilder({ page }).include('details.case-study').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('case studies do not cause horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/portfolio/');
    await page.evaluate(() => document.querySelectorAll('details.case-study').forEach((d) => { d.open = true; }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
