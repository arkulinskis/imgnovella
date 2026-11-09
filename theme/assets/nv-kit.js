/* nv-kit.js: the small window.UI helpers ImgNovella's JavaScript engines (nv-editor.js, nv-tools.js) were written
   against, now that the app itself is Python Forms. Loaded after app-kit.js (UI.esc, UI.store, UI.icon, UI.ICONS,
   light/dark). The player (nv-runtime.js) needs none of this: it is self-contained.

   Server:   UI.api(fn, ...args) / UI.apiQuiet go through window.NV_BRIDGE, a Python function set by client_code/nv.py
             (anvil.server.call there). A reply {ok: false, error} rejects with err.expected = true; errors nobody
             catches become a toast.
   Host:     NVK.host = Python functions (client_code/nv.py): toast, confirm, go. UI.toast / UI.confirm use them, so the
             editor shows the same notifications and yes/no dialogs as the Forms.
   Screens:  UI.page(name, opts, mount) keeps an engine screen in UI.pages; Components/Screen mounts it ("edit").
   Also:     UI.me (set by Python on start, sign in and sign out), UI.go, UI.hashFor, UI.busy, UI.formData, UI.ago,
             UI.fmtDate, UI.modal (the editor's own dialogs: picture picker, publish, Package & sell) and [data-go]
             links inside engine markup. */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  var NVK = window.NVK = window.NVK || {};
  UI.config = UI.config || {};
  UI.config.name = 'ImgNovella';
  UI.pages = UI.pages || {};
  UI.me = UI.me || null;
  NVK.host = NVK.host || {};

  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  /* Mount an engine screen into el. Returns {ready: Promise, destroy()}. The screen sets UI_READY when it has loaded. */
  UI.mountScreen = function (name, el, args) {
    var p = UI.pages[name];
    if (!p) throw new Error('No screen called ' + name);
    var out = p.mount(el, { name: name, args: args || [], me: UI.me, go: UI.go, api: UI.api, page: p });
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    ready = Promise.resolve(ready).then(function (v) { window.UI_READY = true; return v; }, function (e) { window.UI_READY = true; throw e; });
    return { ready: ready, destroy: (out && out.destroy) || function () {} };
  };

  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function () {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h && NVK.host.go) NVK.host.go(h); else location.hash = h;
  };

  /* ------------------------------------------------------------------ toasts and dialogs */
  UI.toast = function (msg, kind) {
    if (NVK.host.toast) { try { NVK.host.toast(String(msg), kind || ''); return; } catch (e) { /* fall through */ } }
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, kind === 'error' ? 6500 : 3200);
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    if (NVK.host.confirm) return Promise.resolve(NVK.host.confirm(JSON.stringify(o))).then(function (v) { return !!v; });
    return Promise.resolve(window.confirm(o.title || 'Are you sure?'));
  };
  /* The editor's own dialogs (picture picker, publish, Package & sell, new scene ...): plain HTML from the engine. */
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement, wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" tabindex="-1">' +
      '<button type="button" class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select') || wrap.querySelector('.ui-modal');
    setTimeout(function () { if (first.focus) first.focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };

  /* ------------------------------------------------------------------ the server, through Python */
  function send(kind, payload) {
    if (!window.NV_BRIDGE) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = window.NV_BRIDGE(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function expected(res) {
    if (res && typeof res === 'object' && res.ok === false) {
      var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
      throw err;
    }
    return res;
  }
  UI.api = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: false }).then(expected); };
  UI.apiQuiet = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: true }).then(expected); };
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* [data-go="page/arg"] inside engine markup (the editor's back button, "Go Pro") */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go]');
    if (!el) return;
    e.preventDefault();
    UI.go.apply(null, el.getAttribute('data-go').split('/'));
  });
})();
