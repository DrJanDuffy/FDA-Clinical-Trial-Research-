# TrialScope — FDA trials & medical research finder

A single search box over four official medical databases. Type a condition, a drug
or a research topic and get back **clinical trials you might be able to join**,
**peer-reviewed research**, **new FDA approvals**, and **safety recalls** — each
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
- **CSV export** of the results currently on screen, or of your whole shortlist.
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

`.github/workflows/pages.yml` publishes the repository to GitHub Pages on every push
to `main`. Enable it once under **Settings → Pages → Source → GitHub Actions**.

Because the whole site is static, it also drops onto Netlify, Vercel, Cloudflare
Pages or any S3 bucket with no configuration.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

The suite drives a real Chromium against the page with every API call intercepted
and answered from `tests/fixtures.js`, so it runs offline and deterministically. It
covers the happy path for all four sources plus the cases that are easy to get
wrong — openFDA returning HTTP 404 to mean "no matches", ClinicalTrials.gov
rejecting the `aggFilters` parameter, and picking the correct approval date out of
a Drugs@FDA record that also contains non-approved submissions.

## How it is put together

```
index.html              markup and the filter controls
assets/css/styles.css   design tokens, light/dark themes, layout
assets/js/util.js       DOM, date, fetch and storage helpers
assets/js/sources.js    one adapter per API, all emitting the same item shape
assets/js/render.js     turns that shape into cards
assets/js/app.js        tabs, URL state, searching, saved items
tests/                  offline end-to-end suite
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
