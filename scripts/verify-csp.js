#!/usr/bin/env node
/**
 * CSP Inline-Script Hash Verifier
 * ---------------------------------------------------------------------------
 * Recomputes the SHA-256 hash of every inline <script> in each page and
 * compares it against the hashes declared in that page's Content-Security-Policy
 * meta tag.
 *
 * Why this exists: the CSP uses 'sha256-...' source expressions, so editing an
 * inline script invalidates its hash and the browser silently refuses to run it.
 * For index.html / portfolio/index.html that would break the zero-FOUC theme
 * initialisation on production, and nothing else in the toolchain would notice.
 * This script turns that silent failure into a build failure.
 *
 * Reports per page:
 *   MISSING  - an inline script with no matching declared hash (it will be BLOCKED)
 *   UNUSED   - a declared hash matching no inline script (stale leftover)
 *
 * Exit code 0 = every page is consistent, 1 = at least one problem.
 *
 * Usage: node scripts/verify-csp.js [file.html ...]
 *        (defaults to the project's five validated pages)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const DEFAULT_PAGES = [
  'index.html',
  'portfolio/index.html',
  '404.html',
  'privacy.html',
  'redesign/index.html'
];

/**
 * Find the Content-Security-Policy meta tag content, tolerant of the
 * attribute order and line breaks used across these pages.
 */
function extractCsp(html) {
  // Match a meta tag containing http-equiv="Content-Security-Policy" and capture its content attr.
  // NOTE: the content value is delimited by double quotes but itself contains
  // single quotes (the CSP source keywords, e.g. 'self', 'sha256-...'), so the
  // capture group must not exclude single quotes.
  const metaRe = /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi;
  let match;
  while ((match = metaRe.exec(html)) !== null) {
    const tag = match[0];
    const contentMatch =
      tag.match(/content="([^"]*)"/i) || tag.match(/content='([^']*)'/i);
    if (contentMatch) {
      return contentMatch[1];
    }
  }
  // Also allow the attribute order to be reversed (content before http-equiv).
  const altRe = /<meta\b[^>]*content=["']([^"']*default-src[^"']*)["'][^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i;
  const alt = html.match(altRe);
  return alt ? alt[1] : null;
}

/**
 * Collect the exact byte bodies of inline scripts.
 * An inline script is one with a closing </script> and NO src attribute,
 * which is not a JSON-LD data block, and whose body is not empty.
 */
function inlineScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    if (body.trim() === '') continue;
    scripts.push(body);
  }
  return scripts;
}

function sha256base64(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

function verifyPage(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    return { relPath, status: 'missing-file', problems: [`File not found: ${relPath}`] };
  }

  const html = fs.readFileSync(abs, 'utf8');
  const csp = extractCsp(html);

  if (!csp) {
    // Pages without a CSP have nothing to verify. redesign/index.html is
    // intentionally CSP-less, so this is informational rather than an error.
    return { relPath, status: 'no-csp', problems: [], info: 'No CSP meta tag found (nothing to verify)' };
  }

  const declared = [...csp.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((m) => m[1]);
  const computed = inlineScripts(html).map(sha256base64);

  const missing = computed.filter((h) => !declared.includes(h));
  const unused = declared.filter((h) => !computed.includes(h));

  return { relPath, status: 'checked', declared, computed, missing, unused };
}

function main() {
  const pages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PAGES;

  let failures = 0;
  console.log('CSP inline-script hash verification');
  console.log('='.repeat(72));

  for (const page of pages) {
    const r = verifyPage(page);

    if (r.status === 'missing-file') {
      console.log(`\n${page}`);
      console.log(`  SKIP  ${r.problems[0]}`);
      continue;
    }

    if (r.status === 'no-csp') {
      console.log(`\n${page}`);
      console.log(`  INFO  ${r.info}`);
      continue;
    }

    const ok = r.missing.length === 0 && r.unused.length === 0;
    console.log(`\n${page}`);
    console.log(`  inline scripts: ${r.computed.length}   declared hashes: ${r.declared.length}`);

    if (r.missing.length) {
      failures += r.missing.length;
      console.log(`  MISSING hashes (these inline scripts WOULD BE BLOCKED):`);
      r.missing.forEach((h) => console.log(`    sha256-${h}`));
    }
    if (r.unused.length) {
      failures += r.unused.length;
      console.log(`  UNUSED hashes (stale leftovers, safe to delete):`);
      r.unused.forEach((h) => console.log(`    sha256-${h}`));
    }
    console.log(`  ${ok ? 'OK' : 'MISMATCH'}`);
  }

  console.log('\n' + '='.repeat(72));
  if (failures) {
    console.error(`FAIL: ${failures} CSP hash problem(s) detected.`);
    console.error('Fix by regenerating the hash for each inline script, e.g.:');
    console.error('  node -e "const c=require(\'crypto\'),f=require(\'fs\');');
    console.error('    const h=f.readFileSync(\'index.html\',\'utf8\');');
    console.error('    const b=/<script>([\\s\\S]*?)<\\/script>/.exec(h)[1];');
    console.error('    console.log(c.createHash(\'sha256\').update(b,\'utf8\').digest(\'base64\'))"');
    process.exit(1);
  }
  console.log('PASS: all inline scripts are correctly authorised by their CSP hashes.');
}

main();
