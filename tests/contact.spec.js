const { test, expect } = require('@playwright/test');

test.describe('Contact Form Submissions & Failure Paths (Web3Forms Mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portfolio/');
  });

  async function fillForm(page) {
    await page.fill('#senderName', 'Test Visitor');
    await page.fill('#senderEmail', 'visitor@example.com');
    await page.fill('#senderMessage', 'This is a test message with at least 10 characters.');
  }

  test('Case 1: HTTP 500 server error sets is-error, preserves typed input, shows mailto fallback, and does not navigate', async ({ page }) => {
    await page.route('**/api.web3forms.com/**', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Internal Server Error' })
      });
    });

    await fillForm(page);
    await page.click('button[type="submit"]');

    const formStatus = page.locator('#formStatus');
    await expect(formStatus).toHaveClass(/is-error/);
    await expect(formStatus).not.toHaveClass(/is-success/);

    // Form data must be preserved
    await expect(page.locator('#senderName')).toHaveValue('Test Visitor');
    await expect(page.locator('#senderEmail')).toHaveValue('visitor@example.com');

    // Mailto fallback link present
    const mailtoLink = formStatus.locator('a[href^="mailto:"]');
    await expect(mailtoLink).toBeVisible();

    // Button re-enabled
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();

    // URL did not change
    expect(page.url()).toContain('/portfolio/');
  });

  test('Case 2: HTTP 200 with {success:false} treated as failure, surfacing API message and preserving input', async ({ page }) => {
    await page.route('**/api.web3forms.com/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Domain not authorized' })
      });
    });

    await fillForm(page);
    await page.click('button[type="submit"]');

    const formStatus = page.locator('#formStatus');
    await expect(formStatus).toHaveClass(/is-error/);
    await expect(formStatus).toContainText('Domain not authorized');

    // Form inputs preserved
    await expect(page.locator('#senderName')).toHaveValue('Test Visitor');
    await expect(page.locator('#senderMessage')).toHaveValue('This is a test message with at least 10 characters.');
  });

  test('Case 3: Network abort sets is-error, displays network failure, and keeps inputs', async ({ page }) => {
    await page.route('**/api.web3forms.com/**', async route => {
      await route.abort('failed');
    });

    await fillForm(page);
    await page.click('button[type="submit"]');

    const formStatus = page.locator('#formStatus');
    await expect(formStatus).toHaveClass(/is-error/);
    await expect(formStatus).toContainText('Network error');

    // Inputs preserved
    await expect(page.locator('#senderName')).toHaveValue('Test Visitor');
  });

  test('Case 4: HTTP 200 with {success:true} succeeds and resets the form', async ({ page }) => {
    await page.route('**/api.web3forms.com/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Message submitted successfully' })
      });
    });

    await fillForm(page);
    await page.click('button[type="submit"]');

    const formStatus = page.locator('#formStatus');
    await expect(formStatus).toHaveClass(/is-success/);
    await expect(formStatus).toContainText('Message delivered');

    // Form inputs reset
    await expect(page.locator('#senderName')).toHaveValue('');
    await expect(page.locator('#senderEmail')).toHaveValue('');
    await expect(page.locator('#senderMessage')).toHaveValue('');
  });
});
