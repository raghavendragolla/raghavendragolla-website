const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installPrecacheProblem } = require('../scripts/verify-precache.js');

// Guards the precache check in scripts/verify-precache.js: the sw.js install
// handler must precache with cache.add(new Request(url, { cache: 'reload' })),
// and the same text in a comment, a string or other code must not count.

const SW_SRC = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');
const LIVE = "cache.add(new Request(url, { cache: 'reload' }))";

/** sw.js with its live precache call replaced by `replacement`. */
function withInstallCall(replacement) {
  expect(SW_SRC, 'sw.js contains the live precache call').toContain(LIVE);
  return SW_SRC.replace(LIVE, replacement);
}

test.describe('Service-worker precache check (verify-precache.js)', () => {
  test('passes on the real sw.js', () => {
    expect(installPrecacheProblem(SW_SRC)).toBeNull();
  });

  const failing = {
    'plain cache.add(url)': 'cache.add(url)',
    'Request without a cache option': 'cache.add(new Request(url))',
    "cache: 'no-cache' instead of 'reload'": "cache.add(new Request(url, { cache: 'no-cache' }))",
    'cache.addAll()': 'cache.addAll([url])',
    'the call only in a trailing // comment': `fetch(url) // ${LIVE}`,
    'the call only in a /* */ comment': `fetch(url) /* ${LIVE} */`,
    'the call only in a string literal': `fetch(url, ${JSON.stringify(LIVE)})`,
    'the call only in a template literal': `fetch(\`${LIVE}\`)`,
    // The effective cache mode must be 'reload'.
    'a duplicate cache property overriding reload': "cache.add(new Request(url, { cache: 'reload', cache: 'default' }))",
    'a duplicate cache property, both reload': "cache.add(new Request(url, { cache: 'reload', 'cache': 'reload' }))",
    'a spread after cache that may override it': "cache.add(new Request(url, { cache: 'reload', ...self.requestInit }))",
    'a computed key after cache that may override it': "cache.add(new Request(url, { cache: 'reload', ['cache']: 'default' }))",
    'a cache getter': "cache.add(new Request(url, { get cache() { return 'reload'; } }))",
    'a non-literal cache value': "cache.add(new Request(url, { cache: self.cacheMode }))",
    // Only calls the install handler actually makes count.
    'the call only in an unused nested function declaration':
      `(() => { function unused() { return ${LIVE}; } return fetch(url); })()`,
    'the call only in a stored, never-called arrow function':
      `(() => { const later = () => ${LIVE}; return fetch(url); })()`,
  };
  for (const [name, replacement] of Object.entries(failing)) {
    test(`fails for ${name}`, () => {
      expect(installPrecacheProblem(withInstallCall(replacement))).not.toBeNull();
    });
  }

  const passing = {
    'a spread before cache (cache still wins)': "cache.add(new Request(url, { ...self.requestInit, cache: 'reload' }))",
    "a quoted 'cache' key": "cache.add(new Request(url, { 'cache': 'reload' }))",
    'the call inside an immediately invoked function': `(() => ${LIVE})()`,
  };
  for (const [name, replacement] of Object.entries(passing)) {
    test(`passes for ${name}`, () => {
      expect(installPrecacheProblem(withInstallCall(replacement))).toBeNull();
    });
  }

  test('fails when the call appears only outside the install handler', () => {
    const src = withInstallCall('cache.add(url)')
      .replace("self.addEventListener('install'", `function unused(cache, url) { return ${LIVE}; }\nself.addEventListener('install'`);
    expect(installPrecacheProblem(src)).not.toBeNull();
  });
});
