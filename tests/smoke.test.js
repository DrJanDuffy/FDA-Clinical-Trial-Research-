/*
 * End-to-end smoke tests.
 *
 * Every outbound API call is intercepted and answered with a fixture shaped like
 * the real response, so the suite runs offline and deterministically. It covers
 * the happy path for all four sources plus the awkward cases that are easy to get
 * wrong: openFDA answering 404 for "no matches", ClinicalTrials.gov rejecting
 * aggFilters, and picking the right submission date out of a Drugs@FDA record.
 *
 *   npm install && npx playwright install chromium && npm test
 */
const { chromium } = require('playwright');
const F = require('./fixtures.js');
const path = require('node:path');

// The site is a plain static page, so the suite drives it straight off the filesystem.
const SITE = 'file://' + path.resolve(__dirname, '..', 'index.html');

// Honour a preinstalled browser if one is set, otherwise let Playwright find its own.
const LAUNCH = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};
const errors = [];
const seenUrls = [];

async function runSuite(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  // the suite deliberately serves 4xx/5xx to exercise error paths; those network
  // log lines are expected, real JS exceptions are not.
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text());
  });

  // Intercept every outbound API call and answer with a fixture.
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    seenUrls.push(url);
    let body = null;
    if (url.includes('clinicaltrials.gov/api/v2/studies')) body = F.ctg;
    else if (url.includes('europepmc')) body = F.epmc;
    else if (url.includes('drugsfda')) body = F.drugsfda;
    else if (url.includes('enforcement')) body = F.enforcement;
    else if (url.includes('/device/510k') || url.includes('/device/pma')) body = { meta:{results:{total:0}}, results: [] };
    if (!body) return route.fulfill({ status: 404, body: '{"error":{"message":"unrouted"}}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const step = async (name, fn) => {
    try { await fn(); console.log('  ✓ ' + name); }
    catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); process.exitCode = 1; }
  };

  await page.goto(SITE);
  await page.waitForTimeout(300);

  console.log('\n[1] Landing / overview');
  await step('intro panel renders', async () => {
    await page.waitForSelector('.hero-note h2', { timeout: 3000 });
    const t = await page.textContent('.hero-note h2');
    if (!/four official medical databases/i.test(t)) throw new Error('unexpected: ' + t);
  });
  await step('four hero cards', async () => {
    const n = await page.locator('.hero-card').count();
    if (n !== 4) throw new Error('got ' + n);
  });

  await step('no results chrome before a search', async () => {
    if (await page.locator('#csvBtn').isVisible()) throw new Error('Export CSV shown with nothing to export');
    if (await page.locator('#moreBtn').isVisible()) throw new Error('Load more shown with no results');
    if (await page.locator('#resultsHead').isVisible()) throw new Error('results header shown with no results');
  });
  await step('clear button hidden until you type', async () => {
    if (await page.locator('#clearQ').isVisible()) throw new Error('clear shown on empty box');
  });

  console.log('\n[2] Unified search across all sources');
  await page.fill('#q', 'pancreatic cancer');
  await page.click('#searchForm button[type=submit]');
  await page.waitForTimeout(900);
  await step('four group headings', async () => {
    const n = await page.locator('.group-head').count();
    if (n !== 4) throw new Error('got ' + n);
  });
  await step('cards from every source', async () => {
    const n = await page.locator('.card').count();
    if (n < 6) throw new Error('only ' + n + ' cards');
  });
  await step('URL carries the query', async () => {
    const u = page.url();
    if (!u.includes('q=pancreatic')) throw new Error(u);
  });

  await step('Export CSV stays hidden on the combined overview', async () => {
    if (await page.locator('#csvBtn').isVisible()) throw new Error('shown on overview');
  });

  console.log('\n[3] Clinical Trials tab');
  await page.click('.tab[data-tab=trials]');
  await page.waitForTimeout(700);
  await step('NCT id + recruiting badge', async () => {
    const html = await page.innerHTML('#resultsBody');
    if (!html.includes('NCT05012345')) throw new Error('no NCT id');
    if (!/badge ok">Recruiting</.test(html)) throw new Error('no recruiting badge');
    if (!/Phase 2/.test(html)) throw new Error('no phase badge');
  });
  await step('terminated study gets danger badge', async () => {
    const html = await page.innerHTML('#resultsBody');
    if (!/badge danger">Terminated/.test(html)) throw new Error('missing danger badge');
  });
  await step('locations summarised', async () => {
    const html = await page.innerHTML('#resultsBody');
    if (!/3 sites/.test(html)) throw new Error('no site count');
    if (!/United States, Germany/.test(html)) throw new Error('no countries');
  });
  await step('total count shown', async () => {
    const t = await page.textContent('#resultsCount');
    if (!/1,487/.test(t)) throw new Error(t);
  });
  await step('Load more visible (nextPageToken present)', async () => {
    if (await page.locator('#moreBtn').isHidden()) throw new Error('hidden');
  });
  await step('trial link points at ClinicalTrials.gov', async () => {
    const href = await page.getAttribute('.card-title a', 'href');
    if (href !== 'https://clinicaltrials.gov/study/NCT05012345') throw new Error(href);
  });

  console.log('\n[4] Filters build correct requests');
  seenUrls.length = 0;
  await page.selectOption('#t_phase', '3');
  await page.waitForTimeout(600);
  await step('phase filter -> aggFilters=phase:3', async () => {
    const u = seenUrls.find(x => x.includes('clinicaltrials'));
    if (!u) throw new Error('no request fired');
    if (!/aggFilters=phase%3A3/.test(u)) throw new Error(u);
  });
  seenUrls.length = 0;
  await page.fill('#t_locn', 'Boston');
  await page.dispatchEvent('#t_locn', 'change');
  await page.waitForTimeout(600);
  await step('location -> query.locn', async () => {
    const u = seenUrls.find(x => x.includes('clinicaltrials'));
    if (!/query.locn=Boston/.test(u)) throw new Error(u);
  });

  console.log('\n[5] Research tab (Europe PMC)');
  await page.click('.tab[data-tab=research]');
  await page.waitForTimeout(700);
  await step('RCT + preprint badges', async () => {
    const html = await page.innerHTML('#resultsBody');
    if (!/>RCT</.test(html)) throw new Error('no RCT badge');
    if (!/Preprint — not peer reviewed/.test(html)) throw new Error('no preprint warning');
    if (!/Free full text/.test(html)) throw new Error('no OA badge');
  });
  await step('DOI link used for the article', async () => {
    const href = await page.getAttribute('.card-title a', 'href');
    if (href !== 'https://doi.org/10.1056/NEJMoa2401234') throw new Error(href);
  });
  await step('citation count in meta', async () => {
    if (!/Cited by:\s*412/.test(await page.innerText('#resultsBody'))) throw new Error('missing');
  });
  seenUrls.length = 0;
  await page.check('#r_oa');
  await page.waitForTimeout(600);
  await step('multi-word query asks for the phrase first', async () => {
    // Regression guard: an unquoted multi-word query made Europe PMC return
    // hearing-loss papers for "hair loss".
    seenUrls.length = 0;
    await page.fill('#q', 'hair loss');
    await page.click('#searchForm button[type=submit]');
    await page.waitForTimeout(700);
    const u = decodeURIComponent(seenUrls.find(x => x.includes('europepmc')) || '');
    if (!/"hair\+?\s?loss"/.test(u.replace(/\+/g, ' '))) throw new Error('phrase not quoted: ' + u);
    if (!/OR/.test(u)) throw new Error('loose fallback missing: ' + u);
  });
  await step('sorting by citations scopes to title/abstract/keywords', async () => {
    // Regression guard: under an explicit sort, a full-text match let
    // hugely-cited unrelated reviews outrank papers about the topic.
    await page.fill('#q', 'hair loss');
    await page.selectOption('#r_sort', 'CITED desc');
    await page.waitForTimeout(700);
    seenUrls.length = 0;
    await page.selectOption('#r_sort', 'CITED desc');
    await page.click('#searchForm button[type=submit]');
    await page.waitForTimeout(700);
    const u = decodeURIComponent(seenUrls.find(x => x.includes('europepmc')) || '').replace(/\+/g, ' ');
    if (!/TITLE:"hair loss"/.test(u)) throw new Error('not scoped to TITLE: ' + u);
    if (!/ABSTRACT:"hair loss"/.test(u)) throw new Error('not scoped to ABSTRACT: ' + u);
    if (!/KW:"hair loss"/.test(u)) throw new Error('not scoped to KW: ' + u);
    if (/OR \(hair loss\)/.test(u)) throw new Error('loose full-text branch still present: ' + u);
  });
  await step('relevance sort keeps the broader phrase-or-loose form', async () => {
    seenUrls.length = 0;
    await page.selectOption('#r_sort', '');
    await page.click('#searchForm button[type=submit]');
    await page.waitForTimeout(700);
    const u = decodeURIComponent(seenUrls.find(x => x.includes('europepmc')) || '').replace(/\+/g, ' ');
    if (/TITLE:/.test(u)) throw new Error('should not field-scope under relevance: ' + u);
    if (!/"hair loss" OR/.test(u)) throw new Error('phrase-or-loose form missing: ' + u);
  });

  await step('single-word query is not quoted', async () => {
    seenUrls.length = 0;
    await page.fill('#q', 'alopecia');
    await page.click('#searchForm button[type=submit]');
    await page.waitForTimeout(700);
    const u = decodeURIComponent(seenUrls.find(x => x.includes('europepmc')) || '');
    if (/"alopecia"/.test(u)) throw new Error('single word should not be phrase-quoted: ' + u);
  });
  await page.fill('#q', 'pancreatic cancer');
  await page.click('#searchForm button[type=submit]');
  await page.waitForTimeout(700);

  await step('open-access filter -> OPEN_ACCESS:y', async () => {
    const u = decodeURIComponent(seenUrls.find(x => x.includes('europepmc')) || '');
    if (!/OPEN_ACCESS:y/.test(u)) throw new Error(u);
    if (!/FIRST_PDATE:\[/.test(u)) throw new Error('no date window: ' + u);
  });

  console.log('\n[6] FDA approvals tab');
  await page.click('.tab[data-tab=approvals]');
  await page.waitForTimeout(700);
  await step('brand (generic) title composed', async () => {
    const t = await page.textContent('.card-title');
    if (!/ZYNTARA \(tarlizumab\)/.test(t)) throw new Error(t);
  });
  await step('priority review + BLA badges', async () => {
    const html = await page.innerHTML('#resultsBody');
    if (!/Priority review/.test(html)) throw new Error('no priority');
    if (!/Biologic \(BLA\)/.test(html)) throw new Error('no BLA');
    if (!/New approval/.test(html)) throw new Error('no orig badge');
    if (!/Generic \(ANDA\)/.test(html)) throw new Error('no ANDA');
  });
  await step('approval date = latest AP submission, not the TA one', async () => {
    const t = await page.innerText('#resultsBody');
    if (!/Jun 12, 2026/.test(t)) throw new Error('wrong date; got: ' + t.slice(0, 400));
    if (/Jul 1, 2026/.test(t)) throw new Error('picked up a non-approved submission');
  });
  await step('Drugs@FDA link uses numeric ApplNo', async () => {
    const href = await page.getAttribute('.card-title a', 'href');
    if (!/ApplNo=761234$/.test(href)) throw new Error(href);
  });
  await step('request asks only for approved submissions', async () => {
    const u = decodeURIComponent(seenUrls.find(x => x.includes('drugsfda')) || '');
    if (!/submissions.submission_status:AP/.test(u)) throw new Error(u);
    // openFDA delimits range terms with '+' (a URL-encoded space) — both forms are valid
    if (!/submissions\.submission_status_date:\[\d{8}[+ ]TO[+ ]\d{8}\]/.test(u)) throw new Error('bad range: ' + u);
  });

  console.log('\n[7] Safety tab');
  await page.click('.tab[data-tab=safety]');
  await page.waitForTimeout(700);
  await step('Class I renders as danger', async () => {
    const html = await page.innerHTML('#resultsBody');
    if (!/badge danger">Class I</.test(html)) throw new Error('no class I danger badge');
    if (!/Ongoing/.test(html)) throw new Error('no status badge');
  });
  await step('recall reason shown', async () => {
    if (!/glass fragments/.test(await page.innerText('#resultsBody'))) throw new Error('missing reason');
  });

  console.log('\n[8] Saving / watchlist');
  await page.click('.card .save-btn');
  await page.waitForTimeout(150);
  await step('counter increments', async () => {
    const c = await page.textContent('#watchCount');
    if (c !== '1') throw new Error(c);
  });
  await page.click('#watchlistBtn');
  await page.waitForTimeout(300);
  await step('saved item appears in watchlist', async () => {
    if (!/glass fragments/.test(await page.innerText('#resultsBody'))) throw new Error('not listed');
  });
  await step('watchlist survives reload', async () => {
    await page.reload();
    await page.waitForTimeout(500);
    if (await page.textContent('#watchCount') !== '1') throw new Error('lost after reload');
  });

  console.log('\n[9] CSV export');
  await page.click('#watchlistBtn');
  await page.waitForTimeout(300);
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 4000 }),
    page.click('#csvBtn')
  ]).then(r => r[0]).catch(() => null);
  await step('csv download fires with a sane filename', async () => {
    if (!dl) throw new Error('no download event');
    if (!/^trialscope-watchlist-.*\.csv$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
  });

  console.log('\n[9b] RIS citation export');
  await page.click('.tab[data-tab=research]');
  await page.waitForTimeout(700);
  const risDl = await Promise.all([
    page.waitForEvent('download', { timeout: 4000 }),
    page.click('#risBtn')
  ]).then(r => r[0]).catch(() => null);
  await step('RIS download fires', async () => {
    if (!risDl) throw new Error('no download event');
    if (!/\.ris$/.test(risDl.suggestedFilename())) throw new Error(risDl.suggestedFilename());
  });
  await step('RIS body is a valid, importable record', async () => {
    const fs = require('node:fs');
    const p = await risDl.path();
    const text = fs.readFileSync(p, 'utf8');
    // A reference manager needs a type first, a terminator last, and real fields between.
    if (!/^\uFEFF?TY {2}- JOUR/m.test(text)) throw new Error('missing JOUR type: ' + text.slice(0, 80));
    if (!/^ER {2}- *$/m.test(text)) throw new Error('missing ER terminator');
    if (!/^TI {2}- Randomized Trial of Semaglutide/m.test(text)) throw new Error('missing title');
    if (!/^AU {2}- Kosiborod MN/m.test(text)) throw new Error('missing author');
    if (!/^JO {2}- The New England Journal of Medicine/m.test(text)) throw new Error('missing journal');
    if (!/^PY {2}- 2026/m.test(text)) throw new Error('missing year');
    if (!/^UR {2}- https:\/\/doi\.org\//m.test(text)) throw new Error('missing URL');
    const records = (text.match(/^TY {2}- /gm) || []).length;
    const enders  = (text.match(/^ER {2}- *$/gm) || []).length;
    if (records !== enders) throw new Error(`${records} records but ${enders} terminators`);
  });

  console.log('\n[10] Error handling');
  await page.unroute('**/*');
  await page.route('**/*', route => route.request().url().startsWith('file://')
    ? route.continue()
    : route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"upstream exploded"}}' }));
  await page.click('.tab[data-tab=trials]');
  await page.waitForTimeout(700);
  await step('server error shows a retry state, not a blank page', async () => {
    const t = await page.innerText('#resultsBody');
    if (!/Something went wrong/.test(t)) throw new Error(t.slice(0, 200));
    if (!/HTTP 500/.test(t)) throw new Error('no status shown');
    if (!(await page.locator('.state.error .btn').isVisible())) throw new Error('no retry button');
  });

  console.log('\n[11] openFDA 404 == no results, not an error');
  await page.unroute('**/*');
  await page.route('**/*', route => route.request().url().startsWith('file://')
    ? route.continue()
    : route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"NOT_FOUND","message":"No matches found!"}}' }));
  await page.click('.tab[data-tab=safety]');
  await page.waitForTimeout(700);
  await step('shows the empty state', async () => {
    const t = await page.innerText('#resultsBody');
    if (!/No matches/.test(t)) throw new Error(t.slice(0, 200));
    if (/Something went wrong/.test(t)) throw new Error('treated 404 as an error');
  });

  console.log('\n[12] aggFilters 400 fallback');
  await page.unroute('**/*');
  let sawFallback = false;
  const CTG_PARAMS = new Set(['query.term', 'query.cond', 'query.intr', 'query.locn', 'query.titles',
    'query.spons', 'query.id', 'filter.overallStatus', 'filter.geo', 'filter.ids', 'aggFilters',
    'pageSize', 'pageToken', 'countTotal', 'sort', 'format', 'fields']);
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    if (url.includes('clinicaltrials')) {
      // ClinicalTrials.gov rejects any unrecognised parameter with a 400.
      const unknown = [...new URL(url).searchParams.keys()].filter(k => !CTG_PARAMS.has(k));
      if (unknown.length) {
        return route.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ message: 'unknown parameter: ' + unknown.join(', ') }) });
      }
      if (url.includes('aggFilters')) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"unsupported aggFilters"}' });
      sawFallback = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(F.ctg) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"meta":{"results":{"total":0}},"results":[]}' });
  });
  await page.click('.tab[data-tab=trials]');
  await page.waitForTimeout(900);
  await step('retries without aggFilters and filters phase client-side', async () => {
    if (!sawFallback) throw new Error('never retried');
    const t = await page.innerText('#resultsBody');
    if (/Something went wrong/.test(t)) throw new Error('surfaced the 400 to the user');
    // phase filter is still 3, fixture studies are PHASE2/NA -> both filtered out
    if (!/No matches/.test(t)) throw new Error('client-side phase filter did not apply: ' + t.slice(0,150));
  });

  console.log('\n[13] Theme toggle');
  await page.click('#themeBtn');
  await page.waitForTimeout(150);
  await step('switches to dark and persists', async () => {
    if (await page.getAttribute('html', 'data-theme') !== 'dark') throw new Error('not dark');
    await page.reload(); await page.waitForTimeout(400);
    if (await page.getAttribute('html', 'data-theme') !== 'dark') throw new Error('not persisted');
  });

  console.log('\n[14] Keyboard access');
  await page.unroute('**/*');
  await page.route('**/*', r => r.request().url().startsWith('file://')
    ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(F.ctg) }));
  await page.click('.tab[data-tab=overview]');
  await page.waitForTimeout(400);
  await step('arrow keys move between tabs', async () => {
    await page.focus('#tab-overview');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    if (await page.getAttribute('#tab-trials', 'aria-selected') !== 'true') throw new Error('arrow did not switch');
    if (await page.evaluate(() => document.activeElement.id) !== 'tab-trials') throw new Error('focus did not move');
  });
  await step('roving tabindex leaves one stop in the tablist', async () => {
    const zero = await page.locator('.tab[tabindex="0"]').count();
    if (zero !== 1) throw new Error('expected 1 tabbable tab, got ' + zero);
  });
  await step('panel is labelled by the active tab', async () => {
    if (await page.getAttribute('#results', 'aria-labelledby') !== 'tab-trials') throw new Error('wrong label');
  });
  await step('"/" focuses the search box', async () => {
    // Move focus out of any field first; the shortcut must not fire while typing.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('/');
    await page.waitForTimeout(120);
    if (await page.evaluate(() => document.activeElement.id) !== 'q') throw new Error('did not focus search');
    if (await page.inputValue('#q') === '/') throw new Error('slash leaked into the box');
  });

  console.log('\n--- JS errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none') + ' ---');
  if (errors.length) process.exitCode = 1;
}

// Anything outside a step() — navigation, routing, fixtures — can still throw.
// Closing in `finally` means a setup failure reports itself instead of leaving
// an orphaned browser and an unhandled rejection with no summary.
(async () => {
  const browser = await chromium.launch(LAUNCH);
  try {
    await runSuite(browser);
  } catch (e) {
    console.log('\nSUITE ABORTED — ' + (e && e.message));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
