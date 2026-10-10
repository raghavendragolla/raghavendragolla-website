const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Regression guards for the October 2026 content audit. Each blocked phrase
// below was a claim that the project repositories, certificates or resume did
// not support; reintroducing one should be a deliberate, evidence-backed edit.

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Content integrity', () => {
  test('unsupported claims removed by the audit do not return', () => {
    const pages = ['index.html', 'portfolio/index.html', 'portfolio/js/script.js'];
    const blocked = [
      /87\.4%/,                       // ROC-AUC not present in the cvd repository results
      /13 (clinical )?biomarkers/i,   // study uses 10 harmonised features across 4 cohorts
      /Preprint/,                     // dissertation is in progress, not a preprint
      /IEEE[- ]Format/i,
      /Honors Specialization/,        // the IBM certificate is a Professional Certificate
      /&lt;5ms|sub-5ms/,              // no latency measurement exists
      /R&sup2; (test )?accuracy|R² accuracy/i, // R² is not an accuracy metric
      /2026 &ndash; Present/,         // internship completed 28 Mar 2026
      /Ridge Linear Baseline/,        // repository baseline is Linear Regression (0.597)
      /highest net desire expansion/, // contradicted by the Go figure on the same page
      /Data Scientist &amp; Applied ML Researcher|Data Scientist & Applied ML Researcher/,
      // Phase 1 decisions (Oct 2026), checked against the capstone source data:
      /\+46(\.0)?%/,                  // 46.0% is Python's desired share; net change is +15.3%
      /\+88\.0%|\$121k/,               // Go figures not supported by the source data
      /data-tech="(go|docker)"/,       // Go / Docker presets removed
      /42\.5%|4,844|4,548|4,092/,      // incorrect comparator figures
      /SHAP (&amp;|&bull;|•|&) LIME/,  // LIME not implemented in any repository
      /Kafka|FastAPI/,                 // no verified experience / code
      /Guntur|GUNTUR/,                 // current location is Chandigarh
      /\bDAX\b/,                         // no evidence of DAX work (Power BI itself is on the resume)
      /within 24 hours|Response Time/, // no documented response-time commitment
      /califIncomeInput|capstoneExpInput|capstoneSalaryVal|Illustrative Pay Model|ILLUSTRATIVE PRICE SIMULATOR/
    ];
    for (const page of pages) {
      const src = read(page);
      for (const re of blocked) {
        expect(src, `${page} must not contain ${re}`).not.toMatch(re);
      }
    }
  });

  test('public resume PDF contains no phone number or phone placeholder', () => {
    const zlib = require('zlib');
    const raw = fs.readFileSync(path.join(ROOT, 'portfolio/resume/resume.pdf'));
    expect(raw.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const latin = raw.toString('latin1');
    const chunks = [latin];
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = re.exec(latin)) !== null) {
      const body = Buffer.from(m[1], 'latin1');
      try { chunks.push(zlib.inflateSync(body).toString('latin1')); } catch { chunks.push(m[1]); }
    }
    for (const c of chunks) {
      expect(c, 'no "+91" prefix').not.toContain('(+91)');
      expect(c, 'no masked placeholder').not.toMatch(/9X4X|[0-9X]{10}\)/);
      expect(c, 'no tel: link').not.toContain('tel:');
    }
  });

  test('every LinkedIn link and JSON-LD sameAs uses the canonical profile URL', () => {
    const CANONICAL = 'https://www.linkedin.com/in/raghavendragolla';
    for (const p of ['index.html', 'portfolio/index.html', 'privacy.html', '404.html', 'redesign/index.html']) {
      const src = read(p);
      const urls = src.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"'<\s)]*/g) || [];
      for (const u of urls) expect(u, `${p} LinkedIn URL`).toBe(CANONICAL);
      for (const block of src.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []) {
        const sameAs = JSON.stringify(JSON.parse(block.replace(/<\/?script[^>]*>/g, '')));
        if (sameAs.includes('linkedin')) expect(sameAs, `${p} JSON-LD sameAs`).toContain(`"${CANONICAL}"`);
      }
    }
  });

  test('heart-disease research links point to the actual repository', async ({ page }) => {
    await page.goto('/portfolio/');
    const repoLink = page.locator('#node-04-xai a', { hasText: 'GitHub Repo' });
    await expect(repoLink).toHaveAttribute('href', 'https://github.com/raghavendragolla/cvd');
    await expect(page.locator('#bibtexCode')).toContainText('github.com/raghavendragolla/cvd');
  });

  test('California project shows verified test-set results and links to the real model', async ({ page }) => {
    await page.goto('/portfolio/');
    const rows = page.locator('#califDemoStudio .results-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('0.836');
    await expect(rows.nth(0)).toContainText('$46,378');
    await expect(rows.nth(2)).toContainText('0.597');
    await expect(page.locator('#califDemoStudio a[href="https://house-price-prediction-raghav.streamlit.app"]')).toHaveCount(1);
  });

  test('capstone comparator shows only figures recomputed from the source data', async ({ page }) => {
    await page.goto('/portfolio/');
    const presets = page.locator('#capstoneTechPresets .preset-pill');
    await expect(presets).toHaveText(['Python', 'SQL', 'JavaScript', 'PostgreSQL']);
    await expect(page.locator('#capstoneDevShare')).toHaveText('39.8%');
    await expect(page.locator('#capstoneDesiredShare')).toHaveText('46.0%');
    await expect(page.locator('#capstoneMomentumVal')).toHaveText('+15.3%');
    await expect(page.locator('#capstoneJobCount')).toHaveText('1,171');
    await presets.nth(3).click();
    await expect(presets.nth(3)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#capstoneDevCount')).toHaveText('4,097 respondents');
    await expect(page.locator('#capstoneDesiredShare')).toHaveText('38.0%');
    await expect(page.locator('#capstoneJobCount')).toHaveText('—');
  });

  test('heart-disease study states the final 918-patient dataset and the exclusion', async ({ page }) => {
    await page.goto('/portfolio/');
    await expect(page.locator('#node-04-xai')).toContainText('918 patients after removing two exact duplicate records');
  });

  test('page CSPs allow exactly the Cloudflare Web Analytics hosts', () => {
    for (const p of ['index.html', 'portfolio/index.html', 'privacy.html', '404.html']) {
      const csp = read(p).match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)[1];
      const directive = (name) => (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) || '');
      expect(directive('script-src'), p).toContain('https://static.cloudflareinsights.com');
      expect(directive('connect-src'), p).toContain('https://cloudflareinsights.com');
      expect(csp, `${p} must not use wildcards or unsafe-eval`).not.toMatch(/\*|unsafe-eval/);
      expect(directive('script-src'), `${p} script-src must not allow unsafe-inline`).not.toContain('unsafe-inline');
    }
  });

  test('rotating headline can be paused (WCAG 2.2.2) and keeps a stable accessible name', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#headlineToggle');
    await expect(toggle).toHaveText('Pause headline animation');
    await toggle.click();
    await expect(toggle).toHaveText('Play headline animation');
    const before = await page.locator('#dynamic-text').textContent();
    await page.waitForTimeout(4000);
    expect(await page.locator('#dynamic-text').textContent()).toBe(before);
    await expect(page.locator('h1')).toContainText('intelligent solutions.');
    await expect(page.locator('#dynamic-text')).toHaveAttribute('aria-hidden', 'true');
  });

  test('an OS reduced-motion change does not override a manual pause', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const toggle = page.locator('#headlineToggle');
    await toggle.click();
    await expect(toggle).toHaveText('Play headline animation');
    // matchMedia 'change' events are dispatched asynchronously; wait for each.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(400);
    await expect(toggle).toHaveText('Play headline animation');
    const before = await page.locator('#dynamic-text').textContent();
    await page.waitForTimeout(4000);
    expect(await page.locator('#dynamic-text').textContent()).toBe(before);
  });

  test('rotation starts paused for reduced-motion users', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#headlineToggle')).toHaveText('Play headline animation');
    await ctx.close();
  });
});
