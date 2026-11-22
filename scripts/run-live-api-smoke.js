#!/usr/bin/env node
/**
 * Live Ask GORA API Smoke Test Launcher
 * ---------------------------------------------------------------------------
 * Runs tests/live-api.smoke.spec.js against the DEPLOYED Worker at
 * https://ai.raghavendragolla.com.
 *
 * The spec skips itself unless GORA_LIVE_SMOKE=1 is set, so it never runs as
 * part of normal test runs. This launcher sets that flag portably (no
 * cross-env dependency) and delegates to Playwright.
 *
 * Cost: one inference request per run (~30 Workers AI neurons).
 *
 * Usage: npm run test:live-api
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cli = require.resolve('@playwright/test/cli');

const args = [
  cli,
  'test',
  'tests/live-api.smoke.spec.js',
  '--project=chromium',
  '--workers=1',
  '--reporter=list',
  ...process.argv.slice(2)
];

console.log('Running the OPTIONAL live Ask GORA API smoke test against https://ai.raghavendragolla.com');
console.log('(opt-in via GORA_LIVE_SMOKE=1; uses one inference request, about 30 neurons)\n');

const result = spawnSync(process.execPath, args, {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, GORA_LIVE_SMOKE: '1' }
});

process.exit(result.status === null ? 1 : result.status);
