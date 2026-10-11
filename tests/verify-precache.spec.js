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
  };
  for (const [name, replacement] of Object.entries(failing)) {
    test(`fails for ${name}`, () => {
      expect(installPrecacheProblem(withInstallCall(replacement))).not.toBeNull();
    });
  }

  test('fails when the call appears only outside the install handler', () => {
    const src = withInstallCall('cache.add(url)')
      .replace("self.addEventListener('install'", `function unused(cache, url) { return ${LIVE}; }\nself.addEventListener('install'`);
    expect(installPrecacheProblem(src)).not.toBeNull();
  });
});
