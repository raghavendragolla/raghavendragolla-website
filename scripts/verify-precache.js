#!/usr/bin/env node
/**
 * Service-Worker Precache Validator
 * ---------------------------------------------------------------------------
 * Verifies that every path listed in sw.js's PRECACHE_ASSETS array actually
 * resolves to a real file on disk.
 *
 * Why this exists: `cache.add()` rejects on any non-200 response. If the SW
 * precaches a path that is missing or untracked, the install still "succeeds"
 * (the rejection is swallowed by Promise.allSettled) but the asset is silently
 * absent from the offline cache -- and, if HTML references it, the page breaks.
 * That exact class of defect shipped once before. This check makes it a build
 * failure instead.
 *
 * Usage: node scripts/verify-precache.js
 * Exit 0 = all precache entries resolve, 1 = at least one missing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');

function main() {
  if (!fs.existsSync(SW)) {
    console.error('FAIL: sw.js not found');
    process.exit(1);
  }

  const src = fs.readFileSync(SW, 'utf8');

  const arrayMatch = src.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (!arrayMatch) {
    console.error('FAIL: could not find PRECACHE_ASSETS in sw.js');
    process.exit(1);
  }

  const entries = [...arrayMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const versionMatch = src.match(/ASSET_VERSION\s*=\s*'([^']+)'/);
  const version = versionMatch ? versionMatch[1] : '(unknown)';

  console.log('Service-worker precache validation');
  console.log('='.repeat(72));
  console.log(`ASSET_VERSION: ${version}`);
  console.log(`Precache entries: ${entries.length}\n`);

  const missing = [];
  const navigations = [];

  for (const entry of entries) {
    // A bare "/" or "/dir/" is a navigation route, not a real file path.
    if (entry === '/' || entry.endsWith('/')) {
      navigations.push(entry);
      const candidate = path.join(ROOT, entry === '/' ? 'index.html' : entry.replace(/^\//, '') + 'index.html');
      if (!fs.existsSync(candidate)) {
        missing.push(`${entry}  (navigation -> ${path.relative(ROOT, candidate).replace(/\\/g, '/')})`);
      }
      continue;
    }
    if (!entry.startsWith('/')) {
      console.log(`  SKIP external/non-root entry: ${entry}`);
      continue;
    }
    const rel = entry.replace(/^\//, '');
    if (!fs.existsSync(path.join(ROOT, rel))) {
      missing.push(entry);
    }
  }

  if (navigations.length) {
    console.log(`Navigation routes checked: ${navigations.join(', ')}`);
  }

  if (missing.length) {
    console.log('\nMISSING ENTRIES (cache.add would reject these):');
    missing.forEach((m) => console.log(`  ${m}`));
    console.log('\n' + '='.repeat(72));
    console.error(`FAIL: ${missing.length} precache entr(y/ies) do not exist on disk.`);
    process.exit(1);
  }

  // The install step must bypass the browser's HTTP cache. Otherwise a returning
  // visitor's new service worker precaches stale copies of unversioned URLs
  // (assets are served with max-age=14400), and versioned requests fall back to
  // them -- the v24.4 release served the previous fonts.css this way.
  // Only live code inside the install handler counts: comments are stripped
  // first, and any plain cache.add(url) / cache.addAll(...) there fails too.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const install = code.match(/addEventListener\(\s*'install'[\s\S]*?\n\}\);/);
  const reloadAdd = /cache\.add\(\s*new Request\(\s*url\s*,\s*\{\s*cache:\s*'reload'\s*\}\s*\)\s*\)/;
  const plainAdd = /cache\.add\(\s*url\s*\)|cache\.addAll\(/;
  if (!install || !reloadAdd.test(install[0]) || plainAdd.test(install[0])) {
    console.log('='.repeat(72));
    console.error("FAIL: the sw.js install handler must precache with cache.add(new Request(url, { cache: 'reload' })).");
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log('PASS: every precache entry resolves to a real file.');
  console.log('PASS: precache requests bypass the HTTP cache (cache: \'reload\').');
}

main();
