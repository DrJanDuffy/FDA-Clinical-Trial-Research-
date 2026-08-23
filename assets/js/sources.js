/* ============================================================
   sources.js — adapters for the four public data APIs.

   Every adapter exposes:
     search(state, cursor) -> Promise<{ total, items[], next }>
   and returns items in one normalised shape so a single
   renderer can draw all of them.
   ============================================================ */
(function () {
  var U = TS.util;

  /* Normalised item factory */
  function item(o) {
    return {
      key: o.key,
      source: o.source,
      sourceLabel: o.sourceLabel,
      title: o.title || 'Untitled record',
      url: o.url || '',
      badges: (o.badges || []).filter(Boolean),
      chips: (o.chips || []).filter(Boolean),
      summary: o.summary || '',
      meta: (o.meta || []).filter(function (m) { return m && m[1]; }),
      csv: o.csv || {}
    };
  }

  /* Strip characters that would break a Lucene-ish query */
  function safeTerm(s) {
    return U.clean(s).replace(/["\\(){}[\]^~:]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ============================================================
     1. ClinicalTrials.gov — API v2
     https://clinicaltrials.gov/data-api/api
     ============================================================ */
  var CTG_BASE = 'https://clinicaltrials.gov/api/v2/studies';

  // All 14 values of the Status enum, as published by /api/v2/studies/enums.
  // The last five are expanded-access statuses, which the Study type filter
  // can surface. Labels are the registry's own wording rather than a
  // prettified version of the enum key, so a card reads the way the source does.
  var STATUS_TONE = {
    RECRUITING: 'ok',
    NOT_YET_RECRUITING: 'info',
    ENROLLING_BY_INVITATION: 'info',
    ACTIVE_NOT_RECRUITING: 'info',
    COMPLETED: '',
    TERMINATED: 'danger',
    WITHDRAWN: 'danger',
    SUSPENDED: 'warn',
    UNKNOWN: 'warn',
    AVAILABLE: 'ok',
    APPROVED_FOR_MARKETING: 'ok',
    TEMPORARILY_NOT_AVAILABLE: 'warn',
    WITHHELD: 'warn',
    NO_LONGER_AVAILABLE: 'danger'
  };

  var STATUS_LABEL = {
    ACTIVE_NOT_RECRUITING: 'Active, not recruiting',
    COMPLETED: 'Completed',
    ENROLLING_BY_INVITATION: 'Enrolling by invitation',
    NOT_YET_RECRUITING: 'Not yet recruiting',
    RECRUITING: 'Recruiting',
    SUSPENDED: 'Suspended',
    TERMINATED: 'Terminated',
    WITHDRAWN: 'Withdrawn',
    AVAILABLE: 'Available',
    NO_LONGER_AVAILABLE: 'No longer available',
    TEMPORARILY_NOT_AVAILABLE: 'Temporarily not available',
    APPROVED_FOR_MARKETING: 'Approved for marketing',
    WITHHELD: 'Withheld',
    UNKNOWN: 'Unknown status'
  };

  function phaseLabel(phases) {
    if (!phases || !phases.length) return '';
    var map = { NA: 'N/A', EARLY_PHASE1: 'Early Phase 1', PHASE1: 'Phase 1', PHASE2: 'Phase 2', PHASE3: 'Phase 3', PHASE4: 'Phase 4' };
    var names = phases.map(function (p) { return map[p] || U.titleCase(p); });
    if (names.length === 1) return names[0] === 'N/A' ? '' : names[0];
    // "Phase 2 / Phase 3" -> "Phase 2/3"
    return names.join('/').replace(/Phase (\d)\/Phase (\d)/, 'Phase $1/$2');
  }

  function ctgQuery(state, cursor) {
    var params = {
      'query.term': safeTerm(state.q) || undefined,
      'query.intr': safeTerm(state.t_intr) || undefined,
      'query.locn': safeTerm(state.t_locn) || undefined,
      'filter.overallStatus': state.t_status || undefined,
      pageSize: state.pageSize || 25,
      format: 'json'
    };
    if (state.t_sort && state.t_sort !== '@relevance') params.sort = state.t_sort;

    var agg = [];
    if (state.t_phase) agg.push('phase:' + state.t_phase);
    if (state.t_type) agg.push('studyType:' + state.t_type);
    if (agg.length) params.aggFilters = agg.join(',');

    if (cursor) params.pageToken = cursor;
    else params.countTotal = 'true';

    // ClinicalTrials.gov requires at least one query term for relevance sorting;
    // with nothing at all it happily returns the newest records, which is fine.
    return params;
  }

  function ctgMap(study) {
    var p = study.protocolSection || {};
    var idm = p.identificationModule || {};
    var st = p.statusModule || {};
    var des = p.descriptionModule || {};
    var cond = (p.conditionsModule || {}).conditions || [];
    var dsg = p.designModule || {};
    var spon = (p.sponsorCollaboratorsModule || {}).leadSponsor || {};
    var locs = (p.contactsLocationsModule || {}).locations || [];
    var ivs = (p.armsInterventionsModule || {}).interventions || [];

    var nct = idm.nctId || '';
    var status = st.overallStatus || '';
    var updated = (st.lastUpdatePostDateStruct || {}).date || '';
    var started = (st.startDateStruct || {}).date || '';
    var enroll = (dsg.enrollmentInfo || {}).count;
    var phase = phaseLabel(dsg.phases);

    var countries = U.uniq(locs.map(function (l) { return l.country; })).slice(0, 3);
    var placeText = '';
    if (locs.length) {
      placeText = locs.length + ' ' + U.pluralise(locs.length, 'site');
      if (countries.length) placeText += ' · ' + countries.join(', ') + (U.uniq(locs.map(function (l) { return l.country; })).length > 3 ? ' +more' : '');
    }

    var badges = [];
    if (status) badges.push({ t: STATUS_LABEL[status] || U.titleCase(status), tone: STATUS_TONE[status] === undefined ? '' : STATUS_TONE[status] });
    if (phase) badges.push({ t: phase, tone: 'accent' });
    if (dsg.studyType) badges.push({ t: U.titleCase(dsg.studyType), tone: '' });

    return item({
      key: 'ctg:' + nct,
      source: 'trials',
      sourceLabel: 'ClinicalTrials.gov',
      title: idm.briefTitle || idm.officialTitle || nct,
      url: nct ? 'https://clinicaltrials.gov/study/' + nct : '',
      badges: badges,
      chips: cond.slice(0, 5),
      summary: U.clean(des.briefSummary),
      meta: [
        ['', nct],
        ['Sponsor', U.truncate(spon.name, 60)],
        ['Enrolment', enroll ? U.number(enroll) + ' participants' : ''],
        ['Interventions', U.uniq(ivs.map(function (i) { return i.name; })).slice(0, 3).join(', ')],
        ['Locations', placeText],
        ['Started', started ? U.fmtDate(started) : ''],
        ['Updated', updated ? U.fmtDate(updated) + ' (' + U.relative(updated) + ')' : '']
      ],
      csv: {
        source: 'ClinicalTrials.gov', title: idm.briefTitle || '', identifier: nct,
        date: updated, status: status, organisation: spon.name || '',
        url: 'https://clinicaltrials.gov/study/' + nct,
        summary: U.truncate(des.briefSummary, 400)
      }
    });
  }

  function ctgSearch(state, cursor, signal) {
    var params = ctgQuery(state, cursor);
    // Tracked in a closure, never in the request: ClinicalTrials.gov rejects any
    // unrecognised query parameter with a 400, so smuggling a flag through the
    // params object would break the very retry it is meant to enable.
    var filterOnClient = false;

    function run(p) {
      return U.getJSON(U.qs(CTG_BASE, p), { signal: signal });
    }

    return run(params).catch(function (err) {
      // aggFilters is the one parameter likely to be rejected — drop it and
      // fall back to filtering phase/type on the client so search still works.
      if (err.status === 400 && params.aggFilters) {
        const fallback = {};
        Object.keys(params).forEach(function (k) { if (k !== 'aggFilters') fallback[k] = params[k]; });
        filterOnClient = true;
        return run(fallback);
      }
      throw err;
    }).then(function (data) {
      var studies = data.studies || [];

      if (filterOnClient) {
        const phaseMap = { '0': 'EARLY_PHASE1', '1': 'PHASE1', '2': 'PHASE2', '3': 'PHASE3', '4': 'PHASE4' };
        const typeMap = { int: 'INTERVENTIONAL', obs: 'OBSERVATIONAL', expa: 'EXPANDED_ACCESS' };
        if (state.t_phase) {
          studies = studies.filter(function (s) {
            var ph = ((s.protocolSection || {}).designModule || {}).phases || [];
            return ph.indexOf(phaseMap[state.t_phase]) !== -1;
          });
        }
        if (state.t_type) {
          studies = studies.filter(function (s) {
            return (((s.protocolSection || {}).designModule || {}).studyType || '') === typeMap[state.t_type];
          });
        }
      }

      return {
        total: data.totalCount,
        items: studies.map(ctgMap),
        next: data.nextPageToken || null
      };
    });
  }

  /* ============================================================
     2. Europe PMC — literature (indexes PubMed/MEDLINE, PMC, preprints)
     https://europepmc.org/RestfulWebService
     ============================================================ */
  var EPMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

  function epmcQuery(state) {
    var parts = [];
    var term = safeTerm(state.q);

    // Europe PMC treats an unquoted multi-word query as separate terms, so
    // "hair loss" also matched papers about inner-ear *hair* cells and hearing
    // *loss*. Quoting alone is not the answer either: it collapses genuine
    // two-concept searches ("CAR-T lymphoma" drops from thousands of hits to
    // 25). Asking for the phrase OR the loose form keeps the recall while
    // relevance ranking floats true phrase matches to the top.
    if (!term) parts.push('(clinical trial)');
    else if (/\s/.test(term)) parts.push('("' + term + '" OR (' + term + '))');
    else parts.push('(' + term + ')');

    if (state.r_since && state.r_since !== '0') {
      const from = new Date();
      from.setFullYear(from.getFullYear() - parseInt(state.r_since, 10));
      const to = new Date();
      to.setFullYear(to.getFullYear() + 1);
      parts.push('(FIRST_PDATE:[' + iso(from) + ' TO ' + iso(to) + '])');
    }
    if (state.r_src === 'MED') parts.push('(SRC:MED)');
    else if (state.r_src === 'PPR') parts.push('(SRC:PPR)');
    if (state.r_oa) parts.push('(OPEN_ACCESS:y)');
    if (state.r_rct) parts.push('(PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Clinical Trial")');

    return parts.join(' AND ');
  }

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function epmcMap(r) {
    var journal = ((r.journalInfo || {}).journal || {}).title || (r.source === 'PPR' ? 'Preprint' : '');
    var date = r.firstPublicationDate || r.pubYear || '';
    var doi = r.doi || '';
    var url = doi ? 'https://doi.org/' + doi
      : (r.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + r.pmid + '/'
        : 'https://europepmc.org/article/' + (r.source || 'MED') + '/' + (r.id || ''));

    var badges = [];
    if (r.source === 'PPR') badges.push({ t: 'Preprint — not peer reviewed', tone: 'warn' });
    if (r.isOpenAccess === 'Y') badges.push({ t: 'Free full text', tone: 'ok' });
    var types = ((r.pubTypeList || {}).pubType || []);
    if (types.some(function (t) { return /randomized controlled trial/i.test(t); })) badges.push({ t: 'RCT', tone: 'accent' });
    else if (types.some(function (t) { return /clinical trial/i.test(t); })) badges.push({ t: 'Clinical trial', tone: 'accent' });
    if (types.some(function (t) { return /(systematic review|meta-analysis)/i.test(t); })) badges.push({ t: 'Systematic review', tone: 'accent' });

    return item({
      key: 'epmc:' + (r.source || '') + (r.id || r.pmid || r.doi),
      source: 'research',
      sourceLabel: 'Europe PMC',
      title: U.clean(r.title),
      url: url,
      badges: badges,
      chips: [],
      summary: U.clean(r.abstractText),
      meta: [
        ['', journal],
        ['Published', date ? U.fmtDate(date) : ''],
        ['Authors', U.truncate(r.authorString, 110)],
        ['Cited by', r.citedByCount ? U.number(r.citedByCount) : ''],
        ['PMID', r.pmid || ''],
        ['DOI', doi]
      ],
      csv: {
        source: 'Europe PMC', title: U.clean(r.title), identifier: r.pmid || doi || r.id || '',
        date: date, status: r.source === 'PPR' ? 'preprint' : 'published',
        organisation: journal, url: url, summary: U.truncate(r.abstractText, 400),
        authors: U.clean(r.authorString)
      }
    });
  }

  function epmcSearch(state, cursor, signal) {
    var url = U.qs(EPMC_BASE, {
      query: epmcQuery(state),
      format: 'json',
      resultType: 'core',
      pageSize: state.pageSize || 25,
      cursorMark: cursor || '*',
      sort: state.r_sort || undefined
    });
    return U.getJSON(url, { signal: signal }).then(function (data) {
      var results = ((data.resultList || {}).result) || [];
      var next = data.nextCursorMark && data.nextCursorMark !== (cursor || '*') && results.length
        ? data.nextCursorMark : null;
      return { total: data.hitCount, items: results.map(epmcMap), next: next };
    });
  }

  /* ============================================================
     3. openFDA — approvals & clearances
     https://open.fda.gov/apis/
     ============================================================ */
  var FDA = 'https://api.fda.gov';

  // openFDA answers "nothing matched" with a 404 — that is an empty result, not a failure.
  function fdaFetch(url, signal) {
    return U.getJSON(url, { signal: signal }).catch(function (err) {
      if (err.status === 404) return { results: [], meta: { results: { total: 0 } } };
      throw err;
    });
  }

  function fdaRange(field, months) {
    return field + ':[' + U.monthsAgoStamp(months) + ' TO ' + U.stamp(new Date()) + ']';
  }

  function fdaTerm(fields, q) {
    var term = safeTerm(q);
    if (!term) return '';
    return '(' + fields.map(function (f) { return f + ':"' + term + '"'; }).join(' OR ') + ')';
  }

  // Try the request with a server-side sort; if openFDA rejects the sort field,
  // repeat without it and order the page on the client instead.
  function fdaSorted(base, params, sortSpec, signal, clientSort) {
    var withSort = {};
    Object.keys(params).forEach(function (k) { withSort[k] = params[k]; });
    withSort.sort = sortSpec;
    return fdaFetch(U.qs(base, withSort), signal).catch(function (err) {
      if (err.status === 400) {
        return fdaFetch(U.qs(base, params), signal).then(function (d) {
          if (d.results && clientSort) d.results.sort(clientSort);
          return d;
        });
      }
      throw err;
    });
  }

  /* --- 3a. Drugs@FDA --- */
  function drugApprovals(state, cursor, signal) {
    var months = parseInt(state.a_since || '12', 10);
    var search = [fdaRange('submissions.submission_status_date', months), 'submissions.submission_status:AP'];
    var term = fdaTerm(['openfda.brand_name', 'openfda.generic_name', 'openfda.substance_name', 'sponsor_name'], state.q);
    if (term) search.push(term);
    if (state.a_orig) search.push('submissions.submission_type:ORIG');

    var params = {
      search: search.join(' AND '),
      limit: state.pageSize || 25,
      skip: cursor || 0
    };

    var since = U.monthsAgoStamp(months);
    function latestAP(app) {
      var best = null;
      (app.submissions || []).forEach(function (s) {
        if (s.submission_status !== 'AP' || !s.submission_status_date) return;
        if (s.submission_status_date < since) return;
        if (!best || s.submission_status_date > best.submission_status_date) best = s;
      });
      if (!best) {
        (app.submissions || []).forEach(function (s) {
          if (s.submission_status !== 'AP' || !s.submission_status_date) return;
          if (!best || s.submission_status_date > best.submission_status_date) best = s;
        });
      }
      return best || {};
    }

    return fdaSorted(FDA + '/drug/drugsfda.json', params,
      'submissions.submission_status_date:desc', signal,
      function (a, b) { return (latestAP(b).submission_status_date || '').localeCompare(latestAP(a).submission_status_date || ''); }
    ).then(function (data) {
      var results = data.results || [];
      var total = ((data.meta || {}).results || {}).total || 0;
      var skip = parseInt(cursor || 0, 10);

      var items = results.map(function (app) {
        var sub = latestAP(app);
        var of = app.openfda || {};
        var products = app.products || [];
        var p0 = products[0] || {};
        var brand = (of.brand_name && of.brand_name[0]) || p0.brand_name || '';
        var generic = (of.generic_name && of.generic_name[0]) || ((p0.active_ingredients || [])[0] || {}).name || '';
        var appNo = app.application_number || '';
        var digits = appNo.replace(/\D/g, '');

        var isOrig = (sub.submission_type || '') === 'ORIG';
        var badges = [{ t: isOrig ? 'New approval' : 'Supplement', tone: isOrig ? 'ok' : '' }];
        if (/priority/i.test(sub.review_priority || '')) badges.push({ t: 'Priority review', tone: 'accent' });
        if (/^BLA/i.test(appNo)) badges.push({ t: 'Biologic (BLA)', tone: 'info' });
        else if (/^ANDA/i.test(appNo)) badges.push({ t: 'Generic (ANDA)', tone: 'info' });
        else if (/^NDA/i.test(appNo)) badges.push({ t: 'NDA', tone: 'info' });

        var title = brand
          ? brand + (generic && generic.toLowerCase() !== brand.toLowerCase() ? ' (' + generic + ')' : '')
          : (generic || appNo);

        return item({
          key: 'fda-drug:' + appNo + ':' + (sub.submission_number || ''),
          source: 'approvals',
          sourceLabel: 'Drugs@FDA',
          title: title,
          url: digits ? 'https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=' + digits : '',
          badges: badges,
          chips: U.uniq(products.map(function (p) { return p.dosage_form ? U.titleCase(p.dosage_form) : ''; })).slice(0, 4),
          summary: sub.submission_class_code_description
            ? 'Submission class: ' + sub.submission_class_code_description + '.'
            : '',
          meta: [
            ['', appNo],
            ['Sponsor', app.sponsor_name || ''],
            ['Approved', sub.submission_status_date ? U.fmtDate(sub.submission_status_date) + ' (' + U.relative(sub.submission_status_date) + ')' : ''],
            ['Route', U.uniq((of.route || []).map(U.titleCase)).slice(0, 3).join(', ')],
            ['Marketing status', p0.marketing_status || ''],
            ['Products', products.length > 1 ? U.number(products.length) + ' listed' : '']
          ],
          csv: {
            source: 'Drugs@FDA', title: title, identifier: appNo,
            date: sub.submission_status_date || '', status: isOrig ? 'original approval' : 'supplement',
            organisation: app.sponsor_name || '',
            url: 'https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=' + digits,
            summary: sub.submission_class_code_description || ''
          }
        });
      });

      return { total: total, items: items, next: (skip + items.length) < total && items.length ? skip + items.length : null };
    });
  }

  /* --- 3b. Device PMA / 510(k) --- */
  function deviceApprovals(state, cursor, signal) {
    var is510k = state.a_kind === '510k';
    var months = parseInt(state.a_since || '12', 10);
    var search = [fdaRange('decision_date', months)];
    var term = fdaTerm(is510k ? ['device_name', 'applicant'] : ['trade_name', 'generic_name', 'applicant'], state.q);
    if (term) search.push(term);

    var params = { search: search.join(' AND '), limit: state.pageSize || 25, skip: cursor || 0 };

    return fdaSorted(FDA + (is510k ? '/device/510k.json' : '/device/pma.json'), params,
      'decision_date:desc', signal,
      function (a, b) { return (b.decision_date || '').localeCompare(a.decision_date || ''); }
    ).then(function (data) {
      var results = data.results || [];
      var total = ((data.meta || {}).results || {}).total || 0;
      var skip = parseInt(cursor || 0, 10);

      var items = results.map(function (r) {
        if (is510k) {
          const k = r.k_number || '';
          return item({
            key: 'fda-510k:' + k,
            source: 'approvals',
            sourceLabel: 'FDA 510(k)',
            title: U.clean(r.device_name) || k,
            url: k ? 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/pmn.cfm?ID=' + k : '',
            badges: [
              { t: '510(k) clearance', tone: 'info' },
              r.clearance_type ? { t: U.titleCase(r.clearance_type), tone: '' } : null
            ],
            chips: [],
            summary: r.decision_description ? 'FDA decision: ' + r.decision_description + '.' : '',
            meta: [
              ['', k],
              ['Applicant', U.clean(r.applicant)],
              ['Decision', r.decision_date ? U.fmtDate(r.decision_date) + ' (' + U.relative(r.decision_date) + ')' : ''],
              ['Panel', r.advisory_committee_description || ''],
              ['Product code', r.product_code || '']
            ],
            csv: {
              source: 'FDA 510(k)', title: U.clean(r.device_name), identifier: k,
              date: r.decision_date || '', status: r.decision_description || '',
              organisation: U.clean(r.applicant),
              url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/pmn.cfm?ID=' + k,
              summary: r.advisory_committee_description || ''
            }
          });
        }
        var pma = (r.pma_number || '') + (r.supplement_number ? '/' + r.supplement_number : '');
        var isSupp = !!r.supplement_number;
        return item({
          key: 'fda-pma:' + pma,
          source: 'approvals',
          sourceLabel: 'FDA PMA',
          title: U.clean(r.trade_name) || U.clean(r.generic_name) || pma,
          url: r.pma_number ? 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=' + r.pma_number : '',
          badges: [
            { t: isSupp ? 'PMA supplement' : 'PMA approval', tone: isSupp ? '' : 'ok' },
            /y/i.test(r.expedited_review_flag || '') ? { t: 'Expedited review', tone: 'accent' } : null
          ],
          chips: r.generic_name ? [U.clean(r.generic_name)] : [],
          summary: U.clean(r.ao_statement),
          meta: [
            ['', pma],
            ['Applicant', U.clean(r.applicant)],
            ['Decision', r.decision_date ? U.fmtDate(r.decision_date) + ' (' + U.relative(r.decision_date) + ')' : ''],
            ['Panel', r.advisory_committee_description || ''],
            ['Decision code', r.decision_code || '']
          ],
          csv: {
            source: 'FDA PMA', title: U.clean(r.trade_name), identifier: pma,
            date: r.decision_date || '', status: r.decision_code || '',
            organisation: U.clean(r.applicant),
            url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=' + (r.pma_number || ''),
            summary: U.truncate(r.ao_statement, 400)
          }
        });
      });

      return { total: total, items: items, next: (skip + items.length) < total && items.length ? skip + items.length : null };
    });
  }

  function approvalsSearch(state, cursor, signal) {
    return state.a_kind === 'drug' || !state.a_kind
      ? drugApprovals(state, cursor, signal)
      : deviceApprovals(state, cursor, signal);
  }

  /* ============================================================
     4. openFDA enforcement — recalls & safety
     ============================================================ */
  var CLASS_TONE = { 'Class I': 'danger', 'Class II': 'warn', 'Class III': '' };

  function safetySearch(state, cursor, signal) {
    var kind = state.s_kind || 'drug';
    var months = parseInt(state.s_since || '12', 10);
    var search = [fdaRange('report_date', months)];
    var term = fdaTerm(['product_description', 'reason_for_recall', 'recalling_firm'], state.q);
    if (term) search.push(term);
    if (state.s_class) search.push('classification:"' + state.s_class + '"');

    var params = { search: search.join(' AND '), limit: state.pageSize || 25, skip: cursor || 0 };

    return fdaSorted(FDA + '/' + kind + '/enforcement.json', params,
      'report_date:desc', signal,
      function (a, b) { return (b.report_date || '').localeCompare(a.report_date || ''); }
    ).then(function (data) {
      var results = data.results || [];
      var total = ((data.meta || {}).results || {}).total || 0;
      var skip = parseInt(cursor || 0, 10);

      var items = results.map(function (r) {
        var cls = r.classification || '';
        var recall = r.recall_number || '';
        return item({
          key: 'fda-rec:' + recall,
          source: 'safety',
          sourceLabel: U.titleCase(kind) + ' recall',
          title: U.truncate(r.product_description, 140) || recall,
          // there is no stable per-recall page on fda.gov, so link the authoritative openFDA record
          url: recall ? FDA + '/' + kind + '/enforcement.json?search=recall_number:"' + encodeURIComponent(recall) + '"' : '',
          badges: [
            cls ? { t: cls, tone: CLASS_TONE[cls] === undefined ? '' : CLASS_TONE[cls] } : null,
            r.status ? { t: r.status, tone: /ongoing/i.test(r.status) ? 'warn' : '' } : null,
            r.voluntary_mandated ? { t: U.truncate(r.voluntary_mandated, 28), tone: '' } : null
          ],
          chips: [],
          summary: U.clean(r.reason_for_recall),
          meta: [
            ['', recall],
            ['Firm', U.clean(r.recalling_firm)],
            ['Reported', r.report_date ? U.fmtDate(r.report_date) + ' (' + U.relative(r.report_date) + ')' : ''],
            ['Initiated', r.recall_initiation_date ? U.fmtDate(r.recall_initiation_date) : ''],
            ['Quantity', U.truncate(r.product_quantity, 40)],
            ['Distribution', U.truncate(r.distribution_pattern, 70)]
          ],
          csv: {
            source: U.titleCase(kind) + ' recall', title: U.truncate(r.product_description, 200),
            identifier: recall, date: r.report_date || '', status: (cls ? cls + ' / ' : '') + (r.status || ''),
            organisation: U.clean(r.recalling_firm),
            url: FDA + '/' + kind + '/enforcement.json?search=recall_number:"' + recall + '"',
            summary: U.truncate(r.reason_for_recall, 400)
          }
        });
      });

      return { total: total, items: items, next: (skip + items.length) < total && items.length ? skip + items.length : null };
    });
  }

  /* ============================================================
     Data freshness — ClinicalTrials.gov /version

     The registry reloads Monday-Friday, generally by 14:00 UTC. The API docs
     recommend reading dataTimestamp to confirm the refresh actually landed
     before trusting a result set as current, so we surface it to the reader
     rather than implying the data is live to the second.
     ============================================================ */
  function dataFreshness(signal) {
    return U.getJSON('https://clinicaltrials.gov/api/v2/version', { signal: signal, timeout: 8000 })
      .then(function (v) {
        return {
          apiVersion: v.apiVersion || '',
          timestamp: v.dataTimestamp || '',
          label: v.dataTimestamp ? U.fmtDate(v.dataTimestamp) : ''
        };
      });
  }

  /* ============================================================ */
  TS.sources = {
    trials: { label: 'Clinical trials', search: ctgSearch },
    research: { label: 'Research papers', search: epmcSearch },
    approvals: { label: 'FDA approvals', search: approvalsSearch },
    safety: { label: 'Safety & recalls', search: safetySearch }
  };
  TS.dataFreshness = dataFreshness;
})();
