/* ============================================================
   render.js — turns normalised items into DOM
   ============================================================ */
(function () {
  var U = TS.util;
  var el = U.el;

  function icon(path, opts) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', (opts && opts.fill) || 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
  }

  var BOOKMARK = 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z';

  // Only ever link out over http(s). Saved items are replayed from localStorage,
  // so this also stops a poisoned store turning a card title into a javascript: link.
  function safeURL(u) {
    if (!u) return '';
    try {
      const parsed = new URL(u, location.href);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  }

  /* ---------- one result card ---------- */
  function card(it, ctx) {
    var saved = ctx.isSaved(it.key);

    var href = safeURL(it.url);
    var titleEl = href
      ? el('a', { href: href, target: '_blank', rel: 'noopener noreferrer', text: it.title })
      : el('span', { text: it.title });

    var saveBtn = el('button', {
      type: 'button',
      class: 'save-btn' + (saved ? ' is-saved' : ''),
      title: saved ? 'Remove from saved' : 'Save this result',
      'aria-pressed': saved ? 'true' : 'false',
      'aria-label': saved ? 'Remove from saved' : 'Save this result'
    }, [icon(BOOKMARK)]);

    saveBtn.addEventListener('click', function () {
      var nowSaved = ctx.toggleSave(it);
      saveBtn.classList.toggle('is-saved', nowSaved);
      saveBtn.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
      saveBtn.setAttribute('aria-label', nowSaved ? 'Remove from saved' : 'Save this result');
      saveBtn.title = nowSaved ? 'Remove from saved' : 'Save this result';
      if (ctx.onSaveChange) ctx.onSaveChange();
    });

    var node = el('article', { class: 'card' }, [
      el('div', { class: 'card-top' }, [
        el('h3', { class: 'card-title' }, [titleEl]),
        saveBtn
      ])
    ]);

    if (it.badges.length) {
      node.appendChild(el('div', { class: 'badges' }, it.badges.map(function (b) {
        return el('span', { class: 'badge ' + (b.tone || ''), text: b.t });
      })));
    }

    if (it.chips.length) {
      node.appendChild(el('div', { class: 'chips' }, it.chips.map(function (c) {
        return el('span', { text: U.truncate(c, 48) });
      })));
    }

    if (it.summary) {
      node.appendChild(el('p', { class: 'card-summary', text: it.summary }));
      if (it.summary.length > 260) {
        const toggle = el('button', { type: 'button', class: 'more-link', text: 'Show more' });
        toggle.addEventListener('click', function () {
          const open = node.classList.toggle('is-open');
          toggle.textContent = open ? 'Show less' : 'Show more';
        });
        node.appendChild(toggle);
      }
    }

    if (it.meta.length) {
      const bits = [];
      it.meta.forEach(function (m) {
        var span = el('span');
        if (m[0]) span.appendChild(el('b', { text: m[0] + ': ' }));
        span.appendChild(document.createTextNode(m[1]));
        bits.push(span);
      });
      node.appendChild(el('div', { class: 'meta' }, bits));
    }

    return node;
  }

  /* ---------- states ---------- */
  function skeletons(n) {
    var frag = document.createDocumentFragment();
    for (let i = 0; i < (n || 4); i++) {
      frag.appendChild(el('div', { class: 'skeleton' }, [
        el('div', { class: 'sk-line', style: 'width:62%;height:14px' }),
        el('div', { class: 'sk-line', style: 'width:96%' }),
        el('div', { class: 'sk-line', style: 'width:88%' }),
        el('div', { class: 'sk-line', style: 'width:40%' })
      ]));
    }
    return frag;
  }

  function state(kind, title, body, action) {
    var node = el('div', { class: 'state' + (kind === 'error' ? ' error' : '') }, [
      el('h3', { text: title }),
      el('p', { text: body })
    ]);
    if (action) {
      const b = el('button', { type: 'button', class: 'btn btn-outline', text: action.label });
      b.addEventListener('click', action.onClick);
      node.appendChild(b);
    }
    return node;
  }

  function groupHead(title, count, onViewAll) {
    var right = null;
    if (onViewAll) {
      right = el('button', { type: 'button', text: 'View all' + (count ? ' ' + U.number(count) : '') + ' →' });
      right.addEventListener('click', onViewAll);
    }
    return el('div', { class: 'group-head' }, [el('h2', { text: title }), right]);
  }

  TS.render = {
    card: card,
    skeletons: skeletons,
    state: state,
    groupHead: groupHead,
    el: el,
    icon: icon
  };
})();
