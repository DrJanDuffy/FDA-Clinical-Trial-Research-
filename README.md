# TrialScope — FDA trials & medical research finder

A single search box over four official medical databases. Type a condition, a drug
or a research topic and get back **clinical trials you might be able to join**,
**research papers and preprints**, **new FDA approvals**, and **safety recalls** — each
result linking straight back to its original record.

It is a static site. There is no server, no build step, no API key and no account:
the page talks to the public APIs directly from the visitor's browser.

## What it searches

| Tab | Source | What you get |
| --- | --- | --- |
| Clinical Trials | [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) | Status, phase, sponsor, enrolment, study sites, plain-language summary |
| Research | [Europe PMC](https://europepmc.org/RestfulWebService) | Journal articles and preprints (indexes PubMed/MEDLINE + PMC), abstracts, DOIs, citation counts |
| FDA Approvals | [openFDA](https://open.fda.gov/apis/) `drugsfda`, `device/pma`, `device/510k` | New drug, biologic and device decisions with approval dates and review priority |
| Safety & Recalls | [openFDA](https://open.fda.gov/apis/) `enforcement` | Drug, device and food recalls graded Class I–III by potential harm |

The **Overview** tab runs one query against all four at once and shows the top hits
from each, so you can see at a glance where the activity is.

## Features

- **Real filters per source** — trial phase/status/location, publication window,
  open-access-only, recall severity, approval type, and more.
- **Shareable URLs** — the query and every filter live in the address bar, so any
  search can be bookmarked or sent to someone else.
- **Save a shortlist** — bookmark any result; it is kept in `localStorage` (this
  browser only, never uploaded) and grouped by type under the Saved tab.
- **CSV and RIS export** of the results on screen, or of your whole shortlist. RIS
  imports straight into Zotero, EndNote or Mendeley.
- **Data freshness** — the footer shows when ClinicalTrials.gov last refreshed its
  registry, read from the API's own `dataTimestamp`.
- **Light and dark themes**, following your OS by default.
- **Keyboard friendly** — `/` jumps to the search box, arrow keys move between tabs.
- **Honest failure states** — a source that is down, rate-limited or returns nothing
  says so and offers a retry, rather than showing a blank page.

## Running it

Any static file server works, and the page also runs from `file://` if you just
open `index.html`.

```bash
git clone https://github.com/DrJanDuffy/FDA-Clinical-Trial-Research-.git
cd FDA-Clinical-Trial-Research-
npm start          # http://localhost:8080
```

### Deploying

`npm run build` copies the publishable files into `dist/` — that is what every
deploy target ships, so `node_modules`, tests and workflows never leave the repo.

Three targets are wired up. Each is **off until you opt in**, so an unconfigured
one can never fail CI:

| Target | Turn it on | Also needs |
| --- | --- | --- |
| GitHub Pages | repo variable `ENABLE_GITHUB_PAGES=true` | Settings → Pages → Source → **GitHub Actions** |
| Cloudflare Workers | repo variable `ENABLE_CLOUDFLARE_WORKERS=true` | secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Vercel | repo variable `ENABLE_VERCEL=true` | secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |

Repository variables live under **Settings → Secrets and variables → Actions →
Variables**. If you would rather let Vercel build from its own dashboard, link the
repo there and delete `deploy-vercel.yml` — `vercel.json` already describes the build.

Cloudflare reads `_headers` and Vercel reads `vercel.json`; both apply the
same Content-Security-Policy, which allow-lists exactly the three API origins the
site talks to.

The Cloudflare target uses [Workers Static Assets][wsa] rather than Pages, which
Cloudflare has put into maintenance mode. `wrangler.jsonc` holds the whole
configuration — a name, a compatibility date and `dist/` as the asset directory —
and there is no Worker script, so Cloudflare serves the files directly. Pushes to
`main` run `wrangler deploy`; pull requests run `wrangler versions upload`, which
publishes a preview URL without moving live traffic. Set repo variable
`CLOUDFLARE_WORKER_NAME` to deploy under a name other than `trialscope`, and run
`npx wrangler dev` to preview the built site locally.

[wsa]: https://developers.cloudflare.com/workers/static-assets/

### Ops notifications

`.github/workflows/notify.yml` POSTs a small JSON payload to a Zapier catch hook on
every push to `main` and every published release, so a deploy can raise a Notion
page or an Asana task. Enable with repo variable `ENABLE_OPS_NOTIFY=true` and secret
`ZAPIER_HOOK_URL`. The fan-out lives in Zapier, so changing the destination never
touches this repo.

## Quality gates

```bash
npm install
npx playwright install chromium

npm run lint        # Biome
npm test            # smoke suite (41 assertions)
npm run test:a11y   # axe-core, WCAG 2.1 A/AA
npm run lighthouse  # performance / SEO budgets
npm run test:all    # lint + smoke + a11y
```

Every one of these also runs in CI on each pull request.

**Smoke suite** — drives a real Chromium against the page with every API call
intercepted and answered from `tests/fixtures.js`, so it runs offline and
deterministically. It covers the happy path for all four sources plus the cases
that are easy to get wrong: openFDA returning HTTP 404 to mean "no matches",
ClinicalTrials.gov rejecting `aggFilters`, picking the correct approval date out
of a Drugs@FDA record containing non-approved submissions, and RIS output being
structurally valid.

**Accessibility** — runs axe-core over all six tabs in both themes (12 page
states), asserting zero WCAG 2.1 A/AA violations. This matters more than usual
here: people searching for trials and recalls skew older and are
disproportionately likely to use a screen reader or high-contrast mode.

**Lighthouse** — audits `dist/` through its own static server, so no deploy is
needed. Budgets fail the build below 0.9 performance or 0.95 accessibility.

A `pre-commit` hook (installed by `npm install`) lints staged files so none of
this fails in CI first.

### A note on formatting

Biome's linter is enforced; its **formatter is deliberately disabled**. On this
codebase it reflows deliberately compact one-liners into three-line blocks and
splits short arrays across a line each, which reads worse rather than better.
Lint catches bugs; the formatter was only churning the diff.

## How it is put together

```text
index.html               markup, filter controls and the static intro panel
assets/css/styles.css    design tokens, light/dark themes, layout
assets/js/util.js        DOM, date, fetch, export and storage helpers
assets/js/sources.js     one adapter per API, all emitting the same item shape
assets/js/render.js      turns that shape into cards
assets/js/app.js         tabs, URL state, searching, saved items
scripts/build.js         copies the publishable site into dist/
tests/smoke.test.js      offline end-to-end suite
tests/a11y.test.js       axe-core accessibility suite
_headers / vercel.json   security headers (CSP, nosniff, frame-ancestors)
```

Each adapter in `sources.js` exposes `search(state, cursor)` and returns
`{ total, items, next }`, where every item is normalised to the same structure.
That is why one renderer can draw a trial, a paper, an approval and a recall, and
why the Overview tab can mix all four without special cases.

Two API quirks are handled defensively, because both would otherwise show the user
an error for something that is not their problem:

- openFDA replies **404** when a query simply matches nothing. That is translated
  into an empty result set, not a failure.
- ClinicalTrials.gov's `aggFilters` parameter is the documented way to filter by
  phase and study type, but if it is ever rejected the request is retried without
  it and the filtering is applied on the client instead.

## Important

TrialScope is a search tool, **not medical advice**. Results come as-is from public
databases and may be incomplete or out of date — registry records are updated by
sponsors, not in real time. Never start, stop or change treatment based on what you
find here. Talk to a qualified healthcare professional, and confirm anything
important against the original record.

## Licence

MIT — see [LICENSE](LICENSE). The data itself belongs to its respective sources and
is subject to their terms of use.
