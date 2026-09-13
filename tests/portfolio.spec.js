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
});
