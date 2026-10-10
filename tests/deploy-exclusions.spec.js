const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Guards the GitHub Pages publishing rules in _config.yml. GitHub Pages builds
// this repository with Jekyll, which publishes every file except dotfiles and
// the paths listed under `exclude:`. These tests keep development tooling and
// the unreleased /redesign/ preview off the public site, without accidentally
// excluding anything the live site needs.

const ROOT = path.resolve(__dirname, '..');

function readExcludes() {
  const yml = fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8');
  const block = yml.split(/^exclude:\s*$/m)[1] || '';
  return block
    .split('\n')
    .map((line) => line.match(/^\s*-\s*(\S+)/))
    .filter(Boolean)
    .map((m) => m[1].replace(/\/$/, ''));
}

function isExcluded(relPath, excludes) {
  return excludes.some((e) => relPath === e || relPath.startsWith(e + '/'));
}

test.describe('Production deployment exclusions (_config.yml)', () => {
  const excludes = readExcludes();

  test('development, test and preview files are excluded from publishing', () => {
    const mustExclude = [
      'package.json', 'package-lock.json', 'README.md', 'eslint.config.mjs',
      'playwright.config.js', 'lighthouserc.json', 'node_modules',
      'scripts/verify-csp.js', 'scripts/privacy-scan.js', 'tests/routing.spec.js',
      'redesign/index.html', 'redesign/assets/glass-prisms.jpg'
    ];
    for (const p of mustExclude) {
      expect(isExcluded(p, excludes), `${p} should not be published`).toBe(true);
    }
  });

  test('every public site file is still published', () => {
    const mustPublish = [
      'index.html', '404.html', 'privacy.html', 'portfolio/index.html',
      'robots.txt', 'sitemap.xml', 'manifest.json', 'sw.js', 'CNAME',
      'google9dd676bcc70ae03c.html', 'portfolio/resume/resume.pdf',
      'assets/css/style.css', 'assets/js/script.js', 'portfolio/js/script.js',
      'portfolio/certificates/ibm-data-analyst.jpg', 'assets/fonts'
    ];
    for (const p of mustPublish) {
      expect(fs.existsSync(path.join(ROOT, p)), `${p} exists`).toBe(true);
      expect(isExcluded(p, excludes), `${p} must stay published`).toBe(false);
    }
  });

  test('no published page links to the unreleased /redesign/ preview', () => {
    for (const page of ['index.html', 'portfolio/index.html', 'privacy.html', '404.html', 'sitemap.xml']) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      expect(html, `${page} must not reference /redesign/`).not.toMatch(/\/redesign\//);
    }
  });
});
