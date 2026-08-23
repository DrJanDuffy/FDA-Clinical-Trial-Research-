/*
 * Accessibility tests.
 *
 * Runs axe-core against every tab of the site in both colour themes, asserting
 * zero WCAG 2.1 A/AA violations. This matters more than usual here: people
 * searching for trials and drug recalls skew older and are disproportionately
 * likely to be using a screen reader, high-contrast mode, or keyboard-only
 * navigation.
 *
 * As with the smoke suite, all API traffic is answered from fixtures so the run
 * is offline and deterministic.
 *
 *   npm run test:a11y
 */
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const F = require('./fixtures.js');
const path = require('node:path');

const SITE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const LAUNCH = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};

const TABS = ['overview', 'trials', 'research', 'approvals', 'safety', 'watchlist'];
const THEMES = ['light', 'dark'];

// WCAG 2.1 Level A and AA — the tiers referenced by the ADA and Section 508.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function fixtureFor(url) {
  if (url.includes('clinicaltrials.gov')) return F.ctg;
  if (url.includes('europepmc')) return F.epmc;
  if (url.includes('drugsfda')) return F.drugsfda;
  if (url.includes('enforcement')) return F.enforcement;
  return { meta: { results: { total: 0 } }, results: [] };
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  // axe-core requires an explicit context rather than browser.newPage().
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtureFor(url))
    });
  });

  await page.goto(SITE);
  await page.waitForTimeout(300);

  // A populated page exercises far more markup than an empty one, so search first.
  await page.fill('#q', 'pancreatic cancer');
  await page.click('#searchForm button[type=submit]');
  await page.waitForTimeout(900);

  // Put something in the watchlist so that tab has real content to audit.
  await page.click('.tab[data-tab=trials]');
  await page.waitForTimeout(700);
  await page.click('.card .save-btn');
  await page.waitForTimeout(150);

  let failures = 0;
  let checks = 0;

  for (const theme of THEMES) {
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);

    for (const tab of TABS) {
      await page.click(`.tab[data-tab=${tab}]`);
      await page.waitForTimeout(700);

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      checks++;

      if (!violations.length) {
        console.log(`  ✓ ${theme}/${tab}`);
        continue;
      }

      failures++;
      console.log(`  ✗ ${theme}/${tab} — ${violations.length} violation(s)`);
      for (const v of violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`        ${node.target.join(' ')}`);
          const detail = (node.failureSummary || '').split('\n').filter(Boolean).slice(1, 3);
          for (const line of detail) console.log(`          ${line.trim()}`);
        }
      }
    }
  }

  console.log(`\n${checks - failures}/${checks} page states pass WCAG 2.1 A/AA`);
  if (failures) process.exitCode = 1;
  await browser.close();
})();
