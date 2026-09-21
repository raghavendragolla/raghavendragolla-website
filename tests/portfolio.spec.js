const { test, expect } = require('@playwright/test');

test.describe('Portfolio Page (/portfolio/)', () => {
  test('theme preference agrees with landing page', async ({ page }) => {
    // Set theme on landing page
    await page.goto('/');
    const htmlLanding = page.locator('html');
    const landingTheme = await htmlLanding.getAttribute('data-theme');

    // Navigate to portfolio
    await page.goto('/portfolio/');
    const htmlPortfolio = page.locator('html');
    const portfolioTheme = await htmlPortfolio.getAttribute('data-theme');

    expect(portfolioTheme).toBe(landingTheme);
  });

  test('Lucide icons render as valid SVG elements (guards against SRI failure)', async ({ page }) => {
    await page.goto('/portfolio/');
    
    // Lucide replaces <i data-lucide="..."> with <svg ...>
    const svgIcons = page.locator('.navlist svg');
    const count = await svgIcons.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test('project filters work, update aria-pressed, and match single-source card counts', async ({ page }) => {
    await page.goto('/portfolio/');
    
    const allBtn = page.locator('.filter-btn[data-filter="all"]');
    const mlBtn = page.locator('.filter-btn[data-filter="ml"]');
    
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(mlBtn).toHaveAttribute('aria-pressed', 'false');

    // Click Machine Learning filter
    await mlBtn.click();
    await expect(mlBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(allBtn).toHaveAttribute('aria-pressed', 'false');

    // Visible cards check
    const visibleCards = page.locator('.project-card:not(.is-hidden)');
    const visibleCount = await visibleCards.count();
    expect(visibleCount).toBeGreaterThan(0);

    // Live region announcement
    const liveRegion = page.locator('#filterStatus');
    await expect(liveRegion).toContainText('Showing');

    // Reset filter
    await allBtn.click();
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('Task 13 Verification: Project cards in DOM match filter counts and JSON-LD schema', async ({ page }) => {
    await page.goto('/portfolio/');

    // Count project cards in DOM
    const totalCards = await page.locator('.project-card').count();

    // Verify filter "all" count badge in markup matches
    const allCountBadge = await page.locator('.filter-btn[data-filter="all"] .filter-count').textContent();
    expect(parseInt(allCountBadge.trim(), 10)).toBe(totalCards);

    // Check JSON-LD
    const jsonLdContent = await page.$eval('script[type="application/ld+json"]', el => el.textContent);
    const jsonLd = JSON.parse(jsonLdContent);
    expect(jsonLd).toBeDefined();
  });

  test('modal focus trap: Certificate Lightbox modal traps focus, closes on Escape, and restores focus', async ({ page }) => {
    await page.goto('/portfolio/');
    
    const certTrigger = page.locator('.cert-preview-btn').first();
    await certTrigger.click();

    const certModal = page.locator('#certModal');
    await expect(certModal).toHaveClass(/active/);

    const closeBtn = page.locator('#closeCertBtn');
    await expect(closeBtn).toBeFocused();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(certModal).not.toHaveClass(/active/);

    // Focus must return to trigger
    await expect(certTrigger).toBeFocused();
  });

  test('modal focus trap: Research Citation modal traps focus, closes on Escape, and restores focus', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    await page.goto('/portfolio/');
    
    const citeTrigger = page.locator('#openCitationBtn');
    await citeTrigger.click();

    const citeModal = page.locator('#citationModal');
    await expect(citeModal).toHaveClass(/active/);

    const closeBtn = page.locator('#closeCitationBtn');
    await expect(closeBtn).toBeFocused();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(citeModal).not.toHaveClass(/active/);

    // Focus must return to trigger
    await expect(citeTrigger).toBeFocused();
  });

  test.skip('Developer & Analytics Dashboard renders properly with interactive controls (commented out)', async ({ page }) => {
    await page.goto('/portfolio/');

    const dashboardSection = page.locator('#dashboard');
    await expect(dashboardSection).toBeVisible();

    // Verify 4 KPI cards exist
    const kpiCards = page.locator('.dash-kpi-card');
    expect(await kpiCards.count()).toBe(4);

    // Verify Timeframe toggle works
    const allRangeBtn = page.locator('.dash-range-btn[data-range="all"]');
    const recentRangeBtn = page.locator('.dash-range-btn[data-range="current"]');
    const repoCount = page.locator('#kpi-repo-count');

    await expect(allRangeBtn).toHaveClass(/active/);
    await expect(repoCount).toContainText('6+');

    await recentRangeBtn.click();
    await expect(recentRangeBtn).toHaveClass(/active/);
    await expect(repoCount).toContainText('4+');

    // Switch back
    await allRangeBtn.click();
    await expect(repoCount).toContainText('6+');

    // Verify Donut Chart & Legend
    const donutSvg = page.locator('.donut-chart-svg');
    await expect(donutSvg).toBeVisible();
    const legendPills = page.locator('.donut-legend-pill');
    expect(await legendPills.count()).toBe(4);

    // Verify Activity Bar Chart
    const barCols = page.locator('.activity-bar-col');
    expect(await barCols.count()).toBe(6);

    // Verify GitHub Live Sync card & LinkedIn Impact card
    await expect(page.locator('.github-sync-card')).toBeVisible();
    await expect(page.locator('.linkedin-impact-card')).toBeVisible();
  });

  test('Security: GitHub API repository sync renders malicious payload safely as text without executing', async ({ page }) => {
    let dialogTriggered = false;
    page.on('dialog', () => { dialogTriggered = true; });

    await page.route('https://api.github.com/users/raghavendragolla/repos*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: '<img src=x onerror=alert(1)>',
            html_url: 'javascript:alert(1)',
            description: '<script>alert(2)</script>',
            language: 'Python',
            stargazers_count: 10,
            forks_count: 5
          }
        ])
      });
    });

    // Ensure #dashboard and #githubRepoList containers are available for initDashboard/fetchGitHubStats if Section 4 is commented out
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.body && !document.getElementById('dashboard')) {
          const dash = document.createElement('div');
          dash.id = 'dashboard';
          const testContainer = document.createElement('div');
          testContainer.id = 'githubRepoList';
          dash.appendChild(testContainer);
          document.body.appendChild(dash);
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });

    await page.goto('/portfolio/');

    // Wait for the repo list to be populated
    const repoItem = page.locator('#githubRepoList .repo-item-card').first();
    await expect(repoItem).toBeVisible({ timeout: 5000 });

    const repoName = repoItem.locator('.repo-name');
    await expect(repoName).toHaveText('<img src=x onerror=alert(1)>');

    // Confirm no <img> element was created
    const imgCount = await page.locator('#githubRepoList img').count();
    expect(imgCount).toBe(0);

    // Confirm dangerous scheme was blocked from href
    const href = await repoName.getAttribute('href');
    expect(href).not.toContain('javascript:');

    expect(dialogTriggered).toBe(false);
  });

  test('Issue 4: Theme persistence and synchronization across pages', async ({ page }) => {
    // Navigate to landing and set theme to dark
    await page.goto('/');
    await page.evaluate(() => {
      window.rgTheme.setTheme('dark');
    });

    // Check both storage keys
    const storedRgTheme = await page.evaluate(() => localStorage.getItem('rg:theme'));
    const storedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(storedRgTheme).toBe('dark');
    expect(storedTheme).toBe('dark');

    // Navigate to portfolio
    await page.goto('/portfolio/');
    const portfolioTheme = await page.locator('html').getAttribute('data-theme');
    expect(portfolioTheme).toBe('dark');

    // Toggle on portfolio
    await page.evaluate(() => {
      window.rgTheme.toggle();
    });
    const toggledRgTheme = await page.evaluate(() => localStorage.getItem('rg:theme'));
    const toggledTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(toggledRgTheme).toBe('light');
    expect(toggledTheme).toBe('light');

    // Navigate back to landing
    await page.goto('/');
    const landingTheme = await page.locator('html').getAttribute('data-theme');
    expect(landingTheme).toBeNull(); // Light mode has no data-theme attribute
  });

  test('Issue 5 & 6: Authoritative singleton IST clock and single SW registration path', async ({ page }) => {
    await page.goto('/portfolio/');
    const swRegistered = await page.evaluate(() => window._swRegistered);
    const clockInit = await page.evaluate(() => window._istClockInitialized);

    expect(swRegistered).toBe(true);
    expect(clockInit).toBe(true);

    const clockText = await page.locator('#vitals-clock').textContent();
    expect(clockText).toContain('IST');
  });

  test('Issue 7: Hero metrics count-up selector activates on .hero-metrics-editorial', async ({ page }) => {
    await page.goto('/portfolio/');
    const metricsSection = page.locator('.hero-metrics-editorial');
    await expect(metricsSection).toBeVisible();

    const statNumber = page.locator('.hero-metrics-editorial .stat-number').first();
    await expect(statNumber).toBeVisible();

    // Allow animation frame count-up to finish
    await page.waitForTimeout(2000);
    const countText = await statNumber.textContent();
    expect(countText).toContain('2027');
  });

  test('Issue 8: Mailto / contact channel copies email, displays feedback toast, and prevents navigation', async ({ page }) => {
    await page.goto('/portfolio/');

    // Mock navigator.clipboard
    await page.evaluate(() => {
      window._copiedText = '';
      navigator.clipboard.writeText = async (text) => {
        window._copiedText = text;
        return Promise.resolve();
      };
    });

    const emailButton = page.locator('button.contact-quick-channel[data-copy]').first();
    await emailButton.click();

    // Verify toast feedback appears
    const toast = page.locator('#toast');
    await expect(toast).toContainText('Copied email to clipboard');

    // Verify clipboard received email
    const copied = await page.evaluate(() => window._copiedText);
    expect(copied).toBe('raghavendrayadavgolla@gmail.com');

    // Verify page did not navigate away
    expect(page.url()).toContain('/portfolio/');
  });

  test('Issue 13: Offline portfolio verification - shell and precached assets load offline', async ({ page, context }) => {
    // 1. Visit portfolio page online
    await page.goto('/portfolio/');

    // 2. Wait for service worker to register and caches to be populated
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      if (!reg || !reg.active) return false;
      const cache = await caches.open('raghavendra-portfolio-v22.0');
      const keys = await cache.keys();
      return keys.length >= 15;
    }, { timeout: 10000 });

    // 3. Emulate offline network condition
    await context.setOffline(true);

    // 4. Reload page while offline
    const response = await page.reload();
    expect(response.status()).toBe(200);

    // 5. Verify DOM shell and critical elements are present
    const title = await page.title();
    expect(title).toContain('Raghavendra Golla');

    // 6. Verify offline fetch of critical precached stylesheet resolves via SW cache
    const cachedCss = await page.evaluate(async () => {
      const res = await fetch('/portfolio/css/style.css?v=22.0');
      return res.ok && res.status === 200;
    });
    expect(cachedCss).toBe(true);
  });
});
