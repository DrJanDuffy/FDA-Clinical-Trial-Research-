/* ============================================================
   app.js — tabs, state, URL sync, searching, saved items
   ============================================================ */
(function () {
  var U = TS.util, R = TS.render, el = U.el;
  var $ = U.$, $$ = U.$$;

  var TABS = ['overview', 'trials', 'research', 'approvals', 'safety', 'watchlist'];
  var FILTER_IDS = [
    't_intr', 't_locn', 't_status', 't_phase', 't_type', 't_sort',
    'r_since', 'r_sort', 'r_src', 'r_oa', 'r_rct',
    'a_kind', 'a_since', 'a_orig',
    's_kind', 's_class', 's_since'
  ];

  var TAB_LABEL = {
    trials: 'Clinical trials', research: 'Research papers',
    approvals: 'FDA approvals', safety: 'Safety & recalls'
  };

  var dom = {};
  var generation = 0;      // guards against out-of-order responses
  var current = { items: [], next: null, tab: 'overview' };
  var saved = U.store('trialscope.saved') || [];

  /* ============================================================
     state <-> DOM <-> URL
     ============================================================ */
  function readState() {
    var s = { q: dom.q.value.trim(), pageSize: 25 };
    FILTER_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      s[id] = node.type === 'checkbox' ? node.checked : node.value;
    });
    return s;
  }

  function writeURL(tab, s) {
    var sp = new URLSearchParams();
    if (tab !== 'overview') sp.set('tab', tab);
    if (s.q) sp.set('q', s.q);
    FILTER_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      var v = s[id];
      var def = node.type === 'checkbox' ? false : node.dataset.default;
      if (node.type === 'checkbox') { if (v) sp.set(id, '1'); }
      else if (v && v !== def) sp.set(id, v);
    });
    var qs = sp.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function applyURL() {
    var sp = new URLSearchParams(location.search);
    if (sp.get('q')) dom.q.value = sp.get('q');
    FILTER_IDS.forEach(function (id) {
      if (!sp.has(id)) return;
      var node = document.getElementById(id);
      if (!node) return;
      if (node.type === 'checkbox') node.checked = sp.get(id) === '1';
      else node.value = sp.get(id);
    });
    var tab = sp.get('tab');
    return TABS.indexOf(tab) !== -1 ? tab : 'overview';
  }

  /* ============================================================
     saved items
     ============================================================ */
  function isSaved(key) {
    return saved.some(function (x) { return x.key === key; });
  }
  function toggleSave(it) {
    if (isSaved(it.key)) {
      saved = saved.filter(function (x) { return x.key !== it.key; });
      persistSaved();
      return false;
    }
    saved = [it].concat(saved).slice(0, 300);
    persistSaved();
    return true;
  }
  function persistSaved() {
    U.store('trialscope.saved', saved);
    dom.watchCount.textContent = saved.length;
  }

  var cardCtx = {
    isSaved: isSaved,
    toggleSave: toggleSave,
    onSaveChange: function () {
      if (current.tab === 'watchlist') renderWatchlist();
    }
  };

  /* ============================================================
     rendering the results area
     ============================================================ */
  function setBusy(on) { dom.results.setAttribute('aria-busy', on ? 'true' : 'false'); }

  function clearResults() {
    dom.body.innerHTML = '';
    dom.head.hidden = true;
    dom.more.hidden = true;
    dom.csv.hidden = true;
  }

  function showCount(text) {
    dom.head.hidden = false;
    dom.count.innerHTML = text;
  }

  function appendItems(items) {
    var frag = document.createDocumentFragment();
    items.forEach(function (it) { frag.appendChild(R.card(it, cardCtx)); });
    dom.body.appendChild(frag);
  }

  function showError(err, retry) {
    clearResults();
    var msg = err && err.status === 0
      ? 'The data source could not be reached. This is usually a dropped connection, an offline network, or a browser extension blocking the request. Your search itself is fine — try again.'
      : 'The data source returned an error' + (err && err.status ? ' (HTTP ' + err.status + ')' : '') +
        (err && err.message ? ': ' + err.message : '.') + ' Public APIs also rate-limit heavy use, so waiting a moment often helps.';
    dom.body.appendChild(R.state('error', 'Something went wrong', msg, { label: 'Try again', onClick: retry }));
  }

  /* ============================================================
     single-source tab search
     ============================================================ */
  function runSearch(tab, opts) {
    opts = opts || {};
    var src = TS.sources[tab];
    if (!src) return;

    var s = readState();
    writeURL(tab, s);

    var gen = ++generation;
    var cursor = opts.more ? current.next : null;

    if (!opts.more) {
      clearResults();
      dom.body.appendChild(R.skeletons(5));
      current.items = [];
    } else {
      dom.more.disabled = true;
      dom.more.textContent = 'Loading…';
    }
    setBusy(true);

    src.search(s, cursor).then(function (res) {
      if (gen !== generation) return;                 // a newer search already started
      setBusy(false);
      dom.more.disabled = false;
      dom.more.textContent = 'Load more results';

      if (!opts.more) dom.body.innerHTML = '';
      current.items = current.items.concat(res.items);
      current.next = res.next;

      if (!current.items.length) {
        clearResults();
        dom.body.appendChild(R.state('empty', 'No matches',
          'Nothing in ' + (TAB_LABEL[tab] || tab) + ' matched this search. Try a broader term, ' +
          'drop a filter, or widen the date window — spelling and synonyms matter a lot in medical databases ' +
          '(for example "myocardial infarction" and "heart attack" return different results).'));
        return;
      }

      appendItems(res.items);

      var total = res.total;
      var shown = current.items.length;
      showCount(
        'Showing <strong>' + U.number(shown) + '</strong>' +
        (typeof total === 'number' && total > shown ? ' of <strong>' + U.number(total) + '</strong>' : '') +
        ' ' + U.pluralise(typeof total === 'number' ? total : shown, 'result') + ' from ' + escapeHTML(res.items[0].sourceLabel)
      );
      dom.csv.hidden = false;
      dom.more.hidden = !res.next;
    }).catch(function (err) {
      if (gen !== generation) return;
      setBusy(false);
      dom.more.disabled = false;
      dom.more.textContent = 'Load more results';
      showError(err, function () { runSearch(tab, opts); });
    });
  }

  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ============================================================
     overview — every source at once
     ============================================================ */
  function runOverview() {
    var s = readState();
    writeURL('overview', s);
    var gen = ++generation;

    clearResults();

    if (!s.q) {
      dom.body.appendChild(introPanel());
      return;
    }

    var order = ['trials', 'research', 'approvals', 'safety'];
    var slots = {};

    order.forEach(function (name) {
      var head = R.groupHead(TAB_LABEL[name], 0, function () { switchTab(name); });
      var box = el('div');
      box.appendChild(R.skeletons(2));
      dom.body.appendChild(head);
      dom.body.appendChild(box);
      slots[name] = { head: head, box: box };
    });

    showCount('Searching all four sources for <strong>' + escapeHTML(s.q) + '</strong>…');
    setBusy(true);

    var small = {};
    Object.keys(s).forEach(function (k) { small[k] = s[k]; });
    small.pageSize = 3;

    var done = 0;
    order.forEach(function (name) {
      TS.sources[name].search(small, null).then(function (res) {
        if (gen !== generation) return;
        var slot = slots[name];
        slot.box.innerHTML = '';
        if (!res.items.length) {
          slot.box.appendChild(el('p', { class: 'panel-note', text: 'No matches in this source.' }));
        } else {
          res.items.slice(0, 3).forEach(function (it) { slot.box.appendChild(R.card(it, cardCtx)); });
        }
        var btn = slot.head.querySelector('button');
        if (btn) {
          btn.textContent = res.total ? 'View all ' + U.number(res.total) + ' →' : 'Open this tab →';
          btn.hidden = !res.items.length;
        }
      }).catch(function (err) {
        if (gen !== generation) return;
        var slot = slots[name];
        slot.box.innerHTML = '';
        slot.box.appendChild(el('p', {
          class: 'panel-note',
          text: 'This source could not be reached' + (err && err.status ? ' (HTTP ' + err.status + ')' : '') + '.'
        }));
      }).then(function () {
        if (gen !== generation) return;
        if (++done === order.length) {
          setBusy(false);
          showCount('Top matches for <strong>' + escapeHTML(s.q) + '</strong> across all four sources. Open a tab above for the full set and filters.');
        }
      });
    });
  }

  function introPanel() {
    var wrap = document.createDocumentFragment();

    wrap.appendChild(el('div', { class: 'hero-note' }, [
      el('h2', { text: 'Search four official medical databases at once' }),
      el('p', {
        text: 'Type a condition, a drug, or a research topic above. TrialScope queries ClinicalTrials.gov, ' +
              'Europe PMC, and two openFDA endpoints live from your browser — no account, no tracking, and ' +
              'every result links back to the original record.'
      }),
      el('div', { class: 'hero-cards' }, [
        heroCard('Clinical trials', 'Studies you may be able to join, with status, phase, sponsor and sites.', 'trials'),
        heroCard('Research papers', 'Peer-reviewed literature and preprints, with abstracts and free-text links.', 'research'),
        heroCard('FDA approvals', 'New drug, biologic and medical-device decisions as the FDA publishes them.', 'approvals'),
        heroCard('Safety & recalls', 'Recall notices graded by how much harm the product could cause.', 'safety')
      ])
    ]));

    return wrap;
  }

  function heroCard(title, desc, tab) {
    var b = el('button', { type: 'button', class: 'hero-card' }, [
      el('strong', { text: title }),
      el('span', { text: desc })
    ]);
    b.addEventListener('click', function () { switchTab(tab); });
    return b;
  }

  /* ============================================================
     saved tab
     ============================================================ */
  function renderWatchlist() {
    clearResults();
    generation++;
    setBusy(false);

    if (!saved.length) {
      dom.body.appendChild(R.state('empty', 'Nothing saved yet',
        'Hit the bookmark button on any trial, paper, approval or recall and it will be kept here — ' +
        'stored only in this browser, never sent anywhere. Handy for building a shortlist to take to an appointment.'));
      return;
    }

    showCount('<strong>' + U.number(saved.length) + '</strong> saved ' + U.pluralise(saved.length, 'item'));
    dom.csv.hidden = false;

    var groups = {};
    saved.forEach(function (it) { (groups[it.source] = groups[it.source] || []).push(it); });

    ['trials', 'research', 'approvals', 'safety'].forEach(function (name) {
      if (!groups[name]) return;
      dom.body.appendChild(R.groupHead(TAB_LABEL[name] + ' (' + groups[name].length + ')', 0, null));
      groups[name].forEach(function (it) { dom.body.appendChild(R.card(it, cardCtx)); });
    });

    var clear = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Clear all saved items' });
    clear.addEventListener('click', function () {
      if (!confirm('Remove all ' + saved.length + ' saved items? This cannot be undone.')) return;
      saved = [];
      persistSaved();
      renderWatchlist();
    });
    dom.body.appendChild(el('div', { class: 'more-wrap' }, [clear]));

    current.items = saved.slice();
  }

  /* ============================================================
     tab switching
     ============================================================ */
  function switchTab(tab, opts) {
    opts = opts || {};
    current.tab = tab;
    current.next = null;
    current.items = [];

    $$('.tab').forEach(function (t) {
      var on = t.dataset.tab === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;   // roving tabindex: Tab reaches the list, arrows move within it
    });
    dom.results.setAttribute('aria-labelledby', 'tab-' + tab);
    $$('.filter-panel').forEach(function (p) { p.hidden = p.dataset.panel !== tab; });

    if (tab === 'overview') runOverview();
    else if (tab === 'watchlist') renderWatchlist();
    else runSearch(tab);

    if (!opts.noScroll && window.scrollY > 220) {
      window.scrollTo({ top: 180, behavior: 'smooth' });
    }
  }

  /* ============================================================
     boot
     ============================================================ */
  function init() {
    dom = {
      q: $('#q'), form: $('#searchForm'), clearQ: $('#clearQ'),
      results: $('#results'), body: $('#resultsBody'),
      head: $('#resultsHead'), count: $('#resultsCount'),
      more: $('#moreBtn'), csv: $('#csvBtn'),
      watchCount: $('#watchCount'), watchBtn: $('#watchlistBtn'),
      themeBtn: $('#themeBtn')
    };

    // remember each control's initial value so the URL only carries real changes
    FILTER_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (node && node.type !== 'checkbox') node.dataset.default = node.value;
    });

    // theme: stored choice wins, otherwise follow the OS
    var storedTheme = U.store('trialscope.theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = storedTheme || (prefersDark ? 'dark' : 'light');
    dom.themeBtn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      U.store('trialscope.theme', next);
    });

    persistSaved();

    dom.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (current.tab === 'watchlist') { switchTab('overview'); return; }
      switchTab(current.tab, { noScroll: true });
    });

    dom.q.addEventListener('input', function () { dom.clearQ.hidden = !dom.q.value; });
    dom.clearQ.addEventListener('click', function () {
      dom.q.value = '';
      dom.clearQ.hidden = true;
      dom.q.focus();
    });

    var tabNodes = $$('.tab');
    tabNodes.forEach(function (t, i) {
      t.addEventListener('click', function () { switchTab(t.dataset.tab); });
      t.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        var target = step ? (i + step + tabNodes.length) % tabNodes.length
          : e.key === 'Home' ? 0
            : e.key === 'End' ? tabNodes.length - 1 : -1;
        if (target < 0) return;
        e.preventDefault();
        tabNodes[target].focus();
        switchTab(tabNodes[target].dataset.tab, { noScroll: true });
      });
    });

    $$('.chip[data-q]').forEach(function (c) {
      c.addEventListener('click', function () {
        dom.q.value = c.dataset.q;
        dom.clearQ.hidden = false;
        switchTab(current.tab === 'watchlist' ? 'overview' : current.tab, { noScroll: true });
      });
    });

    // any filter change re-runs the current tab
    FILTER_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      var evt = node.tagName === 'INPUT' && node.type === 'text' ? 'change' : 'change';
      node.addEventListener(evt, function () {
        if (TS.sources[current.tab]) runSearch(current.tab);
      });
    });

    dom.more.addEventListener('click', function () { runSearch(current.tab, { more: true }); });

    dom.csv.addEventListener('click', function () {
      var csv = U.toCSV(current.items);
      if (!csv) return;
      var q = (dom.q.value.trim() || current.tab).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      U.download('trialscope-' + current.tab + '-' + q + '-' + U.stamp(new Date()) + '.csv', csv);
    });

    dom.watchBtn.addEventListener('click', function () { switchTab('watchlist'); });

    // "/" focuses search, Escape blurs it
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== dom.q && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        dom.q.focus();
      } else if (e.key === 'Escape' && document.activeElement === dom.q) {
        dom.q.blur();
      }
    });

    var startTab = applyURL();
    dom.clearQ.hidden = !dom.q.value;
    switchTab(startTab, { noScroll: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
