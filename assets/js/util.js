/* ============================================================
   util.js — shared helpers (no dependencies, classic script)
   ============================================================ */
var TS = window.TS || {};
window.TS = TS;

TS.util = (function () {

  /* ---- DOM ---- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ---- text ---- */
  function clean(s) {
    if (!s) return '';
    return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function truncate(s, n) {
    s = clean(s);
    if (s.length <= n) return s;
    return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
  }

  function titleCase(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/_/g, ' ')
      .replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
  }

  /* ---- dates ---- */
  // Accepts "2025-04-01", "20250401", "2025-04", "2025"
  function parseDate(v) {
    if (!v) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, 1);
    m = s.match(/^(\d{4})$/);
    if (m) return new Date(+m[1], 0, 1);
    var d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(v) {
    var d = parseDate(v);
    if (!d) return v ? String(v) : '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function relative(v) {
    var d = parseDate(v);
    if (!d) return '';
    var days = Math.round((Date.now() - d.getTime()) / 864e5);
    if (days < 0) return 'upcoming';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    if (days < 365) return Math.round(days / 30) + ' mo ago';
    var y = (days / 365);
    return (y < 1.5 ? '1 year' : Math.round(y) + ' years') + ' ago';
  }

  // yyyymmdd string N months back from today (openFDA range format)
  function monthsAgoStamp(months) {
    var d = new Date();
    d.setMonth(d.getMonth() - months);
    return stamp(d);
  }
  function stamp(d) {
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return '' + d.getFullYear() + mm + dd;
  }

  /* ---- network ---- */
  function HttpError(status, message) {
    this.name = 'HttpError';
    this.status = status;
    this.message = message || ('Request failed with status ' + status);
  }
  HttpError.prototype = Object.create(Error.prototype);

  function getJSON(url, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 25000) : null;
    if (opts.signal && ctrl) {
      opts.signal.addEventListener('abort', function () { ctrl.abort(); });
    }
    return fetch(url, {
      signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Accept': 'application/json' },
      mode: 'cors'
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (body) {
          var msg = '';
          try { msg = (JSON.parse(body).error || {}).message || ''; } catch { /* body wasn't JSON */ }
          throw new HttpError(res.status, msg);
        });
      }
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') throw err;
      // fetch() rejects on network failure / DNS / blocked request
      throw new HttpError(0, 'Could not reach the data source. Check your connection and try again.');
    });
  }

  function qs(base, params) {
    var sp = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === null || v === undefined || v === '' || v === false) return;
      sp.set(k, v);
    });
    return base + '?' + sp.toString();
  }

  /* ---- misc ---- */
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function pluralise(n, one, many) {
    return n === 1 ? one : (many || one + 's');
  }

  function number(n) {
    if (n === null || n === undefined || n === '') return '';
    return Number(n).toLocaleString();
  }

  function uniq(arr) {
    var seen = {};
    return (arr || []).filter(function (v) {
      if (!v || seen[v]) return false;
      seen[v] = 1;
      return true;
    });
  }

  function toCSV(rows) {
    if (!rows.length) return '';
    var cols = ['source', 'title', 'identifier', 'date', 'status', 'organisation', 'url', 'summary'];
    var esc = function (v) {
      v = v === null || v === undefined ? '' : String(v);
      return '"' + v.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    };
    var out = [cols.join(',')];
    rows.forEach(function (r) {
      out.push(cols.map(function (c) { return esc(r.csv ? r.csv[c] : ''); }).join(','));
    });
    return out.join('\r\n');
  }

  // RIS is the citation interchange format Zotero, EndNote and Mendeley import.
  // ClinicalTrials.gov offers it for its own downloads, so researchers can pull
  // trials and papers found here straight into a reference manager.
  function toRIS(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      var c = r.csv || {};
      var isPaper = r.source === 'research';
      var d = parseDate(c.date);
      var tag = function (k, v) { if (v) out.push(k + '  - ' + String(v).replace(/\r?\n/g, ' ')); };

      out.push('TY  - ' + (isPaper ? 'JOUR' : 'GEN'));
      tag('TI', c.title);
      (c.authors ? String(c.authors).split(/,\s*/) : []).forEach(function (a) { tag('AU', a); });
      if (isPaper) tag('JO', c.organisation); else tag('PB', c.organisation);
      if (d) {
        tag('PY', d.getFullYear());
        tag('DA', d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'));
      }
      tag('AB', c.summary);
      tag('ID', c.identifier);
      tag('UR', c.url);
      tag('DB', c.source);
      out.push('ER  - ');
      out.push('');
    });
    return out.join('\r\n');
  }

  // Excel only reads UTF-8 CSV correctly when the file starts with a byte-order
  // mark, but a BOM confuses some reference-manager RIS parsers, so it is opt-in.
  function download(filename, text, mime, bom) {
    var blob = new Blob([(bom ? '\ufeff' : '') + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- storage (never throws — private mode safe) ---- */
  function store(key, value) {
    try {
      if (value === undefined) {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      localStorage.setItem(key, JSON.stringify(value));
      return value;
    } catch { return value === undefined ? null : value; }
  }

  return {
    $: $, $$: $$, el: el,
    clean: clean, truncate: truncate, titleCase: titleCase,
    parseDate: parseDate, fmtDate: fmtDate, relative: relative,
    monthsAgoStamp: monthsAgoStamp, stamp: stamp,
    getJSON: getJSON, qs: qs, HttpError: HttpError,
    debounce: debounce, pluralise: pluralise, number: number, uniq: uniq,
    toCSV: toCSV, toRIS: toRIS, download: download, store: store
  };
})();
