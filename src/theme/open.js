/* Local LLM Picker · open theme runtime (Apache-2.0, part of this repository)
   A small runtime for the default build: no dependencies, works offline, light theme only.
   It offers the part of the window.RISE interface that the app calls, so the same app code runs on
   either theme:
     RISE.ui(name)          inline stroked SVG icon (also fills [data-ui="name"] elements)
     RISE.toast(msg, opts)  short message at the bottom of the screen ({ status: 'ok', timeout })
     RISE.onTheme(fn)       this theme is light only: calls fn('light') once
     RISE.hydrate(scope)    fills [data-ui] icons inside scope
   and wires, for the whole page:
     [data-open="id"] opens <dialog id>, [data-close] closes its dialog, a click on the backdrop closes it
     [data-tip="..."] explanation bubble on hover, keyboard focus, tap or click
     .tabs [role="tab"] arrow keys, Home and End move between tabs (and show the panel named in aria-controls) */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var api = window.RISE = window.RISE || {};

  /* ?shot=1 (screenshots): no animations */
  if (/[?&]shot=/.test(location.search)) root.classList.add('ot-shot');

  /* ---------- Icons: 24 px grid, 1.8 px stroke, drawn for this theme ---------- */
  var ICONS = {
    'close': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    'reset': '<path d="M4.6 13.2A7.5 7.5 0 1 0 6.8 6.7"/><path d="M6.6 2.9l.3 3.9 3.9-.3"/>',
    'copy': '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>',
    'plus': '<path d="M12 5.5v13M5.5 12h13"/>',
    'minus': '<path d="M5.5 12h13"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'chevron-down': '<path d="M6.5 9.5L12 15l5.5-5.5"/>',
    'chevron-right': '<path d="M9.5 6.5L15 12l-5.5 5.5"/>',
    'info': '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>'
  };
  api.ui = function (name, cls) {
    return '<svg class="ui-icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  };
  api.hydrate = function (scope) {
    var els = (scope || doc).querySelectorAll('[data-ui]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute('data-ui-done')) continue;
      el.insertAdjacentHTML('afterbegin', api.ui(el.getAttribute('data-ui')));
      el.setAttribute('data-ui-done', '1');
    }
  };

  /* ---------- Theme: light only ---------- */
  api.onTheme = function (fn) { if (typeof fn === 'function') fn('light'); };

  /* ---------- Toasts ---------- */
  api.toast = function (msg, opts) {
    opts = opts || {};
    var host = doc.querySelector('.toasts');
    if (!host) {
      host = doc.createElement('div'); host.className = 'toasts';
      host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
      doc.body.appendChild(host);
    }
    var t = doc.createElement('div');
    t.className = 'toast' + (opts.status ? ' status is-' + opts.status : '');
    t.textContent = msg;
    host.appendChild(t);
    var gone = function () { if (!t.parentNode) return; t.classList.add('is-leaving'); setTimeout(function () { t.remove(); }, 260); };
    t.addEventListener('click', gone);
    setTimeout(gone, opts.timeout || 3200);
    return t;
  };

  /* ---------- Dialogs ---------- */
  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var opener = t.closest('[data-open]');
    if (opener) {
      var d = doc.getElementById(opener.getAttribute('data-open'));
      if (d && typeof d.showModal === 'function' && !d.open) { d.showModal(); api.hydrate(d); }
    }
    var closer = t.closest('[data-close]');
    if (closer) { var dc = closer.closest('dialog'); if (dc && dc.open) dc.close(); }
    // a click on the dimmed backdrop lands on the dialog element itself, outside its box
    if (t.tagName === 'DIALOG' && t.classList.contains('modal') && t.open) {
      var r = t.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
    }
  });

  /* ---------- Tooltips: [data-tip] ---------- */
  var tipEl = null;
  function placeTip(el) {
    var r = el.getBoundingClientRect(), W = root.clientWidth, pad = 12;
    var w = parseFloat(getComputedStyle(el, '::after').width) || Math.min(280, W - 32);
    var cx = r.left + r.width / 2, dx = 0;
    if (cx - w / 2 < pad) dx = pad - (cx - w / 2);
    else if (cx + w / 2 > W - pad) dx = (W - pad) - (cx + w / 2);
    el.style.setProperty('--tip-dx', Math.round(dx) + 'px');
    var head = doc.querySelector('.app-header');
    var top = head ? head.getBoundingClientRect().bottom : 0;
    el.classList.toggle('tip-below', r.top - top < 110);
  }
  function openTip(el) {
    if (tipEl && tipEl !== el) closeTip();
    tipEl = el;
    el.classList.add('is-tip-open');
    placeTip(el);
  }
  function closeTip() {
    if (!tipEl) return;
    tipEl.classList.remove('is-tip-open');
    tipEl = null;
  }
  doc.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el || e.pointerType !== 'mouse') return;   // :hover shows it; keep it inside the screen
    placeTip(el);
    requestAnimationFrame(function () { placeTip(el); });
  });
  doc.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el) openTip(el); else closeTip();
  });
  doc.addEventListener('focusout', function (e) {
    if (tipEl && e.target === tipEl) closeTip();
  });
  doc.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el) openTip(el); else closeTip();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTip(); });
  window.addEventListener('scroll', closeTip, { passive: true });
  window.addEventListener('resize', closeTip);

  /* ---------- Tabs: .tabs [role="tab"] ---------- */
  function showPanels(tab) {
    var list = tab.closest('.tabs');
    if (!list) return;
    var tabs = list.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i] === tab, id = tabs[i].getAttribute('aria-controls');
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
      var p = id && doc.getElementById(id);
      if (p) p.hidden = !on;
    }
  }
  doc.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.tabs [role="tab"]');
    if (tab && tab.isConnected) showPanels(tab);
  });
  doc.addEventListener('keydown', function (e) {
    var tab = e.target.closest && e.target.closest('.tabs [role="tab"]');
    if (!tab) return;
    var step = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    var list = tab.closest('.tabs'), tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(tab);
    var n = step === 'first' ? 0 : step === 'last' ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
    var label = list.getAttribute('aria-label');
    tabs[n].click();
    // the app may draw the tab list again after a click: focus the same tab in the visible new list
    var now = list.isConnected ? list : null;
    if (!now && label) {
      var lists = doc.querySelectorAll('.tabs[aria-label]');
      for (var k = 0; k < lists.length && !now; k++) if (lists[k].getAttribute('aria-label') === label && lists[k].offsetParent) now = lists[k];
    }
    var target = now && now.querySelectorAll('[role="tab"]')[n];
    if (target) target.focus();
  });

  /* ---------- Start ---------- */
  api.hydrate();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { api.hydrate(); });
})();
