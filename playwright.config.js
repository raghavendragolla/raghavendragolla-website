const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Cross-browser smoke coverage. These projects only run the small
    // high-value smoke suite (tests/cross-browser.smoke.spec.js) -- the full
    // behavioural suites stay Chromium-only to keep CI fast. Selected with
    // `--project=firefox|webkit` or via `npm run test:cross-browser`.
    //
    // fullyParallel is disabled here: these engines are slower to boot and the
    // smoke suite is small, so serial execution is both faster overall and
    // avoids flaky teardown timeouts against the shared static server.
    {
      name: 'firefox-smoke',
      testMatch: /cross-browser\.smoke\.spec\.js/,
      fullyParallel: false,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-smoke',
      testMatch: /cross-browser\.smoke\.spec\.js/,
      fullyParallel: false,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'node scripts/test-server.js',
    port: 8080,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
