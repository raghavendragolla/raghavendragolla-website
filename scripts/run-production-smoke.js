#!/usr/bin/env node
/**
 * Production Smoke Test Launcher
 * ---------------------------------------------------------------------------
 * Runs tests/production.smoke.spec.js against the LIVE site.
 *
 * The smoke suite is opt-in and skips itself unless PRODUCTION_SMOKE=1 is set,
 * so it can never run as part of the normal local `npm run test:e2e`. This tiny
 * launcher sets that flag and delegates to Playwright, avoiding an extra
 * dependency (cross-env) just to set an environment variable portably on
 * Windows, macOS and Linux.
 *
 * Usage: npm run test:smoke
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Playwright's CLI entry point from the local installation.
const cli = require.resolve('@playwright/test/cli');

const args = [
  cli,
  'test',
  'tests/production.smoke.spec.js',
  '--reporter=list',
  ...process.argv.slice(2)
];

console.log('Running production smoke tests against https://www.raghavendragolla.com');
console.log('(opt-in via PRODUCTION_SMOKE=1)\n');

const result = spawnSync(process.execPath, args, {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PRODUCTION_SMOKE: '1' }
});

process.exit(result.status === null ? 1 : result.status);
