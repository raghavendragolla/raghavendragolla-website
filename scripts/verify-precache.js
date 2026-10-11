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
 * It also verifies that the install handler precaches with
 * cache.add(new Request(url, { cache: 'reload' })), so precaching bypasses the
 * browser's HTTP cache.
 *
 * Usage: node scripts/verify-precache.js
 * Exit 0 = both checks pass, 1 = a precache entry is missing or the install
 * handler does not bypass the HTTP cache.
 */

'use strict';

const fs = require('fs');
const path = require('path');
// ESLint's own parser, installed with the eslint devDependency.
const espree = require('espree');

const ROOT = path.resolve(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');

/** Every CallExpression node inside `node`. */
function callsIn(node, out = []) {
  if (!node || typeof node.type !== 'string') return out;
  if (node.type === 'CallExpression') out.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => callsIn(child, out));
    else if (value && typeof value.type === 'string') callsIn(value, out);
  }
  return out;
}

/** True for `new Request(<anything>, { cache: 'reload' })`. */
function isReloadRequest(node) {
  if (!node || node.type !== 'NewExpression') return false;
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'Request') return false;
  const init = node.arguments[1];
  return Boolean(init && init.type === 'ObjectExpression' && init.properties.some((p) =>
    p.type === 'Property' && !p.computed &&
    (p.key.name === 'cache' || p.key.value === 'cache') &&
    p.value.type === 'Literal' && p.value.value === 'reload'));
}

/**
 * Returns null when sw.js's install handler precaches only with
 * cache.add(new Request(url, { cache: 'reload' })), otherwise the reason it
 * does not. The source is parsed, so comments, strings and code outside the
 * install handler cannot satisfy the check.
 */
function installPrecacheProblem(src) {
  let ast;
  try {
    ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'script', loc: true });
  } catch (err) {
    return `sw.js does not parse (${err.message})`;
  }
  const installs = callsIn(ast).filter((c) =>
    c.callee.type === 'MemberExpression' && !c.callee.computed &&
    c.callee.property.name === 'addEventListener' &&
    c.arguments[0] && c.arguments[0].type === 'Literal' && c.arguments[0].value === 'install');
  if (installs.length !== 1) return `expected one install listener, found ${installs.length}`;

  const adds = callsIn(installs[0].arguments[1]).filter((c) =>
    c.callee.type === 'MemberExpression' && !c.callee.computed &&
    (c.callee.property.name === 'add' || c.callee.property.name === 'addAll'));
  if (!adds.length) return 'the install handler never calls cache.add()';
  const bad = adds.find((c) => c.callee.property.name !== 'add' || !isReloadRequest(c.arguments[0]));
  return bad ? `line ${bad.loc.start.line} precaches without a cache: 'reload' Request` : null;
}

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
  const problem = installPrecacheProblem(src);
  if (problem) {
    console.log('='.repeat(72));
    console.error(`FAIL: the sw.js install handler must precache with cache.add(new Request(url, { cache: 'reload' })): ${problem}.`);
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log('PASS: every precache entry resolves to a real file.');
  console.log('PASS: precache requests bypass the HTTP cache (cache: \'reload\').');
}

if (require.main === module) main();

module.exports = { installPrecacheProblem };
