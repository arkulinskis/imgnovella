/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
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
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
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

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
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
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
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
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback (footer + menu)
     All feedback goes to Prepsto. The widget tag in head.html (data-prepsto="CODE") slides its panel in;
     any [data-feedback] or [data-prepsto-open] element opens it. If the widget hasn't loaded, the panel opens in a new tab.
     There is no in-app feedback form any more: Admin -> Feedback only lists older messages (and app requests). */
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    var tag = document.querySelector('script[data-prepsto]');
    var code = tag && tag.getAttribute('data-prepsto');
    if (code && code.indexOf('__') !== 0) window.open('https://prepsto.com/#f/' + encodeURIComponent(code), '_blank', 'noopener');
    else UI.toast('Feedback is not set up yet.', 'error');
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'ImgNovella',
    key: 'imgnovella',          // prefix for this app's browser storage
    tagline: 'Visual novels, made in your browser.',   // footer line
    home: 'studio',              // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;
  try { if (matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('touch'); } catch (e) {}

  // Extra icons this app uses (same 24px stroke style as core.js).
  var I = UI.ICONS;
  I.play = '<path d="M7 4.5v15l12.5-7.5z"/>';
  I.music = '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>';
  I.upload = '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';
  I.download = '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';
  I.book = '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>';
  I.jump = '<path d="M6 4v6a4 4 0 0 0 4 4h8"/><path d="m14 10 4 4-4 4"/><circle cx="6" cy="4" r="1.5"/>';
  I.eyeoff = '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.2M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.4-1.2"/>';
  I.flag = '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>';
  I.link = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
  I.box = '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>';
  I.file = '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>';
  I.gear = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';
  I.undo = '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>';
  I.up = '<path d="m6 15 6-6 6 6"/>';
  I.game = '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/>';

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>Img<b>Novella</b></span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#studio" data-go="studio">' + UI.icon('edit') + 'Your studio</a>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      '<a href="#pro" data-go="pro">' + UI.icon('star') + (me.plan === 'pro' ? 'Pro plan (active)' : 'Go Pro') + '</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (me ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost hide-s" href="#discover" data-go="discover">Discover</a><a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Start creating</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<a href="#discover" data-go="discover">Discover</a>' +
        '<a href="#guide" data-go="guide">Guide</a>' +
        '<a href="#pro" data-go="pro">Pro</a>' +
        '<a href="https://prepsto.com/#f/qz375dr" target="_blank" rel="noopener" data-prepsto-open>Submit feedback</a>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _ed.html ===== */
(function () {
  'use strict';
  var esc = UI.esc;
  var ED = window.ED = {};

  ED.STEPS = {
    say: ['Line', 'chat'], bg: ['Background', 'image'], show: ['Show character', 'user'], hide: ['Hide character', 'eyeoff'],
    set: ['Change variable', 'sliders'], jump: ['Jump to scene', 'jump'], cg: ['Illustration (CG)', 'star'], music: ['Music', 'music'],
    sfx: ['Sound', 'bell'], fx: ['Effect', 'sparkle'], wait: ['Pause', 'clock'], input: ['Ask the reader', 'edit'],
    card: ['Chapter card', 'book'], note: ['Writer\'s note', 'info'], game: ['Mini-game', 'game']
  };
  ED.ADD_ORDER = ['say', 'bg', 'show', 'hide', 'set', 'jump', 'game', 'cg', 'music', 'sfx', 'fx', 'wait', 'input', 'card', 'note'];
  ED.newStep = function (t, data, scene) {
    var s = { t: t, k: NVT.uid('k') };
    var lastWho = null;
    (scene && scene.steps || []).forEach(function (x) { if (x.t === 'say') lastWho = x.who || null; });
    var c0 = (data.chars || [])[0];
    if (t === 'say') { s.who = lastWho; s.text = ''; }
    if (t === 'bg') { s.img = ''; s.fx = 'dissolve'; }
    if (t === 'show') { s.char = c0 ? c0.id : null; s.pose = c0 && c0.poses[0] ? c0.poses[0].name : ''; s.pos = 'center'; s.fx = 'dissolve'; }
    if (t === 'hide') { s.char = c0 ? c0.id : null; s.fx = 'dissolve'; }
    if (t === 'set') { var v = (data.vars || [])[0]; s.var = v ? v.name : ''; s.op = v && v.type === 'number' ? '+' : '='; s.val = v && v.type === 'number' ? 1 : v && v.type === 'flag' ? true : ''; }
    if (t === 'jump') { s.to = null; s.if = ''; }
    if (t === 'cg') s.img = '';
    if (t === 'music') s.track = 'calm';
    if (t === 'sfx') s.name = 'chime';
    if (t === 'fx') s.name = 'shake';
    if (t === 'wait') s.secs = 1;
    if (t === 'input') { var tv = (data.vars || []).filter(function (v) { return v.type === 'text'; })[0]; s.var = tv ? tv.name : ''; s.prompt = 'What\'s your name?'; s.dflt = ''; }
    if (t === 'card') { s.title = 'Chapter 1'; s.sub = ''; }
    if (t === 'note') s.text = '';
    if (t === 'game') {
      var pal = NVT.GAME_PALETTES[0];
      s.game = 'timing'; s.diff = 1; s.title = ''; s.prompt = ''; s.c1 = (data.settings || {}).accent || pal[1]; s.c2 = pal[2]; s.c3 = pal[3];
      s.win = null; s.lose = null; s.retry = true; s.skip = true; s.var = '';
    }
    return s;
  };

  /* ---------------------------------------------------------------- picture picker */
  ED.pickImage = function (o) {
    // o: {kind, title, images, allowNone, upload(file, kind) -> Promise<image>}
    return new Promise(function (resolve) {
      var tab = 'mine', kind = o.kind || 'bg', answered = false;
      var m = UI.modal('<h2>' + esc(o.title || 'Choose a picture') + '</h2><div class="ui-seg" style="margin-bottom:12px" data-pt>' +
        '<button type="button" data-tab="mine" class="on">Your pictures</button><button type="button" data-tab="art">Starter art</button></div>' +
        '<div data-pbody></div><div class="ui-row between" style="margin-top:14px">' +
        (o.allowNone ? '<button type="button" class="ui-btn ghost" data-none>' + UI.icon('x') + 'No picture</button>' : '<span></span>') +
        '<label class="ui-btn" style="cursor:pointer">' + UI.icon('upload') + 'Upload<input type="file" accept="image/*" hidden data-up></label></div>',
        { wide: true, onclose: function () { if (!answered) resolve(null); } });
      var body = m.el.querySelector('[data-pbody]');
      function grid(list) {
        if (!list.length) return '<div class="ui-empty" style="padding:28px">' + UI.icon('image') + '<h3>No pictures here yet</h3><p>Upload one, or pick from the starter art.</p></div>';
        return '<div class="nv-pick-grid">' + list.map(function (i) {
          return '<button type="button" data-key="' + esc(i.key) + '"><img class="nv-thumb ' + (i.kind === 'sprite' ? 'contain' : '') + '" alt="" loading="lazy" src="' + esc(NVT.img(i.key)) + '"><span>' + esc(i.name) + '</span></button>';
        }).join('') + '</div>';
      }
      function draw() {
        var src = tab === 'mine' ? (o.images || []) : NVT.ART;
        var list = src.filter(function (i) { return kind === 'all' || i.kind === kind || (kind === 'bg' && i.kind === 'cover') || (kind === 'cover' && (i.kind === 'bg' || i.kind === 'cg')); });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:10px"><select data-kind style="max-width:220px">' +
          [['bg', 'Backgrounds'], ['sprite', 'Characters'], ['cg', 'Illustrations'], ['cover', 'Covers'], ['all', 'Everything']].map(function (k) {
            return '<option value="' + k[0] + '"' + (k[0] === kind ? ' selected' : '') + '>' + k[1] + '</option>';
          }).join('') + '</select><span class="muted small">' + list.length + ' shown</span></div>' + grid(list);
        Array.prototype.forEach.call(m.el.querySelectorAll('[data-tab]'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
      }
      m.el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-tab]');
        if (t) { tab = t.getAttribute('data-tab'); draw(); return; }
        var k = e.target.closest('[data-key]');
        if (k) { answered = true; m.close(); resolve(k.getAttribute('data-key')); return; }
        if (e.target.closest('[data-none]')) { answered = true; m.close(); resolve(''); }
      });
      m.el.addEventListener('change', function (e) {
        if (e.target.matches('[data-kind]')) { kind = e.target.value; draw(); return; }
        if (e.target.matches('[data-up]') && e.target.files[0] && o.upload) {
          var f = e.target.files[0];
          body.innerHTML = '<div class="ui-skel" style="height:160px"></div><p class="muted center">Shrinking and uploading ' + esc(f.name) + '…</p>';
          o.upload(f, kind === 'all' ? 'bg' : kind).then(function (img) { answered = true; m.close(); resolve(img.key); }, function (err) { UI.toast(err.message, 'error'); tab = 'mine'; draw(); });
        }
      });
      draw();
    });
  };

  /* ---------------------------------------------------------------- static scene preview (no typing, no sound) */
  function stateAt(data, scene, upto) {
    var st = { bg: '', chars: {}, cg: '', say: null };
    function apply(x) {
      if (x.t === 'bg') st.bg = x.img;
      else if (x.t === 'show') st.chars[x.char] = { pose: x.pose || (st.chars[x.char] || {}).pose, pos: x.pos || (st.chars[x.char] || {}).pos || 'center' };
      else if (x.t === 'hide') delete st.chars[x.char];
      else if (x.t === 'cg') st.cg = x.img;
      else if (x.t === 'say') { st.say = x; st.game = null; if (x.pose && st.chars[x.who]) st.chars[x.who].pose = x.pose; }
      else if (x.t === 'game') { st.game = x; st.say = null; }
    }
    var parent = (data.scenes || []).filter(function (s) { return NVT.targets(s).some(function (t) { return t.to === scene.id; }); })[0];
    if (parent) (parent.steps || []).forEach(apply);
    st.say = null; st.cg = ''; st.game = null;
    (scene.steps || []).slice(0, upto + 1).forEach(apply);
    if (st.game && (scene.steps || [])[upto] !== st.game) st.game = null;
    return st;
  }
  ED.preview = function (host, data, scene, upto) {
    var S = data.settings || {}, portrait = S.orientation !== 'landscape', st = stateAt(data, scene, upto == null ? 9999 : upto);
    var chars = {};
    (data.chars || []).forEach(function (c) { chars[c.id] = c; });
    var W = host.clientWidth || 300, H = portrait ? W * 1.5 : W / 1.5;
    var u = (portrait ? W : H) / 400;
    var who = st.say && chars[st.say.who];
    var img = function (c, pose) { var p = (c.poses || []).filter(function (x) { return x.name === pose; })[0] || (c.poses || [])[0]; return p ? NVT.img(p.img) : ''; };
    host.innerHTML = '<div class="nvp nvp-tb-' + esc(S.textbox || 'sakura') + ' nvp-font-' + esc(S.font || 'rounded') + (portrait ? ' nvp-portrait' : ' nvp-landscape') + '" style="--u:' + u.toFixed(3) + 'px;--acc:' + esc(S.accent || '#ff4f8b') + ';--acc-ink:' + NV.inkFor(S.accent || '#ff4f8b') + '">' +
      '<div class="nvp-stage" style="width:' + Math.floor(W) + 'px;height:' + Math.floor(H) + 'px">' +
      '<div class="nvp-bg">' + (st.bg ? '<img alt="" style="opacity:1" src="' + esc(NVT.img(st.bg)) + '">' : '') + '</div>' +
      '<div class="nvp-chars">' + Object.keys(st.chars).map(function (id) {
        var c = chars[id]; if (!c) return '';
        var src = img(c, st.chars[id].pose);
        return '<div class="nvp-ch' + (src ? '' : ' noimg') + (who && who.id !== id ? ' dim' : '') + '" data-label="' + esc(c.name) + '" style="left:' + (NV.POSITIONS[st.chars[id].pos] || 50) + '%">' + (src ? '<img alt="" src="' + esc(src) + '">' : '') + '</div>';
      }).join('') + '</div>' +
      (st.cg ? '<div class="nvp-cg on"><img alt="" src="' + esc(NVT.img(st.cg)) + '"></div>' : '') +
      (st.say ? '<div class="nvp-box' + (who ? '' : ' narration') + '">' + (who ? '<div class="nvp-name" style="--who:' + esc(who.color) + ';--who-ink:' + NV.inkFor(who.color) + '">' + esc(NV.plain(who.name, { player: 'Aki' })) + '</div>' : '') +
        '<div class="nvp-text">' + NV.format(st.say.text || '…', ED.sampleVars(data)).replace(/class="nvp-c"/g, 'class="nvp-c on"') + '</div></div>' : '') +
      (st.game ? '<div class="nvp-game" style="--g1:' + esc(st.game.c1 || '#ff4f8b') + ';--g2:' + esc(st.game.c2 || '#3cc6c0') + ';--g3:' + esc(st.game.c3 || '#fff') + ';--g3i:' + NV.inkFor(st.game.c3 || '#fff') + ';--g2i:' + NV.inkFor(st.game.c2 || '#3cc6c0') + '"><div class="nvp-g-card"><div class="nvp-g-head"><small>Mini-game</small><h3>' +
        esc(st.game.title || (NV.GAMES[st.game.game] || ['Mini-game'])[0]) + '</h3><p>' + esc(st.game.prompt || (NV.GAMES[st.game.game] || ['', ''])[1]) + '</p></div><p class="nvp-g-status">' + ['Easy', 'Normal', 'Hard'][st.game.diff || 0] + '</p></div></div>' : '') +
      '</div></div>';
  };
  ED.sampleVars = function (data) {
    var v = {};
    (data.vars || []).forEach(function (d) { v[d.name] = d.init; });
    return v;
  };

  /* ---------------------------------------------------------------- playtest */
  ED.playtest = function (data, meta, startScene, onClose) {
    var wrap = document.createElement('div');
    wrap.className = 'ui pt';
    var scenes = data.scenes || [];
    wrap.innerHTML = '<div class="pt-top"><h3>' + UI.icon('play') + ' Playtest · ' + esc(meta.title) + '</h3>' +
      '<button class="ui-btn" data-r>' + UI.icon('refresh') + 'Restart</button><button class="ui-btn primary" data-x>' + UI.icon('x') + 'Close</button></div>' +
      '<div class="pt-body"><div class="pt-host" data-host></div><aside class="pt-side">' +
      '<div class="pt-now">Now in: <b data-now>…</b></div>' +
      '<div><h4>Jump to a scene</h4><select data-jump><option value="">Choose…</option>' + scenes.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><h4>Variables (live)</h4><div class="pt-vars" data-vars></div></div>' +
      '<p class="small" style="opacity:.7;margin:0">Playtests don\'t count as plays. Saves made here stay separate from your readers\'.</p></aside></div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    var host = wrap.querySelector('[data-host]');
    var byId = {};
    scenes.forEach(function (s) { byId[s.id] = s; });
    var player = NV.mount(host, data, {
      resolve: NVT.img, storageKey: 'draft-' + meta.slug, meta: { title: meta.title, author: meta.author }, branding: false,
      startScene: startScene || null,
      onScene: function (id) { wrap.querySelector('[data-now]').textContent = byId[id] ? byId[id].name : id; }
    });
    var editing = false;
    function vars() {
      var st = player.state(), box = wrap.querySelector('[data-vars]');
      if (editing) return;
      if (!st) { box.innerHTML = '<span style="opacity:.6">Start the story to see them.</span>'; return; }
      var defs = data.vars || [];
      box.innerHTML = defs.length ? defs.map(function (d) {
        var v = st.vars[d.name];
        return '<label><code>' + esc(d.name) + '</code><input data-var="' + esc(d.name) + '" data-type="' + d.type + '" value="' + esc(v) + '"></label>';
      }).join('') : '<span style="opacity:.6">This novel has no variables.</span>';
    }
    var timer = setInterval(vars, 600);
    vars();
    function close() {
      clearInterval(timer); player.destroy(); wrap.remove();
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      document.removeEventListener('keydown', key);
      if (onClose) onClose();
    }
    function key(e) { if (e.key === 'Escape' && !wrap.querySelector('.nvp-screen:not([hidden])') && e.target.tagName !== 'INPUT') { /* the player uses Esc for its menu */ } }
    document.addEventListener('keydown', key);
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) close();
      if (e.target.closest('[data-r]')) player.restart();
    });
    wrap.addEventListener('change', function (e) {
      if (e.target.matches('[data-jump]') && e.target.value) { player.jump(e.target.value); e.target.value = ''; }
    });
    wrap.addEventListener('focusin', function (e) { if (e.target.matches('[data-var]')) editing = true; });
    wrap.addEventListener('focusout', function (e) {
      if (!e.target.matches('[data-var]')) return;
      editing = false;
      var t = e.target.getAttribute('data-type'), v = e.target.value;
      player.setVar(e.target.getAttribute('data-var'), t === 'number' ? (parseFloat(v) || 0) : t === 'flag' ? (v === 'true' || v === '1') : v);
    });
    setTimeout(function () { var r = host.querySelector('.nvp'); if (r) r.focus(); }, 60);
    return { close: close };
  };

  /* ---------------------------------------------------------------- the story check */
  ED.lintHtml = function (items) {
    if (!items.length) return '<div class="ui-note">' + UI.icon('check') + ' Everything checks out: every choice leads somewhere and every scene can be reached.</div>';
    return '<div class="ed-lint">' + items.map(function (it, i) {
      return '<button type="button" data-lint="' + i + '"><span class="lv ui-badge ' + (it.lvl === 'error' ? 'bad' : 'warn') + '">' + (it.lvl === 'error' ? 'Fix' : 'Check') + '</span>' +
        '<span>' + (it.sceneName ? '<small>' + esc(it.sceneName) + '</small>' : '') + esc(it.msg) + '</span></button>';
    }).join('') + '</div>';
  };

  /* ---------------------------------------------------------------- publish */
  ED.publish = function (ctx) {
    // ctx: {story, data, images, save() -> Promise, onDone(story)}
    var items = NVT.lint(ctx.data, ctx.images, ctx.sounds), errors = items.filter(function (i) { return i.lvl === 'error'; });
    var st = ctx.story, link = location.origin + location.pathname + '#play/' + st.slug;
    var m = UI.modal('<h2>' + UI.icon('globe') + ' Publish "' + esc(st.title) + '"</h2>' +
      (errors.length ? '<div class="ui-error" style="margin-bottom:12px">Fix ' + UI.plural(errors.length, 'problem') + ' first, so readers don\'t get stuck.</div>' + ED.lintHtml(errors)
        : '<p class="muted">Publishing freezes a copy of your novel for readers. Keep editing afterwards: readers only see changes when you publish again.</p>' +
          (items.length ? '<p class="small muted">' + UI.plural(items.length, 'thing') + ' to check (not blocking). See "Check" in the editor.</p>' : '') +
          '<div class="ui-choices" style="grid-template-columns:1fr 1fr;margin:14px 0">' +
          '<label class="ui-choice"><input type="radio" name="vis" value="public" checked><span>' + UI.icon('globe') + '<b>Public</b>&nbsp;· in Discover</span></label>' +
          '<label class="ui-choice"><input type="radio" name="vis" value="unlisted"><span>' + UI.icon('link') + '<b>Unlisted</b>&nbsp;· link only</span></label></div>' +
          '<div class="ui-row end"><button class="ui-btn ghost" data-close>Not yet</button><button class="ui-btn primary" data-go-pub>' + UI.icon('sparkle') + (st.status === 'draft' ? 'Publish' : 'Publish changes') + '</button></div>'), { wide: errors.length > 0 });
    m.el.addEventListener('click', function (e) {
      var l = e.target.closest('[data-lint]');
      if (l) { m.close(); if (ctx.onLint) ctx.onLint(errors[+l.getAttribute('data-lint')]); return; }
      var b = e.target.closest('[data-go-pub]');
      if (!b) return;
      var vis = (m.el.querySelector('[name=vis]:checked') || {}).value || 'public';
      UI.busy(b, UI.api('publish_story', st.id, vis, ctx.data)).then(function (r) {
        ctx.onDone(r.story);
        m.el.innerHTML = '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' +
          '<div style="text-align:center"><div style="font-size:3rem;line-height:1">🌸</div><h2 style="padding:0">It\'s live!</h2><p class="muted">' +
          (vis === 'public' ? 'Your novel is in Discover. Share the link too:' : 'Anyone with this link can play it:') + '</p></div>' +
          '<div class="share-box"><input type="text" readonly value="' + esc(link) + '"><button class="ui-btn primary" data-copy>' + UI.icon('copy') + 'Copy</button></div>' +
          '<div class="ui-row end" style="margin-top:16px"><a class="ui-btn" href="#play/' + esc(st.slug) + '" data-close>' + UI.icon('play') + 'Play it</a><button class="ui-btn ghost" data-close>Done</button></div>';
        m.el.querySelector('[data-copy]').onclick = function () { ED.copy(link); };
      });
    });
  };
  /* try a mini-game from the editor */
  ED.tryGame = function (x, accent) {
    var m = UI.modal('<div data-gh style="min-height:380px;display:grid;place-items:center"></div>', { onclose: function () { if (run) run.destroy(); } });
    var run = NV.playGame(m.el.querySelector('[data-gh]'), x, accent, function (win) { UI.toast(win ? 'You won! (In the story: ' + (x.win ? 'goes to the "win" scene' : 'carries on') + ')' : 'You lost. (In the story: ' + (x.lose ? 'goes to the "lose" scene' : 'carries on') + ')', win ? 'ok' : ''); m.close(); });
  };
  ED.copy = function (text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { UI.toast('Link copied', 'ok'); }, function () { UI.toast('Select the link and copy it'); });
  };

  /* ---------------------------------------------------------------- package & sell */
  ED.exportGame = function (ctx) {
    // ctx: {story, data, images, limits, me}
    var st = ctx.story, pro = ctx.limits.plan === 'pro', year = new Date().getFullYear();
    var items = NVT.lint(ctx.data, ctx.images, ctx.sounds), errors = items.filter(function (i) { return i.lvl === 'error'; });
    var portrait = (ctx.data.settings || {}).orientation !== 'landscape';
    var m = UI.modal('<h2>' + UI.icon('download') + ' Package &amp; sell</h2>' +
      '<p class="muted">Download "' + esc(st.title) + '" as a complete game: one HTML file with every picture, the player, saves, music and endings built in. It works offline in any browser, so you can sell it anywhere.</p>' +
      (errors.length ? '<div class="ui-error" style="margin-bottom:12px">' + UI.icon('info') + ' Your story has ' + UI.plural(errors.length, 'problem') + ' (see Check). You can still download a test copy.</div>' : '') +
      '<form class="ex-opt" data-ex>' +
      '<div class="ui-choices" style="grid-template-columns:1fr 1fr">' +
      '<label class="ui-choice"><input type="radio" name="fmt" value="zip" checked><span>' + UI.icon('box') + '<span><b>itch.io-ready .zip</b><br><small class="muted">index.html inside</small></span></span></label>' +
      '<label class="ui-choice"><input type="radio" name="fmt" value="html"><span>' + UI.icon('file') + '<span><b>Single .html</b><br><small class="muted">for Gumroad, Ko-fi, your site</small></span></span></label></div>' +
      '<label class="ui-field"><span>License line <em>(shown in the file and credits)</em></span><input type="text" name="license" maxlength="160" value="© ' + year + ' ' + esc(ctx.me.name) + '. All rights reserved."></label>' +
      '<label class="ui-check"><input type="checkbox" name="branding"' + (pro ? '' : ' checked disabled') + '> Show "Made with ImgNovella" on the title screen' + (pro ? '' : ' <span class="ui-badge brand">Pro can turn this off</span>') + '</label>' +
      '<div data-prog hidden><div class="ex-progress"><i></i></div><p class="small muted" data-prog-t style="margin-top:6px"></p></div>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Close</button><button class="ui-btn primary" type="submit">' + UI.icon('download') + 'Download</button></div></form>' +
      '<div class="ex-guide" style="margin-top:12px">' +
      '<details><summary>Sell it on itch.io</summary><ol>' +
      '<li>Create a new project, and set <b>Kind of project</b> to <b>HTML</b>.</li>' +
      '<li>Upload the .zip and tick <b>This file will be played in the browser</b>.</li>' +
      '<li>Set the viewport to <b>' + (portrait ? '600 × 900' : '900 × 600') + '</b> and turn on the <b>Fullscreen button</b>.</li>' +
      '<li>Choose <b>Paid</b> (or "Pay what you want") under Pricing. Readers who buy can also download the file.</li>' +
      '<li>Add your cover (630 × 500 works best on itch), a few screenshots from Playtest, and content warnings.</li></ol></details>' +
      '<details><summary>Sell it on Gumroad, Ko-fi or Payhip</summary><ol>' +
      '<li>Create a digital product and upload the .html (or the .zip).</li>' +
      '<li>Tell buyers: "Download, then double-click to play in your browser. Saves stay on your device."</li>' +
      '<li>Set your price. Offer a free demo by publishing a short version here and linking to it.</li></ol></details>' +
      '<details><summary>Good to know</summary><ul>' +
      '<li>The game keeps saves, endings found and settings in the reader\'s browser.</li>' +
      '<li>Fonts load from Google Fonts when online; offline it falls back to the device\'s fonts.</li>' +
      '<li>Only sell art you own or have the rights to. The built-in starter art may be used in your novels, free or paid.</li>' +
      '<li>Free plan: pictures up to 400 × 600. Pro: up to 1200 × 1800, and no ImgNovella credit.</li></ul></details></div>', { wide: true });
    var form = m.el.querySelector('[data-ex]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form), btn = form.querySelector('[type=submit]');
      var prog = m.el.querySelector('[data-prog]'), bar = prog.querySelector('i'), t = m.el.querySelector('[data-prog-t]');
      prog.hidden = false; t.textContent = 'Gathering pictures…';
      var data = JSON.parse(JSON.stringify(ctx.data));
      if (v.license) data.settings.credits = (data.settings.credits ? data.settings.credits + '\n\n' : '') + v.license;
      var meta = { title: st.title, author: ctx.me.name, blurb: st.blurb, slug: st.slug };
      var work = NVT.buildGame(meta, data, { branding: pro ? !!v.branding : true, license: v.license }, function (d, n) {
        bar.style.width = Math.round(d / n * 90) + '%'; t.textContent = 'Packing pictures and sounds: ' + d + ' of ' + n;
      }).then(function (html) {
        var name = NVT.slugify(st.title);
        bar.style.width = '100%';
        var kb = Math.round(html.length / 1024);
        if (v.fmt === 'zip') {
          NVT.download(NVT.zip([{ name: 'index.html', data: html }, { name: 'README.txt', data: st.title + '\nby ' + ctx.me.name + '\n\nOpen index.html in any web browser to play.\nSaves are kept in your browser.\n\n' + (v.license || '') + '\nMade with ImgNovella\n' }]), name + '-itch.zip');
        } else {
          NVT.download(new Blob([html], { type: 'text/html' }), name + '.html');
        }
        t.textContent = 'Done! ' + kb + ' KB. Check your downloads.';
        UI.toast('Your game is ready', 'ok');
      }, function (err) { t.textContent = err.message; UI.toast(err.message, 'error'); });
      UI.busy(btn, work);
    });
  };
})();

/* ===== _nv_runtime.html ===== */
function NovellaRuntime() {
  'use strict';
  var RT = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function store(key, val) {
    try { if (val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
    return val;
  }

  /* ================================================================== conditions: trust >= 3 and not angry */
  function tokenize(s) {
    var toks = [], i = 0, m;
    s = String(s);
    while (i < s.length) {
      var c = s[i], rest = s.slice(i);
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^\d*\.?\d+/.exec(rest))) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
        var w = m[0]; i += w.length;
        if (w === 'and' || w === 'or' || w === 'not') toks.push({ t: 'op', v: w });
        else if (w === 'true' || w === 'True') toks.push({ t: 'lit', v: true });
        else if (w === 'false' || w === 'False') toks.push({ t: 'lit', v: false });
        else toks.push({ t: 'id', v: w });
        continue;
      }
      if (c === '"' || c === "'") { var j = s.indexOf(c, i + 1); if (j < 0) throw new Error('A quote is missing its partner'); toks.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      var two = s.substr(i, 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].indexOf(two) >= 0) { toks.push({ t: 'op', v: two === '&&' ? 'and' : two === '||' ? 'or' : two }); i += 2; continue; }
      if ('<>+-*/(),!'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c === '!' ? 'not' : c }); i++; continue; }
      if (c === '=') { toks.push({ t: 'op', v: '==' }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return toks;
  }
  function parse(src) {
    var toks = tokenize(src), p = 0;
    function peek(v) { var t = toks[p]; return !!(t && t.t === 'op' && t.v === v); }
    function eat(v) { if (!peek(v)) throw new Error('Expected "' + v + '"'); p++; }
    function or_() { var a = and_(); while (peek('or')) { p++; a = { op: 'or', a: a, b: and_() }; } return a; }
    function and_() { var a = not_(); while (peek('and')) { p++; a = { op: 'and', a: a, b: not_() }; } return a; }
    function not_() { if (peek('not')) { p++; return { op: 'not', a: not_() }; } return cmp(); }
    function cmp() {
      var a = add(), t = toks[p];
      if (t && t.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].indexOf(t.v) >= 0) { p++; return { op: t.v, a: a, b: add() }; }
      return a;
    }
    function add() { var a = mul(); while (peek('+') || peek('-')) { var o = toks[p++].v; a = { op: o, a: a, b: mul() }; } return a; }
    function mul() { var a = un(); while (peek('*') || peek('/')) { var o = toks[p++].v; a = { op: o, a: a, b: un() }; } return a; }
    function un() { if (peek('-')) { p++; return { op: 'neg', a: un() }; } return atom(); }
    function atom() {
      var t = toks[p++];
      if (!t) throw new Error('The condition stops too early');
      if (t.t === 'num' || t.t === 'str' || t.t === 'lit') return { v: t.v };
      if (t.t === 'id') {
        if (peek('(')) {
          p++; var args = [];
          if (!peek(')')) { args.push(or_()); while (peek(',')) { p++; args.push(or_()); } }
          eat(')');
          if (['seen', 'ended', 'chose'].indexOf(t.v) < 0) throw new Error('Unknown function ' + t.v + '()');
          return { fn: t.v, args: args };
        }
        return { id: t.v };
      }
      if (t.t === 'op' && t.v === '(') { var e = or_(); eat(')'); return e; }
      throw new Error('Unexpected "' + t.v + '"');
    }
    if (!toks.length) return null;
    var ast = or_();
    if (p < toks.length) throw new Error('Unexpected "' + toks[p].v + '"');
    return ast;
  }
  var cache = {};
  function compile(src) {
    src = String(src || '').trim();
    if (!cache.hasOwnProperty(src)) { try { cache[src] = { ast: parse(src) }; } catch (e) { cache[src] = { error: e.message }; } }
    return cache[src];
  }
  function n(v) { return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : (parseFloat(v) || 0); }
  function ev(x, env) {
    if (x.hasOwnProperty('v')) return x.v;
    if (x.id) return env.vars.hasOwnProperty(x.id) ? env.vars[x.id] : 0;
    if (x.fn) { var a = x.args.map(function (y) { return ev(y, env); }); return env.fns && env.fns[x.fn] ? !!env.fns[x.fn](a[0]) : false; }
    var A = function () { return ev(x.a, env); }, B = function () { return ev(x.b, env); };
    switch (x.op) {
      case 'or': return A() || B();
      case 'and': return A() && B();
      case 'not': return !A();
      case 'neg': return -n(A());
      case '==': var a1 = A(), b1 = B(); return (typeof a1 === 'string' || typeof b1 === 'string') ? String(a1) === String(b1) : n(a1) === n(b1);
      case '!=': var a2 = A(), b2 = B(); return (typeof a2 === 'string' || typeof b2 === 'string') ? String(a2) !== String(b2) : n(a2) !== n(b2);
      case '<': return n(A()) < n(B());
      case '>': return n(A()) > n(B());
      case '<=': return n(A()) <= n(B());
      case '>=': return n(A()) >= n(B());
      case '+': var a3 = A(), b3 = B(); return (typeof a3 === 'string' || typeof b3 === 'string') ? String(a3) + String(b3) : n(a3) + n(b3);
      case '-': return n(A()) - n(B());
      case '*': return n(A()) * n(B());
      case '/': var d = n(B()); return d ? n(A()) / d : 0;
    }
    return false;
  }
  function names(x, out) {
    if (!x) return out;
    if (x.id) out.push(x.id);
    if (x.args) x.args.forEach(function (y) { names(y, out); });
    if (x.a) names(x.a, out);
    if (x.b) names(x.b, out);
    return out;
  }
  RT.check = function (src, known) {
    var c = compile(src);
    if (c.error) return { ok: false, error: c.error, names: [] };
    var ids = names(c.ast, []);
    var unknown = known ? ids.filter(function (k) { return known.indexOf(k) < 0; }) : [];
    return { ok: !unknown.length, error: unknown.length ? 'Unknown variable: ' + unknown.join(', ') : '', names: ids };
  };
  RT.test = function (src, vars, fns) {
    var c = compile(src);
    if (c.error) return false;
    if (!c.ast) return true;
    try { return !!ev(c.ast, { vars: vars || {}, fns: fns }); } catch (e) { return false; }
  };

  /* ================================================================== text: [name], {if c}..{else}..{/if}, **b**, *i*, {color=#f00}, {big}, {small}, {shake}, {w=1} */
  function interpolate(text, vars, fns) {
    text = String(text || '').replace(/\{if ([^}]*)\}([\s\S]*?)(?:\{else\}([\s\S]*?))?\{\/if\}/g, function (all, c, a, b) {
      return RT.test(c, vars, fns) ? a : (b || '');
    });
    return text.replace(/\[([A-Za-z_][A-Za-z0-9_]*)\]/g, function (all, k) {
      if (!vars.hasOwnProperty(k)) return all;
      var v = vars[k];
      return typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
    });
  }
  function markup(text) {
    var out = '', count = 0, pauses = {}, stack = [], i = 0, m;
    function open(tag, attrs) { stack.push(tag); out += '<' + tag + (attrs || '') + '>'; }
    function close(tag) {
      var at = stack.lastIndexOf(tag);
      if (at < 0) return false;
      while (stack.length > at) out += '</' + stack.pop().split(' ')[0] + '>';
      return true;
    }
    while (i < text.length) {
      var rest = text.slice(i);
      if (rest.indexOf('**') === 0) { if (!close('b')) open('b'); i += 2; continue; }
      if (text[i] === '*' && rest.length > 1) { if (!close('i')) open('i'); i += 1; continue; }
      if (text[i] === '{' && (m = /^\{(\/?)(color|big|small|shake|w)(?:=([^}]{0,20}))?\}/.exec(rest))) {
        i += m[0].length;
        var tag = m[2];
        if (tag === 'w') { pauses[count] = (pauses[count] || 0) + (parseFloat(m[3]) || 0.6); continue; }
        if (m[1]) { close(tag === 'color' ? 'span' : 'span'); continue; }
        if (tag === 'color') { var col = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(m[3] || '') ? m[3] : 'inherit'; open('span', ' style="color:' + col + '"'); }
        else open('span', ' class="nvp-' + tag + '"');
        continue;
      }
      if (text[i] === '\n') { out += '<br>'; i++; continue; }
      out += '<span class="nvp-c">' + esc(text[i]) + '</span>';
      count++; i++;
    }
    while (stack.length) out += '</' + stack.pop().split(' ')[0] + '>';
    return { html: out, count: count, pauses: pauses };
  }
  RT.format = function (text, vars) { return markup(interpolate(text, vars || {})).html; };
  RT.plain = function (text, vars) {
    return interpolate(text, vars || {}).replace(/\{\/?(color|big|small|shake|w)(=[^}]*)?\}/g, '').replace(/\*\*|\*/g, '');
  };

  /* ================================================================== audio: music moods + sound effects (Web Audio, no files) */
  var CH = { maj: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], sus: [0, 5, 7, 10], dim: [0, 3, 6, 9], add9: [0, 4, 7, 14] };
  var TRACKS = {
    calm: { name: 'Calm', bpm: 72, prog: [[60, 'maj7'], [57, 'm7'], [65, 'maj7'], [67, 'sus']], wave: 'triangle', arp: 'up' },
    romance: { name: 'Romance', bpm: 66, prog: [[65, 'maj7'], [64, 'm7'], [62, 'm7'], [67, 'sus']], wave: 'sine', arp: 'wave' },
    upbeat: { name: 'Upbeat', bpm: 118, prog: [[60, 'maj'], [67, 'maj'], [69, 'm'], [65, 'add9']], wave: 'square', arp: 'bounce', bass: 'beat' },
    mystery: { name: 'Mystery', bpm: 60, prog: [[57, 'm'], [53, 'maj7'], [52, 'm'], [56, 'dim']], wave: 'sine', arp: 'sparse' },
    tension: { name: 'Tension', bpm: 100, prog: [[50, 'm'], [50, 'm'], [51, 'maj'], [49, 'dim']], wave: 'sawtooth', arp: 'none', bass: 'pulse' },
    sad: { name: 'Sad', bpm: 58, prog: [[57, 'm'], [53, 'maj7'], [60, 'maj'], [55, 'sus']], wave: 'sine', arp: 'down' },
    dreamy: { name: 'Dreamy', bpm: 64, prog: [[62, 'maj7'], [66, 'm7'], [59, 'm7'], [64, 'add9']], wave: 'triangle', arp: 'wave' },
    rain: { name: 'Rain', bpm: 60, prog: [[57, 'm7'], [53, 'maj7']], wave: 'sine', arp: 'sparse', noise: true }
  };
  var SFX = { chime: 'Chime', sparkle: 'Sparkle', whoosh: 'Whoosh', knock: 'Knock', bell: 'Station bell', heartbeat: 'Heartbeat', thud: 'Thud', pop: 'Pop', phone: 'Phone buzz', door: 'Door' };
  RT.TRACKS = TRACKS; RT.SFX = SFX;
  var Audio = (function () {
    var ctx = null, master, mus, fx, filt, cur = null, timer = null, next = 0, step = 0, noiseSrc = null, vols = { music: 0.6, sfx: 0.8 };
    var fileEl = null;
    function fade(el, to, ms, then) {
      var from = el.volume, t0 = Date.now();
      var iv = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / ms);
        try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {}
        if (k >= 1) { clearInterval(iv); if (then) then(); }
      }, 40);
    }
    function stopFile() { if (fileEl) { var e = fileEl; fileEl = null; fade(e, 0, 500, function () { e.pause(); e.src = ''; }); } }
    function ok() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 2600; filt.connect(master);
        mus = ctx.createGain(); mus.connect(filt); fx = ctx.createGain(); fx.connect(master);
        apply();
      }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function apply() { if (mus) { mus.gain.value = vols.music * 0.5; fx.gain.value = vols.sfx * 0.7; } if (fileEl) try { fileEl.volume = vols.music; } catch (e) {} }
    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function tone(dest, freq, t, dur, opt) {
      opt = opt || {};
      var o = ctx.createOscillator(), g = ctx.createGain(), a = opt.a || 0.01, peak = opt.v || 0.2;
      o.type = opt.wave || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dest, t, dur, freq, v, sweep) {
      var len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = 0.9;
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur);
    }
    function schedule() {
      var tr = TRACKS[cur];
      if (!tr) return;
      var beat = 60 / tr.bpm, half = beat / 2;
      while (next < ctx.currentTime + 0.25) {
        var bar = Math.floor(step / 8) % tr.prog.length, inBar = step % 8, ch = tr.prog[bar], notes = CH[ch[1]].map(function (x) { return ch[0] + x; });
        if (inBar === 0) {
          notes.forEach(function (m) { tone(mus, hz(m - 12), next, beat * 4.2, { a: beat * 1.2, v: 0.045, wave: tr.wave === 'square' ? 'triangle' : tr.wave }); });
          tone(mus, hz(ch[0] - 24), next, beat * 3.5, { a: 0.02, v: 0.11 });
        }
        if (tr.bass === 'beat' && inBar % 2 === 0) tone(mus, hz(ch[0] - 24 + (inBar === 4 ? 7 : 0)), next, half * 0.9, { v: 0.12, wave: 'triangle' });
        if (tr.bass === 'pulse') tone(mus, hz(ch[0] - 24), next, half * 0.7, { v: 0.08, wave: 'sawtooth' });
        var pick = null;
        if (tr.arp === 'up') pick = notes[inBar % notes.length] + 12;
        else if (tr.arp === 'down') pick = inBar % 2 === 0 ? notes[(notes.length - 1) - (inBar / 2) % notes.length] + 12 : null;
        else if (tr.arp === 'wave') pick = notes[[0, 1, 2, 3, 2, 1, 0, 1][inBar] % notes.length] + 12;
        else if (tr.arp === 'bounce') pick = notes[[0, 2, 1, 2, 0, 2, 1, 3][inBar] % notes.length] + 12;
        else if (tr.arp === 'sparse') pick = (inBar === 0 || inBar === 3 || inBar === 6) ? notes[(step * 7) % notes.length] + 24 : null;
        if (pick) tone(mus, hz(pick), next, half * 2.6, { v: tr.arp === 'sparse' ? 0.05 : 0.055, wave: tr.wave === 'sawtooth' ? 'triangle' : tr.wave === 'square' ? 'square' : 'triangle', a: 0.005 });
        next += half; step++;
      }
    }
    function startNoise() {
      var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = buf; noiseSrc.loop = true;
      var f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 1400; g.gain.value = 0.12;
      noiseSrc.connect(f); f.connect(g); g.connect(mus); noiseSrc.start();
    }
    return {
      music: function (name, url) {
        name = TRACKS[name] || url ? (name || '') : '';
        if (name === cur) return;
        if (timer) { clearInterval(timer); timer = null; }
        if (noiseSrc) { try { noiseSrc.stop(); } catch (e) {} noiseSrc = null; }
        stopFile();
        cur = name;
        if (name && !TRACKS[name] && url) {
          try {
            var el = new window.Audio(url);
            el.loop = true; el.volume = 0; fileEl = el;
            var pr = el.play(); if (pr && pr.catch) pr.catch(function () {});
            fade(el, vols.music, 900);
          } catch (e) {}
          return;
        }
        if (!name || !ok()) return;
        next = ctx.currentTime + 0.1; step = 0;
        if (TRACKS[name].noise) startNoise();
        schedule(); timer = setInterval(schedule, 60);
      },
      current: function () { return cur; },
      sfx: function (name, url) {
        if (!SFX[name]) {
          if (url) try { var el = new window.Audio(url); el.volume = vols.sfx; var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
          return;
        }
        if (!ok()) return;
        var t = ctx.currentTime + 0.02;
        switch (name) {
          case 'chime': tone(fx, 1318.5, t, 1.2, { v: 0.25 }); tone(fx, 1760, t + 0.12, 1.4, { v: 0.2 }); break;
          case 'sparkle': [0, 4, 7, 12, 16].forEach(function (s, i) { tone(fx, hz(84 + s), t + i * 0.06, 0.5, { v: 0.12, wave: 'triangle' }); }); break;
          case 'whoosh': noise(fx, t, 0.7, 300, 0.5, 3000); break;
          case 'knock': [0, 0.2, 0.4].forEach(function (d) { tone(fx, 150, t + d, 0.12, { v: 0.6, to: 80 }); noise(fx, t + d, 0.05, 1800, 0.25); }); break;
          case 'bell': [0, 0.9].forEach(function (d) { tone(fx, 880, t + d, 1.6, { v: 0.22 }); tone(fx, 1320, t + d, 1.2, { v: 0.12 }); tone(fx, 2210, t + d, 0.6, { v: 0.05 }); }); break;
          case 'heartbeat': [0, 0.22, 0.9, 1.12].forEach(function (d) { tone(fx, 70, t + d, 0.18, { v: 0.7, to: 45 }); }); break;
          case 'thud': tone(fx, 120, t, 0.4, { v: 0.8, to: 40 }); noise(fx, t, 0.15, 400, 0.3); break;
          case 'pop': tone(fx, 600, t, 0.12, { v: 0.3, to: 1200, wave: 'triangle' }); break;
          case 'phone': for (var i = 0; i < 6; i++) tone(fx, 180, t + i * 0.09, 0.07, { v: 0.25, wave: 'square' }); break;
          case 'door': noise(fx, t, 0.5, 500, 0.4, 200); tone(fx, 90, t + 0.35, 0.3, { v: 0.6, to: 50 }); break;
        }
      },
      beep: function (f, d) { if (!ok()) return; tone(fx, f, ctx.currentTime + 0.01, d || 0.12, { v: 0.16, wave: 'triangle' }); },
      volume: function (v) { if (v) { if (v.music != null) vols.music = v.music; if (v.sfx != null) vols.sfx = v.sfx; apply(); } return vols; },
      unlock: function () { ok(); },
      stop: function () { this.music(''); }
    };
  })();
  RT.audio = Audio;


  /* ================================================================== mini-games (a "game" step). Each game draws into `a` and calls
     g.end(true|false). g gives: diff (0 easy, 1 normal, 2 hard), status(html), beep(freq, secs), after(fn, ms) -> id, cancel(id),
     every(fn, ms), frame(fn) (runs every animation frame while fn returns true), and g.onKey = fn for keyboard play.
     Colours come from the step: --g1 main, --g2 accent, --g3 panel (+ --g1i / --g3i readable ink on them). */
  var VS = String.fromCharCode(0xFE0E);
  var GL = ['★', '♥', '♦', '♣', '♠', '☀', '☾', '✿', '♪', '☂', '✦', '❄', '⚑', '✈', '⌛', '☘'].map(function (c) { return c + VS; });
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var GAME_META = {
    timing: ['Perfect timing', 'Stop the marker inside the glowing zone.'],
    tictactoe: ['Tic-tac-toe', 'Get three in a row before the computer does.'],
    memory: ['Memory pairs', 'Find every pair before time runs out.'],
    reaction: ['Quick draw', 'Tap the moment the light changes. Not before!'],
    find: ['Find it in time', 'Spot the symbol before time runs out.'],
    mash: ['Button mash', 'Tap as fast as you can!'],
    simon: ['Repeat the pattern', 'Watch the lights, then play them back.'],
    whack: ['Whack-a-mole', 'Tap them as they pop up.'],
    code: ['Crack the code', 'Guess the number: we\'ll tell you higher or lower.'],
    rps: ['Rock, paper, scissors', 'First to two wins.']
  };
  RT.GAMES = GAME_META;
  var GAMES = {
    timing: function (a, g) {
      var zw = [0.24, 0.15, 0.09][g.diff], speed = [0.6, 0.95, 1.4][g.diff], need = [1, 2, 3][g.diff], tries = need + 2, hits = 0, used = 0;
      a.innerHTML = '<div class="g-track"><i class="g-zone"></i><i class="g-mark"></i></div><button type="button" class="g-btn">Stop!</button>';
      var zone = a.querySelector('.g-zone'), mark = a.querySelector('.g-mark'), pos = 0, dir = 1, z0 = 0, paused = false, last = performance.now();
      function place() { z0 = 0.06 + Math.random() * (0.88 - zw); zone.style.left = (z0 * 100) + '%'; zone.style.width = (zw * 100) + '%'; }
      function upd() { g.status('Hits <b>' + hits + ' / ' + need + '</b> · tries left ' + (tries - used)); }
      place(); upd();
      g.frame(function (now) {
        var dt = Math.min(50, now - last) / 1000; last = now;
        if (!paused) { pos += dir * speed * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } mark.style.left = (pos * 100) + '%'; }
        return true;
      });
      function stop() {
        if (paused) return;
        paused = true; used++;
        var hit = pos >= z0 - 0.01 && pos <= z0 + zw + 0.01;
        if (hit) hits++;
        a.classList.add(hit ? 'g-hit' : 'g-miss'); g.beep(hit ? 880 : 200, 0.15); upd();
        g.after(function () {
          a.classList.remove('g-hit', 'g-miss');
          if (hits >= need) return g.end(true);
          if (tries - used < need - hits) return g.end(false);
          place(); paused = false; last = performance.now();
        }, 650);
      }
      a.querySelector('.g-btn').onclick = stop;
      g.onKey = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } };
    },
    tictactoe: function (a, g) {
      var smart = [0.25, 0.65, 0.9][g.diff], b, draws = 0, busy = false;
      var L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      function won(p) { return L.some(function (l) { return l.every(function (i) { return b[i] === p; }); }); }
      function find(p) {
        for (var k = 0; k < L.length; k++) {
          var l = L[k], mine = l.filter(function (i) { return b[i] === p; }).length, free = l.filter(function (i) { return !b[i]; });
          if (mine === 2 && free.length === 1) return free[0];
        }
        return -1;
      }
      function ai() {
        var free = [], m = -1;
        b.forEach(function (v, i) { if (!v) free.push(i); });
        if (Math.random() < smart) { m = find('O'); if (m < 0) m = find('X'); if (m < 0 && !b[4]) m = 4; }
        if (m < 0) m = free[rnd(free.length)];
        b[m] = 'O';
      }
      function draw() {
        a.innerHTML = '<div class="g-ttt">' + b.map(function (v, i) {
          return '<button type="button" data-i="' + i + '" class="' + (v ? 'g-' + v : '') + '" aria-label="Square ' + (i + 1) + '">' + (v === 'X' ? '✕' : v === 'O' ? '◯' : '') + '</button>';
        }).join('') + '</div>';
      }
      function reset() { b = ['', '', '', '', '', '', '', '', '']; busy = false; draw(); g.status('You are <b>✕</b>. Three in a row wins!' + (draws ? ' Draws: ' + draws + ' / 3' : '')); }
      function tie() { draws++; busy = true; if (draws >= 3) { g.status('Three draws in a row…'); return g.after(function () { g.end(false); }, 700); } g.status('A draw! Again…'); g.after(reset, 900); }
      a.onclick = function (e) {
        var t = e.target.closest('[data-i]');
        if (!t || busy) return;
        var i = +t.getAttribute('data-i');
        if (b[i]) return;
        b[i] = 'X'; g.beep(660, 0.08); draw();
        if (won('X')) { busy = true; g.status('Three in a row!'); return g.after(function () { g.end(true); }, 500); }
        if (b.every(Boolean)) return tie();
        busy = true;
        g.after(function () {
          ai(); g.beep(440, 0.08); draw(); busy = false;
          if (won('O')) { busy = true; g.status('The computer got three in a row.'); return g.after(function () { g.end(false); }, 700); }
          if (b.every(Boolean)) tie();
        }, 420);
      };
      reset();
    },
    memory: function (a, g) {
      var pairs = [4, 6, 8][g.diff], left = [60, 50, 45][g.diff], sy = shuffle(GL.slice()).slice(0, pairs), cards = shuffle(sy.concat(sy));
      var open = [], found = 0, lock = false;
      a.innerHTML = '<div class="g-mem g-n' + cards.length + '">' + cards.map(function (s, i) { return '<button type="button" data-i="' + i + '"><span>' + s + '</span></button>'; }).join('') + '</div>';
      var btns = a.querySelectorAll('[data-i]');
      function upd() { g.status('Pairs <b>' + found + ' / ' + pairs + '</b> · ' + left + ' s'); }
      upd();
      g.every(function () { left--; upd(); if (left <= 0) g.end(false); }, 1000);
      a.onclick = function (e) {
        var t = e.target.closest('[data-i]');
        if (!t || lock || t.classList.contains('up')) return;
        t.classList.add('up'); open.push(t); g.beep(520 + open.length * 120, 0.06);
        if (open.length < 2) return;
        var x = open[0], y = open[1];
        open = [];
        if (cards[+x.getAttribute('data-i')] === cards[+y.getAttribute('data-i')]) {
          x.classList.add('done'); y.classList.add('done'); found++; upd(); g.beep(990, 0.12);
          if (found === pairs) g.after(function () { g.end(true); }, 400);
        } else {
          lock = true;
          g.after(function () { x.classList.remove('up'); y.classList.remove('up'); lock = false; }, 750);
        }
      };
      void btns;
    },
    reaction: function (a, g) {
      var limit = [650, 480, 360][g.diff], rounds = 3, need = 2, r = 0, wins = 0, state = 'idle', t0 = 0, armT = null, last = '';
      a.innerHTML = '<button type="button" class="g-pad">Tap here to start</button>';
      var pad = a.querySelector('.g-pad');
      function upd() { g.status('Beat <b>' + limit + ' ms</b> · wins ' + wins + ' / ' + need + ' · round ' + Math.min(r + 1, rounds) + ' / ' + rounds + (last ? ' · ' + last : '')); }
      function arm() {
        state = 'wait'; pad.className = 'g-pad g-wait'; pad.textContent = 'Wait for it…';
        armT = g.after(function () { state = 'go'; pad.className = 'g-pad g-go'; pad.textContent = 'TAP!'; t0 = performance.now(); g.beep(990, 0.1); }, 1100 + Math.random() * 2400);
      }
      function next() {
        upd();
        g.after(function () {
          if (wins >= need) return g.end(true);
          if (wins + (rounds - r) < need) return g.end(false);
          arm();
        }, 1100);
      }
      function hit() {
        if (state === 'idle') { arm(); return; }
        if (state === 'wait') { g.cancel(armT); state = 'done'; r++; last = 'too soon'; pad.className = 'g-pad g-bad'; pad.textContent = 'Too soon!'; g.beep(180, 0.2); next(); return; }
        if (state === 'go') {
          var ms = Math.round(performance.now() - t0), good = ms <= limit;
          state = 'done'; r++; if (good) wins++; last = ms + ' ms';
          pad.className = 'g-pad ' + (good ? 'g-good' : 'g-bad'); pad.textContent = ms + ' ms ' + (good ? '✓' : '✗');
          next();
        }
      }
      pad.onpointerdown = function (e) { e.preventDefault(); hit(); };
      g.onKey = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hit(); } };
      upd();
    },
    find: function (a, g) {
      var n = [12, 20, 30][g.diff], cols = [4, 5, 6][g.diff], left = [25, 20, 15][g.diff], rounds = 3, got = 0;
      function upd() { g.status('Found <b>' + got + ' / ' + rounds + '</b> · ' + left + ' s'); }
      function round() {
        var pool = shuffle(GL.slice()), target = pool[0], others = pool.slice(1, 5 + g.diff * 2), cells = [target];
        while (cells.length < n) cells.push(others[rnd(others.length)]);
        cells = shuffle(cells);
        a.innerHTML = '<div class="g-find-t">Find <b>' + target + '</b></div><div class="g-grid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + cells.map(function (c) {
          return '<button type="button"' + (c === target ? ' data-t="1"' : '') + ' style="transform:rotate(' + (rnd(40) - 20) + 'deg)" class="gc' + rnd(3) + '">' + c + '</button>';
        }).join('') + '</div>';
      }
      a.onclick = function (e) {
        var t = e.target.closest('button');
        if (!t) return;
        if (t.hasAttribute('data-t')) { got++; g.beep(880, 0.1); upd(); if (got >= rounds) return g.end(true); round(); }
        else { left = Math.max(0, left - 2); g.beep(180, 0.12); a.classList.remove('g-miss'); void a.offsetWidth; a.classList.add('g-miss'); upd(); }
      };
      round(); upd();
      g.every(function () { left--; upd(); if (left <= 0) g.end(false); }, 1000);
    },
    mash: function (a, g) {
      var need = [18, 28, 38][g.diff], tenths = 50, taps = 0, started = false, over = false;
      a.innerHTML = '<div class="g-meter"><i></i></div><button type="button" class="g-btn g-big">Tap!</button>';
      var bar = a.querySelector('.g-meter i');
      function upd() { g.status('<b>' + taps + ' / ' + need + '</b> taps · ' + (tenths / 10).toFixed(1) + ' s' + (started ? '' : ' (the clock starts on your first tap)')); bar.style.width = Math.min(100, taps / need * 100) + '%'; }
      function tap() {
        if (over) return;
        if (!started) { started = true; g.every(function () { tenths--; upd(); if (tenths <= 0 && !over) { over = true; g.end(taps >= need); } }, 100); }
        taps++; g.beep(300 + taps * 12, 0.04); upd();
        if (taps >= need) { over = true; g.after(function () { g.end(true); }, 250); }
      }
      a.querySelector('.g-btn').onpointerdown = function (e) { e.preventDefault(); tap(); };
      g.onKey = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) tap(); } };
      upd();
    },
    simon: function (a, g) {
      var target = [3, 5, 7][g.diff], seq = [], pos = 0, input = false, notes = [523, 659, 784, 988];
      a.innerHTML = '<div class="g-simon">' + [0, 1, 2, 3].map(function (k) { return '<button type="button" class="p' + k + '" data-k="' + k + '" aria-label="Pad ' + (k + 1) + '"></button>'; }).join('') + '</div>';
      var pads = a.querySelectorAll('[data-k]');
      function flash(k) { pads[k].classList.add('lit'); g.beep(notes[k], 0.25); g.after(function () { pads[k].classList.remove('lit'); }, 330); }
      function play() {
        input = false; seq.push(rnd(4));
        g.status('Watch… <b>' + seq.length + ' / ' + target + '</b>');
        var i = 0, gap = [700, 580, 460][g.diff];
        (function step() {
          if (i >= seq.length) { input = true; pos = 0; g.status('Your turn! <b>' + seq.length + ' / ' + target + '</b>'); return; }
          flash(seq[i]); i++; g.after(step, gap);
        })();
      }
      a.onclick = function (e) {
        var t = e.target.closest('[data-k]');
        if (!t || !input) return;
        var k = +t.getAttribute('data-k');
        flash(k);
        if (k !== seq[pos]) { input = false; g.status('Oops, that wasn\'t it.'); return g.after(function () { g.end(false); }, 600); }
        pos++;
        if (pos === seq.length) { input = false; if (seq.length >= target) return g.after(function () { g.end(true); }, 500); g.after(play, 700); }
      };
      g.after(play, 500);
    },
    whack: function (a, g) {
      var need = [8, 11, 14][g.diff], up = [1100, 850, 650][g.diff], left = 20, hits = 0, cur = -1, popT = null;
      a.innerHTML = '<div class="g-holes">' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return '<button type="button" data-i="' + i + '" aria-label="Hole ' + (i + 1) + '"><i></i></button>'; }).join('') + '</div>';
      var holes = a.querySelectorAll('[data-i]');
      function upd() { g.status('Hits <b>' + hits + ' / ' + need + '</b> · ' + left + ' s'); }
      function pop() {
        if (cur >= 0) holes[cur].classList.remove('up');
        var n; do { n = rnd(9); } while (n === cur);
        cur = n; holes[n].classList.add('up');
        popT = g.after(pop, up);
      }
      a.onpointerdown = function (e) {
        var t = e.target.closest('[data-i]');
        if (!t || +t.getAttribute('data-i') !== cur) return;
        e.preventDefault();
        hits++; g.beep(760, 0.08); upd();
        t.classList.remove('up'); t.classList.add('bonk'); g.after(function () { t.classList.remove('bonk'); }, 250);
        cur = -1; g.cancel(popT);
        if (hits >= need) return g.end(true);
        popT = g.after(pop, 260);
      };
      upd(); g.after(pop, 500);
      g.every(function () { left--; upd(); if (left <= 0) g.end(false); }, 1000);
    },
    code: function (a, g) {
      var max = [20, 50, 100][g.diff], tries = [5, 6, 7][g.diff], secret = 1 + rnd(max), used = 0, hist = [];
      a.innerHTML = '<div class="g-code"><div class="g-code-d">?</div><form><input type="number" min="1" max="' + max + '" inputmode="numeric" aria-label="Your guess" placeholder="1 – ' + max + '"><button type="submit" class="g-btn">Guess</button></form><div class="g-hist"></div></div>';
      var inp = a.querySelector('input'), disp = a.querySelector('.g-code-d');
      function upd() { g.status('A number from 1 to ' + max + ' · tries left <b>' + (tries - used) + '</b>'); }
      a.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        var v = parseInt(inp.value, 10);
        if (!(v >= 1 && v <= max)) { inp.focus(); return; }
        used++; inp.value = '';
        if (v === secret) { disp.textContent = v; disp.classList.add('ok'); g.beep(990, 0.2); return g.after(function () { g.end(true); }, 600); }
        hist.unshift(v + (v < secret ? ' · higher ↑' : ' · lower ↓'));
        a.querySelector('.g-hist').innerHTML = hist.map(function (h) { return '<span>' + h + '</span>'; }).join('');
        g.beep(v < secret ? 400 : 300, 0.1); upd();
        if (used >= tries) { disp.textContent = secret; disp.classList.add('bad'); return g.after(function () { g.end(false); }, 900); }
        inp.focus();
      };
      upd();
      g.after(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 80);
    },
    rps: function (a, g) {
      var you = 0, them = 0, last = null, busy = false, M = [['Rock', '✊'], ['Paper', '✋'], ['Scissors', '✌️']];
      a.innerHTML = '<div class="g-vs"><span data-you>❔</span><b>vs</b><span data-ai>❔</span></div><div class="g-rps">' + M.map(function (m, k) {
        return '<button type="button" data-k="' + k + '"><span>' + m[1] + '</span>' + m[0] + '</button>';
      }).join('') + '</div>';
      function upd(msg) { g.status((msg ? msg + ' · ' : '') + 'You <b>' + you + '</b> – <b>' + them + '</b> Them · first to 2'); }
      a.onclick = function (e) {
        var t = e.target.closest('[data-k]');
        if (!t || busy) return;
        var k = +t.getAttribute('data-k'), ai = rnd(3);
        if (g.diff === 0 && Math.random() < 0.25) ai = (k + 2) % 3;
        if (g.diff === 2 && last != null && Math.random() < 0.45) ai = (last + 1) % 3;
        last = k;
        a.querySelector('[data-you]').textContent = M[k][1]; a.querySelector('[data-ai]').textContent = M[ai][1];
        var res = (k - ai + 3) % 3;
        if (res === 1) { you++; g.beep(880, 0.1); upd('You win the round'); }
        else if (res === 2) { them++; g.beep(220, 0.12); upd('They win the round'); }
        else { g.beep(500, 0.08); upd('A tie'); }
        if (you >= 2 || them >= 2) { busy = true; g.after(function () { g.end(you >= 2); }, 800); }
      };
      upd();
    }
  };

  /* the frame around every mini-game: title, instructions, status, skip, and the result card */
  function gameShell(box, cfg, accent, done) {
    var meta = GAME_META[cfg.game] || GAME_META.timing, play = GAMES[cfg.game] || GAMES.timing;
    var c1 = cfg.c1 || accent || '#ff4f8b', c2 = cfg.c2 || '#3cc6c0', c3 = cfg.c3 || '#ffffff';
    box.style.setProperty('--g1', c1); box.style.setProperty('--g2', c2); box.style.setProperty('--g3', c3);
    box.style.setProperty('--g1i', inkFor(c1)); box.style.setProperty('--g2i', inkFor(c2)); box.style.setProperty('--g3i', inkFor(c3));
    var timers = [], loops = [], over = false, api = null;
    function clear() { timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); loops.forEach(function (l) { l.on = false; }); timers = []; loops = []; }
    function start() {
      clear(); over = false;
      box.innerHTML = '<div class="nvp-g-card"><div class="nvp-g-head"><small>Mini-game</small><h3>' + esc(cfg.title || meta[0]) + '</h3><p>' + esc(cfg.prompt || meta[1]) + '</p></div>' +
        '<div class="nvp-g-area"></div><div class="nvp-g-status"></div>' + (cfg.skip !== false ? '<button type="button" class="nvp-g-skip" data-gskip>Skip this game</button>' : '') + '</div>';
      var area = box.querySelector('.nvp-g-area'), status = box.querySelector('.nvp-g-status');
      api = {
        diff: Math.max(0, Math.min(2, +cfg.diff || 0)),
        status: function (h) { status.innerHTML = h; },
        beep: function (f, d) { Audio.beep(f, d); },
        after: function (fn, ms) { var t = setTimeout(function () { if (!over) fn(); }, ms); timers.push(t); return t; },
        cancel: function (t) { clearTimeout(t); },
        every: function (fn, ms) { var t = setInterval(function () { if (!over) fn(); }, ms); timers.push(t); return t; },
        frame: function (fn) { var l = { on: true }; loops.push(l); (function tick(now) { if (!l.on || over) return; if (fn(now) !== false) requestAnimationFrame(tick); })(performance.now()); },
        end: function (win) { if (over) return; over = true; clear(); result(!!win); },
        onKey: null
      };
      var skip = box.querySelector('[data-gskip]');
      if (skip) skip.onclick = function () { over = true; clear(); done(false); };
      try { play(area, api); } catch (e) { console.error(e); api.end(true); }
    }
    function result(win) {
      Audio.sfx(win ? 'sparkle' : 'thud');
      var card = box.querySelector('.nvp-g-card');
      card.innerHTML = '<div class="nvp-g-res ' + (win ? 'win' : 'lose') + '"><div class="nvp-g-big">' + (win ? 'You did it!' : 'Not this time…') + '</div>' +
        '<p>' + esc(cfg.title || meta[0]) + '</p><div class="nvp-g-btns">' +
        (!win && cfg.retry ? '<button type="button" class="pri" data-gretry>Try again</button>' : '') +
        '<button type="button" class="' + (!win && cfg.retry ? '' : 'pri') + '" data-gdone>' + (!win && cfg.retry ? 'Carry on anyway' : 'Continue') + '</button></div></div>';
      card.querySelector('[data-gdone]').onclick = function () { done(win); };
      var r = card.querySelector('[data-gretry]');
      if (r) r.onclick = start;
      setTimeout(function () { var b = card.querySelector('.pri'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }
    start();
    return {
      key: function (e) { if (!over && api && api.onKey) api.onKey(e); },
      destroy: function () { over = true; clear(); box.innerHTML = ''; }
    };
  }
  /* the editor's "Try it" preview: a game on its own, outside a story */
  RT.playGame = function (host, cfg, accent, onDone) {
    host.innerHTML = '<div class="nvp nvp-portrait nvp-solo" style="--u:' + Math.max(0.8, Math.min(1.2, (host.clientWidth || 360) / 380)).toFixed(3) + 'px"><div class="nvp-game solo"></div></div>';
    var box = host.querySelector('.nvp-game');
    var run = gameShell(box, cfg, accent, function (win) { if (onDone) onDone(win); });
    var key = function (e) { if (e.target.tagName !== 'INPUT') run.key(e); };
    document.addEventListener('keydown', key);
    return { destroy: function () { document.removeEventListener('keydown', key); run.destroy(); } };
  };

  /* ================================================================== the player */
  var POS = { farleft: 12, left: 26, center: 50, right: 74, farright: 88 };
  var KIND = { 'true': 'True ending', good: 'Good ending', neutral: 'Ending', bad: 'Bad ending', secret: 'Secret ending' };
  RT.ENDING_KINDS = KIND;
  RT.POSITIONS = POS;

  function inkFor(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    var L = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return (0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b)) > 0.4 ? '#221a2e' : '#ffffff';
  }
  RT.inkFor = inkFor;

  RT.mount = function (host, story, opts) {
    opts = opts || {};
    story = story || {};
    var S = story.settings || {}, scenes = {}, chars = {}, varsDef = story.vars || [];
    (story.scenes || []).forEach(function (s) { scenes[s.id] = s; });
    (story.chars || []).forEach(function (c) { chars[c.id] = c; });
    var portrait = S.orientation !== 'landscape';
    var key = 'nvp:' + (opts.storageKey || 'story');
    var P = store(key) || {};
    P.endings = P.endings || {}; P.cgs = P.cgs || {}; P.lines = P.lines || {}; P.scenes = P.scenes || {}; P.chose = P.chose || {};
    P.prefs = P.prefs || { speed: 'normal', auto: 1, music: 0.6, sfx: 0.8, size: 'm', skipAll: false };
    var saves = store(key + ':saves') || { slots: [] };
    function persist() { store(key, P); }
    function persistSaves() { store(key + ':saves', saves); }
    Audio.volume({ music: P.prefs.music, sfx: P.prefs.sfx });
    var resolve = opts.resolve || function (k) { return k; };
    var gameRun = null;
    function aud(k) { return k && !TRACKS[k] && !SFX[k] ? resolve(k) : ''; }
    var st = null, back = [], gen = 0, typing = null, mode = { auto: false, skip: false, ctrl: false }, autoT = null, waitT = null, timerT = null, destroyed = false;

    /* ---------------- DOM */
    var root = document.createElement('div');
    root.className = 'nvp nvp-tb-' + (S.textbox || 'sakura') + ' nvp-font-' + (S.font || 'rounded') + (portrait ? ' nvp-portrait' : ' nvp-landscape') + ' nvp-size-' + (P.prefs.size || 'm');
    root.style.setProperty('--acc', S.accent || '#ff4f8b');
    root.style.setProperty('--acc-ink', inkFor(S.accent || '#ff4f8b'));
    root.tabIndex = 0;
    root.innerHTML = '<div class="nvp-stage" data-stage>' +
      '<div class="nvp-bg"><img alt="" data-bga><img alt="" data-bgb></div>' +
      '<div class="nvp-chars" data-chars></div>' +
      '<div class="nvp-cg" data-cg><img alt=""></div>' +
      '<div class="nvp-box" data-box hidden><div class="nvp-name" data-name></div><div class="nvp-text" data-text></div><div class="nvp-ctc" data-ctc></div></div>' +
      '<div class="nvp-choices" data-choices hidden></div>' +
      '<div class="nvp-timer" data-timer hidden><i></i></div>' +
      '<div class="nvp-game" data-game hidden></div>' +
      '<div class="nvp-veil" data-veil></div>' +
      '<div class="nvp-card" data-card hidden></div>' +
      '<div class="nvp-qm" data-qm hidden>' +
        '<button type="button" data-q="back" title="Back (Backspace)">Back</button><button type="button" data-q="log" title="History (H)">Log</button>' +
        '<button type="button" data-q="auto" title="Auto (A)">Auto</button><button type="button" data-q="skip" title="Skip (S, or hold Ctrl)">Skip</button>' +
        '<button type="button" data-q="save">Save</button><button type="button" data-q="load">Load</button><button type="button" data-q="menu" title="Menu (Esc)">Menu</button></div>' +
      '<div class="nvp-screen" data-screen hidden></div>' +
      '<div class="nvp-toast" data-toast></div>' +
      '</div>';
    host.innerHTML = '';
    host.appendChild(root);
    var $ = function (s) { return root.querySelector(s); };
    var stage = $('[data-stage]'), box = $('[data-box]'), screen = $('[data-screen]'), choicesEl = $('[data-choices]');
    var bgA = $('[data-bga]'), bgB = $('[data-bgb]'), bgFront = bgA;

    function fit() {
      var w = host.clientWidth || 400, h = host.clientHeight || 600, r = portrait ? 2 / 3 : 3 / 2, W, H;
      if (w / h > r) { H = h; W = h * r; } else { W = w; H = w / r; }
      stage.style.width = Math.floor(W) + 'px'; stage.style.height = Math.floor(H) + 'px';
      root.style.setProperty('--u', ((portrait ? W : H) / 400).toFixed(3) + 'px');
    }
    var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', fit);
    fit();

    function toast(msg) {
      var t = $('[data-toast]');
      t.textContent = msg; t.classList.add('on');
      clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, 1600);
    }

    /* ---------------- state */
    function initVars() {
      var v = {};
      varsDef.forEach(function (d) { v[d.name] = d.type === 'flag' ? !!d.init : d.type === 'text' ? String(d.init == null ? '' : d.init) : (Number(d.init) || 0); });
      return v;
    }
    function fresh(sceneId, vars) {
      return { scene: sceneId || story.start, i: 0, vars: vars || initVars(), bg: '', chars: {}, order: [], cg: '', music: '', seen: {}, chosen: {}, log: [], speaker: null };
    }
    var fns = {
      seen: function (id) { return !!(st && (st.seen[id] || Object.keys(st.seen).some(function (k) { return scenes[k] && scenes[k].name === id; }))); },
      ended: function (id) { return !!(P.endings[id] || Object.keys(P.endings).some(function (k) { return scenes[k] && scenes[k].ending && scenes[k].ending.title === id; })); },
      chose: function (id) { return !!(st && st.chosen[id]); }
    };
    function test(c) { return RT.test(c, st.vars, fns); }
    function txt(s) { return interpolate(s, st.vars, fns); }
    function charName(c) { return c ? txt(c.name) : ''; }
    function poseImg(c, pose) {
      if (!c) return '';
      var p = (c.poses || []).filter(function (x) { return x.name === pose; })[0] || (c.poses || [])[0];
      return p && p.img ? resolve(p.img) : '';
    }

    /* ---------------- painting (instant, from state) */
    function setSrc(im, url) { if (url) { if (im.getAttribute('src') !== url) im.src = url; } else im.removeAttribute('src'); }
    function setBg(img, fx) {
      var url = img ? resolve(img) : '';
      if (fx === 'none' || mode.skip || !url) {
        setSrc(bgFront, url); bgFront.style.opacity = url ? 1 : 0;
        (bgFront === bgA ? bgB : bgA).style.opacity = 0;
        return;
      }
      var back_ = bgFront === bgA ? bgB : bgA;
      back_.style.transition = 'none'; back_.style.opacity = 0; setSrc(back_, url);
      void back_.offsetWidth;
      back_.style.transition = 'opacity ' + (fx === 'fade' ? '.9s' : '.6s');
      back_.style.zIndex = 2; bgFront.style.zIndex = 1;
      back_.style.opacity = 1;
      bgFront = back_;
    }
    function charEl(id) { return root.querySelector('[data-char="' + id + '"]'); }
    function placeChar(id, fx, leaving) {
      var info = st.chars[id], el = charEl(id), c = chars[id];
      if (leaving) {
        if (!el) return;
        el.removeAttribute('data-char');
        if (fx === 'none' || mode.skip) { el.remove(); return; }
        el.classList.add('out-' + (fx || 'dissolve'));
        setTimeout(function () { el.remove(); }, 420);
        return;
      }
      if (!info) return;
      var src = poseImg(c, info.pose);
      if (!el) {
        el = document.createElement('div'); el.className = 'nvp-ch'; el.setAttribute('data-char', id);
        el.innerHTML = '<img alt="">';
        $('[data-chars]').appendChild(el);
        if (fx && fx !== 'none' && !mode.skip) { el.classList.add('in-' + fx); setTimeout(function () { el.classList.remove('in-' + fx); }, 450); }
      }
      el.style.left = (POS[info.pos] || 50) + '%';
      var img = el.querySelector('img');
      if (img.getAttribute('src') !== src) { if (src) img.src = src; else img.removeAttribute('src'); }
      el.classList.toggle('noimg', !src);
      if (!src) el.setAttribute('data-label', charName(c)); else el.removeAttribute('data-label');
    }
    function focusSpeaker() {
      Array.prototype.forEach.call(root.querySelectorAll('.nvp-ch'), function (el) {
        var id = el.getAttribute('data-char');
        el.classList.toggle('dim', !!st.speaker && id !== st.speaker && !!chars[st.speaker] && !!st.chars[st.speaker]);
        el.classList.toggle('talk', !!st.speaker && id === st.speaker);
      });
    }
    function setCg(img) {
      var cg = $('[data-cg]');
      if (img) { setSrc(cg.querySelector('img'), resolve(img)); cg.classList.add('on'); P.cgs[img] = 1; persist(); }
      else cg.classList.remove('on');
    }
    function paint() {
      $('[data-chars]').innerHTML = '';
      bgA.style.transition = bgB.style.transition = 'none';
      setSrc(bgA, st.bg ? resolve(st.bg) : ''); bgA.style.opacity = st.bg ? 1 : 0; bgB.style.opacity = 0; bgFront = bgA;
      Object.keys(st.chars).forEach(function (id) { placeChar(id, 'none'); });
      setCg(st.cg);
      Audio.music(st.music, aud(st.music));
      focusSpeaker();
    }

    /* ---------------- running the story */
    function scene() { return scenes[st.scene]; }
    function clearTimers() {
      gen++;
      [autoT, waitT, timerT].forEach(function (t) { if (t) clearTimeout(t); });
      autoT = waitT = timerT = null;
      if (typing) { cancelAnimationFrame(typing.raf); typing = null; }
      $('[data-timer]').hidden = true;
      if (gameRun) { gameRun.destroy(); gameRun = null; $('[data-game]').hidden = true; }
    }
    function snapshot() { back.push(JSON.stringify(st)); if (back.length > 120) back.shift(); }
    function goScene(id) {
      if (!scenes[id]) { finish(null); return; }
      st.scene = id; st.i = 0; st.seen[id] = 1;
      if (!P.scenes[id]) { P.scenes[id] = clone(st.vars); persist(); }
      saves.auto = { st: clone(st), when: Date.now(), label: scenes[id].name };
      persistSaves();
      preload(scenes[id]);
      if (opts.onScene) try { opts.onScene(id); } catch (e) {}
      run();
    }
    function preload(sc) {
      (sc.steps || []).forEach(function (x) {
        var src = x.img ? resolve(x.img) : x.t === 'show' ? poseImg(chars[x.char], x.pose) : '';
        if (src) { var im = new Image(); im.src = src; }
      });
    }
    function run() {
      var my = gen;
      for (var guard = 0; guard < 2000; guard++) {
        if (my !== gen || destroyed) return;
        var sc = scene();
        if (!sc) { finish(null); return; }
        if (st.i >= (sc.steps || []).length) { endOfScene(); return; }
        var x = sc.steps[st.i];
        st.i++;
        if (x.if && !test(x.if)) continue;
        if (exec(x, my)) return;
      }
    }
    function later(ms, my) {
      waitT = setTimeout(function () { if (my === gen) run(); }, mode.skip ? Math.min(ms, 40) : ms);
    }
    function exec(x, my) {
      switch (x.t) {
        case 'say': return say(x);
        case 'bg': st.bg = x.img || ''; setBg(st.bg, x.fx || 'dissolve'); return false;
        case 'show':
          if (!chars[x.char]) return false;
          var had = st.chars[x.char];
          st.chars[x.char] = { pose: x.pose || (had && had.pose) || ((chars[x.char].poses || [])[0] || {}).name || '', pos: x.pos || (had && had.pos) || 'center' };
          placeChar(x.char, had ? 'none' : (x.fx || 'dissolve'));
          focusSpeaker();
          return false;
        case 'hide': if (st.chars[x.char]) { delete st.chars[x.char]; placeChar(x.char, x.fx || 'dissolve', true); } return false;
        case 'set': applySet(x); return false;
        case 'jump': if (scenes[x.to]) { goScene(x.to); return true; } return false;
        case 'cg': st.cg = x.img || ''; setCg(st.cg); return false;
        case 'music': st.music = x.track || ''; Audio.music(st.music, aud(st.music)); return false;
        case 'sfx': if (!mode.skip) Audio.sfx(x.name, aud(x.name)); return false;
        case 'game': return game(x);
        case 'fx':
          if (mode.skip) return false;
          if (x.name === 'shake') { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); return false; }
          var veil = $('[data-veil]');
          veil.className = 'nvp-veil ' + (x.name === 'flash' ? 'flash' : 'fade');
          setTimeout(function () { veil.className = 'nvp-veil'; }, x.name === 'flash' ? 500 : 1400);
          if (x.name === 'fade') { later(700, my); return true; }
          return false;
        case 'wait': later((Number(x.secs) || 1) * 1000, my); return true;
        case 'card': return card(x, my);
        case 'input': return input(x);
      }
      return false;
    }
    function applySet(x) {
      var d = varsDef.filter(function (v) { return v.name === x.var; })[0], cur = st.vars[x.var], val = x.val;
      if (!x.var) return;
      if (x.op === '+') st.vars[x.var] = n(cur) + n(val);
      else if (x.op === '-') st.vars[x.var] = n(cur) - n(val);
      else if (x.op === 'toggle') st.vars[x.var] = !cur;
      else st.vars[x.var] = d && d.type === 'number' ? n(val) : d && d.type === 'flag' ? (val === true || val === 'true' || val === 1) : val;
    }

    function say(x) {
      st.i--; snapshot(); st.i++;  // a snapshot that replays this very line
      var c = chars[x.who];
      st.speaker = x.who && c ? x.who : null;
      if (c && x.pose && st.chars[x.who]) { st.chars[x.who].pose = x.pose; placeChar(x.who, 'none'); }
      focusSpeaker();
      var text = txt(x.text), m = markup(text), name = c ? charName(c) : '';
      st.log.push({ who: name, color: c ? c.color : '', text: RT.plain(x.text, st.vars) });
      if (st.log.length > 80) st.log.shift();
      box.hidden = false; $('[data-qm]').hidden = false;
      var nm = $('[data-name]');
      nm.textContent = name; nm.hidden = !name;
      nm.style.setProperty('--who', c ? c.color : 'var(--acc)'); nm.style.setProperty('--who-ink', inkFor(c ? c.color : '#ff4f8b'));
      box.classList.toggle('narration', !c);
      var el = $('[data-text]');
      el.innerHTML = m.html;
      var spans = el.querySelectorAll('.nvp-c'), lineKey = st.scene + ':' + (x.k || st.i);
      var seenBefore = !!P.lines[lineKey];
      P.lines[lineKey] = 1; persist();
      $('[data-ctc]').classList.remove('on');
      var speed = { slow: 22, normal: S.cps || 45, fast: 110, instant: 0 }[P.prefs.speed] || (S.cps || 45);
      if (mode.skip && !seenBefore && !P.prefs.skipAll && !mode.ctrl) setMode('skip', false);
      var instant = !speed || mode.skip;
      var shown = 0, start = performance.now(), hold = 0, my = gen;
      function reveal(k) { for (; shown < k && shown < spans.length; shown++) spans[shown].classList.add('on'); }
      function done() {
        reveal(spans.length); typing = null;
        $('[data-ctc]').classList.add('on');
        if (mode.skip) { autoT = setTimeout(function () { if (my === gen) advance(); }, 45); }
        else if (mode.auto) { autoT = setTimeout(function () { if (my === gen) advance(); }, (900 + m.count * 38) / (P.prefs.auto || 1)); }
      }
      if (instant) { done(); return true; }
      typing = { done: done, raf: 0 };
      var elapsedPaused = 0;
      (function tick(now) {
        if (my !== gen || !typing) return;
        if (hold > now) { typing.raf = requestAnimationFrame(tick); return; }
        var target = Math.floor(((now - start - elapsedPaused) / 1000) * speed);
        while (shown < target && shown < spans.length) {
          if (m.pauses[shown] && !typing['p' + shown]) { typing['p' + shown] = 1; hold = now + m.pauses[shown] * 1000; elapsedPaused += m.pauses[shown] * 1000; break; }
          spans[shown].classList.add('on'); shown++;
        }
        if (shown >= spans.length) { done(); return; }
        typing.raf = requestAnimationFrame(tick);
      })(start);
      return true;
    }
    function game(x) {
      st.i--; snapshot(); st.i++;  // Back from the next line returns to just before the game
      setMode('skip', false); setMode('auto', false);
      box.hidden = true; $('[data-qm]').hidden = true;
      var el = $('[data-game]');
      el.hidden = false;
      gameRun = gameShell(el, x, S.accent, function (win) {
        if (gameRun) gameRun.destroy();
        gameRun = null; el.hidden = true;
        if (x.var) st.vars[x.var] = !!win;
        st.log.push({ who: '', choice: true, text: (x.title || (GAME_META[x.game] || GAME_META.timing)[0]) + (win ? ': won' : ': lost') });
        var to = win ? x.win : x.lose;
        if (to && scenes[to]) goScene(to); else run();
      });
      return true;
    }
    function card(x, my) {
      var el = $('[data-card]');
      el.innerHTML = '<div><h2>' + esc(txt(x.title || '')) + '</h2>' + (x.sub ? '<p>' + esc(txt(x.sub)) + '</p>' : '') + '</div>';
      el.hidden = false; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      box.hidden = true;
      var close = function () { el.classList.remove('on'); setTimeout(function () { if (!el.classList.contains('on')) el.hidden = true; }, 500); };
      typing = { done: function () { typing = null; clearTimeout(waitT); close(); run(); }, raf: 0, card: true };
      waitT = setTimeout(function () { if (my === gen) { typing = null; close(); run(); } }, mode.skip ? 60 : 2400);
      return true;
    }
    function input(x) {
      box.hidden = true;
      var el = $('[data-choices]');
      el.hidden = false; el.className = 'nvp-choices nvp-input';
      var cur = st.vars[x.var];
      el.innerHTML = '<form class="nvp-in"><label>' + esc(txt(x.prompt || 'Your answer')) + '</label><input type="text" maxlength="40" value="' + esc(cur || x.dflt || '') + '"><button type="submit">OK</button></form>';
      var inp = el.querySelector('input');
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 50);
      el.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        st.vars[x.var] = (inp.value || '').trim().slice(0, 40) || x.dflt || '';
        el.hidden = true; el.innerHTML = ''; el.className = 'nvp-choices';
        run();
      };
      return true;
    }
    function visibleChoices(sc) {
      return (sc.choices || []).filter(function (c) {
        if (c.once && st.chosen[c.id]) return false;
        return !c.if || test(c.if) || c.mode === 'lock';
      }).map(function (c) { return { c: c, locked: !!(c.if && !test(c.if)) }; });
    }
    function endOfScene() {
      var sc = scene();
      if (sc.ending) { finish(sc); return; }
      var list = visibleChoices(sc);
      if (list.length) { showChoices(sc, list); return; }
      if (sc.next && scenes[sc.next]) { goScene(sc.next); return; }
      finish(null);
    }
    function showChoices(sc, list) {
      snapshot();
      setMode('skip', false); setMode('auto', false);
      $('[data-qm]').hidden = false;
      choicesEl.className = 'nvp-choices'; choicesEl.hidden = false;
      choicesEl.innerHTML = list.map(function (o, i) {
        var t = esc(RT.plain(o.c.text, st.vars));
        return '<button type="button" data-ch="' + esc(o.c.id) + '"' + (o.locked ? ' disabled class="locked"' : '') + '>' +
          '<b>' + (i + 1) + '</b><span>' + t + (o.locked && o.c.hint ? '<small>' + esc(o.c.hint) + '</small>' : '') + '</span>' + (P.chose[o.c.id] ? '<em title="Chosen before">✓</em>' : '') + '</button>';
      }).join('');
      if (sc.timer > 0) {
        var bar = $('[data-timer]'), my = gen;
        bar.hidden = false; bar.firstChild.style.transition = 'none'; bar.firstChild.style.width = '100%';
        void bar.offsetWidth;
        bar.firstChild.style.transition = 'width ' + sc.timer + 's linear'; bar.firstChild.style.width = '0%';
        timerT = setTimeout(function () {
          if (my !== gen) return;
          var pick = list.filter(function (o) { return !o.locked && o.c.id === sc.timeout; })[0] || list.filter(function (o) { return !o.locked; })[0];
          if (pick) choose(pick.c.id);
        }, sc.timer * 1000);
      }
    }
    function choose(id) {
      var sc = scene(), c = (sc.choices || []).filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      clearTimers();
      choicesEl.hidden = true; choicesEl.innerHTML = '';
      (c.set || []).forEach(applySet);
      st.chosen[c.id] = 1; P.chose[c.id] = 1; persist();
      st.log.push({ who: '', choice: true, text: RT.plain(c.text, st.vars) });
      Audio.sfx('pop');
      if (c.to && scenes[c.to]) goScene(c.to); else finish(null);
    }
    function finish(sc) {
      clearTimers();
      box.hidden = true; choicesEl.hidden = true; $('[data-qm]').hidden = true;
      setMode('skip', false); setMode('auto', false);
      var e = sc && sc.ending ? sc.ending : { kind: 'neutral', title: 'The End', text: '' };
      var isNew = sc && !P.endings[sc.id];
      if (sc) { P.endings[sc.id] = Date.now(); persist(); if (opts.onEnding) try { opts.onEnding(sc.id); } catch (er) {} }
      saves.auto = null; persistSaves();
      var all = allEndings(), found = all.filter(function (x) { return P.endings[x.id]; }).length;
      Audio.sfx('chime');
      show('<div class="nvp-end k-' + esc(e.kind) + '"><div class="nvp-end-badge">' + esc(KIND[e.kind] || 'Ending') + (isNew ? ' · new!' : '') + '</div>' +
        '<h2>' + esc(txt(e.title)) + '</h2>' + (e.text ? '<p>' + esc(txt(e.text)) + '</p>' : '') +
        (all.length ? '<div class="nvp-end-count">' + found + ' of ' + all.length + ' endings found</div><div class="nvp-dots">' + all.map(function (x) {
          return '<i class="' + (P.endings[x.id] ? 'on k-' + esc(x.ending.kind) : '') + '"></i>';
        }).join('') + '</div>' : '') +
        '<div class="nvp-btns">' + (back.length ? '<button type="button" data-act="lastchoice">Back to the last choice</button>' : '') +
        '<button type="button" data-act="flow">Story map</button><button type="button" class="pri" data-act="title">Title screen</button></div></div>', 'end');
      if (isNew) confetti();
    }
    function allEndings() { return (story.scenes || []).filter(function (s) { return s.ending; }); }
    function confetti() {
      var cv = document.createElement('div'); cv.className = 'nvp-petals';
      for (var i = 0; i < 26; i++) {
        var p = document.createElement('i');
        p.style.left = Math.random() * 100 + '%'; p.style.animationDelay = (Math.random() * 1.2) + 's'; p.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
        cv.appendChild(p);
      }
      stage.appendChild(cv);
      setTimeout(function () { cv.remove(); }, 4500);
    }

    /* ---------------- input: advance, back, modes */
    function advance() {
      if (!st || !screen.hidden || !choicesEl.hidden || gameRun) return;
      if (typing) { var d = typing.done; d(); return; }
      if (autoT) { clearTimeout(autoT); autoT = null; }
      run();
    }
    function rollback() {
      if (back.length < 2 || !screen.hidden && !screen.classList.contains('scr-end')) return toast('Nothing to go back to');
      clearTimers(); hideScreen();
      back.pop();
      st = JSON.parse(back.pop());
      choicesEl.hidden = true; choicesEl.innerHTML = ''; $('[data-card]').hidden = true;
      paint();
      run();
    }
    function backToChoice() {
      // rewind to the most recent choice screen
      while (back.length) {
        var s = JSON.parse(back.pop()), sc = scenes[s.scene];
        if (sc && s.i >= (sc.steps || []).length && !sc.ending) { clearTimers(); hideScreen(); st = s; paint(); box.hidden = true; endOfScene(); return; }
      }
      toast('No choice to go back to');
    }
    function setMode(m, on) {
      mode[m] = on == null ? !mode[m] : !!on;
      var b = root.querySelector('[data-q="' + m + '"]');
      if (b) b.classList.toggle('on', mode[m]);
      root.classList.toggle('nvp-skipping', mode.skip);
      if (mode[m] && !typing && st && screen.hidden && choicesEl.hidden && !box.hidden) {
        if (autoT) clearTimeout(autoT);
        autoT = setTimeout(advance, m === 'skip' ? 40 : 600);
      }
    }

    /* ---------------- screens (title, menu, save/load, history, endings, gallery, map, settings) */
    function show(html, cls) {
      screen.className = 'nvp-screen scr-' + (cls || 'menu');
      screen.innerHTML = html; screen.hidden = false;
      var f = screen.querySelector('button.pri, button');
      if (f && cls !== 'title') setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }
    function hideScreen() { screen.hidden = true; screen.innerHTML = ''; try { root.focus({ preventScroll: true }); } catch (e) {} }
    function head(title) { return '<div class="nvp-head"><h3>' + esc(title) + '</h3><button type="button" class="nvp-x" data-act="close" aria-label="Close">✕</button></div>'; }
    function titleScreen() {
      clearTimers(); st = null; back = [];
      box.hidden = true; choicesEl.hidden = true; $('[data-qm]').hidden = true; $('[data-chars]').innerHTML = ''; setCg('');
      var img = S.title_img || firstBg();
      bgA.style.transition = 'none'; setSrc(bgA, img ? resolve(img) : ''); bgA.style.opacity = img ? 1 : 0; bgB.style.opacity = 0; bgFront = bgA;
      var all = allEndings(), found = all.filter(function (x) { return P.endings[x.id]; }).length, cgs = galleryList();
      var meta = opts.meta || {};
      show('<div class="nvp-title"><div class="nvp-title-top"><h1>' + esc(meta.title || 'Untitled') + '</h1>' + (meta.author ? '<p>by ' + esc(meta.author) + '</p>' : '') + '</div>' +
        '<div class="nvp-title-menu">' +
        '<button type="button" class="pri" data-act="start">' + (saves.auto ? 'New game' : 'Start') + '</button>' +
        (saves.auto ? '<button type="button" data-act="continue">Continue</button>' : '') +
        '<button type="button" data-act="load">Load</button>' +
        (all.length ? '<button type="button" data-act="endings">Endings <small>' + found + '/' + all.length + '</small></button>' : '') +
        (cgs.length ? '<button type="button" data-act="gallery">Gallery</button>' : '') +
        (Object.keys(P.scenes).length ? '<button type="button" data-act="flow">Story map</button>' : '') +
        '<button type="button" data-act="settings">Settings</button>' +
        (S.credits ? '<button type="button" data-act="credits">Credits</button>' : '') +
        '</div>' + (opts.branding ? '<a class="nvp-brand" href="https://imgnovella.anvil.app" target="_blank" rel="noopener">Made with ImgNovella</a>' : '') + '</div>', 'title');
    }
    function firstBg() {
      var s0 = scenes[story.start];
      var list = s0 ? [s0].concat(story.scenes || []) : (story.scenes || []);
      for (var i = 0; i < list.length; i++) for (var j = 0; j < (list[i].steps || []).length; j++) if (list[i].steps[j].t === 'bg' && list[i].steps[j].img) return list[i].steps[j].img;
      return '';
    }
    function galleryList() {
      var out = [];
      (story.scenes || []).forEach(function (s) { (s.steps || []).forEach(function (x) { if (x.t === 'cg' && x.img && out.indexOf(x.img) < 0) out.push(x.img); }); });
      return out;
    }
    function newGame(sceneId, vars) {
      Audio.unlock();
      clearTimers(); hideScreen(); back = [];
      st = fresh(sceneId, vars);
      paint();
      if (opts.onStart) try { opts.onStart(); } catch (e) {}
      goScene(st.scene);
    }
    function loadState(s) {
      Audio.unlock();
      clearTimers(); hideScreen(); back = [];
      st = clone(s);
      choicesEl.hidden = true; box.hidden = true;
      paint();
      run();
    }
    function slotLabel(s) { return s ? esc(s.label || '') + '<small>' + esc(new Date(s.when).toLocaleString()) + '</small>' : '<small>Empty</small>'; }
    function saveScreen(saving) {
      var slots = [];
      for (var i = 0; i < 6; i++) slots.push(saves.slots[i] || null);
      show(head(saving ? 'Save' : 'Load') + '<div class="nvp-slots">' +
        (saving ? '' : '<button type="button" data-slot="auto"' + (saves.auto ? '' : ' disabled') + '><b>Auto</b>' + slotLabel(saves.auto) + '</button>') +
        slots.map(function (s, i) {
          var thumb = s && s.st && s.st.bg ? '<img alt="" src="' + esc(resolve(s.st.bg)) + '">' : '<span class="nvp-noimg"></span>';
          return '<button type="button" data-slot="' + i + '"' + (!saving && !s ? ' disabled' : '') + '>' + thumb + '<b>Slot ' + (i + 1) + '</b>' + slotLabel(s) + '</button>';
        }).join('') + '</div>', saving ? 'save' : 'load');
      screen.setAttribute('data-saving', saving ? '1' : '');
    }
    function doSlot(which) {
      var saving = screen.getAttribute('data-saving') === '1';
      if (saving) {
        if (!st) return;
        var lastSay = back.length ? JSON.parse(back[back.length - 1]) : st;
        saves.slots[+which] = { st: lastSay, when: Date.now(), label: (scene() || {}).name || '' };
        persistSaves(); toast('Saved in slot ' + (+which + 1)); saveScreen(true);
        return;
      }
      var s = which === 'auto' ? saves.auto : saves.slots[+which];
      if (s) loadState(s.st);
    }
    function historyScreen() {
      var log = st ? st.log : [];
      show(head('History') + '<div class="nvp-log">' + (log.length ? log.map(function (l) {
        return l.choice ? '<p class="ch">› ' + esc(l.text) + '</p>' : '<p>' + (l.who ? '<b style="color:' + esc(l.color || 'inherit') + '">' + esc(l.who) + '</b>' : '') + esc(l.text) + '</p>';
      }).join('') : '<p class="muted">Nothing yet.</p>') + '</div>', 'log');
      var lg = screen.querySelector('.nvp-log'); lg.scrollTop = lg.scrollHeight;
    }
    function endingsScreen() {
      var all = allEndings();
      show(head('Endings') + '<div class="nvp-endlist">' + all.map(function (s) {
        var got = P.endings[s.id];
        return '<div class="' + (got ? 'got k-' + esc(s.ending.kind) : '') + '"><small>' + esc(KIND[s.ending.kind] || 'Ending') + '</small><b>' + (got ? esc(interpolate(s.ending.title, initVars())) : '???') + '</b>' +
          (got && s.ending.text ? '<p>' + esc(interpolate(s.ending.text, initVars())) + '</p>' : '') + '</div>';
      }).join('') + '</div>', 'endings');
    }
    function galleryScreen() {
      var list = galleryList();
      show(head('Gallery') + '<div class="nvp-gal">' + list.map(function (img) {
        return P.cgs[img] ? '<button type="button" data-view="' + esc(img) + '"><img alt="" src="' + esc(resolve(img)) + '"></button>' : '<span class="nvp-locked">?</span>';
      }).join('') + '</div>', 'gallery');
    }
    function flowScreen() {
      var list = story.scenes || [];
      if (!list.length) return;
      var xs = list.map(function (s) { return s.x || 0; }), ys = list.map(function (s) { return s.y || 0; });
      var minX = Math.min.apply(null, xs) - 100, minY = Math.min.apply(null, ys) - 40, W = Math.max.apply(null, xs) - minX + 100, H = Math.max.apply(null, ys) - minY + 80;
      var edges = '', nodes = '';
      list.forEach(function (s) {
        var known = !!P.scenes[s.id];
        if (!known) return;
        var targets = (s.choices || []).map(function (c) { return c.to; }).concat(s.next ? [s.next] : []).concat((s.steps || []).filter(function (x) { return x.t === 'jump'; }).map(function (x) { return x.to; }))
          .concat((s.steps || []).filter(function (x) { return x.t === 'game'; }).reduce(function (a, x) { return a.concat([x.win, x.lose]); }, []));
        targets.forEach(function (t) { var o = scenes[t]; if (o) edges += '<line x1="' + (s.x - minX) + '" y1="' + (s.y - minY + 22) + '" x2="' + (o.x - minX) + '" y2="' + (o.y - minY - 22) + '"/>'; });
      });
      list.forEach(function (s) {
        var known = !!P.scenes[s.id], end = s.ending, cls = known ? (end ? 'end k-' + end.kind : 'on') : 'off';
        var label = known ? (end ? interpolate(end.title, {}) : s.name) : '?';
        nodes += '<g class="' + cls + '"' + (known ? ' data-replay="' + esc(s.id) + '"' : '') + ' transform="translate(' + (s.x - minX) + ' ' + (s.y - minY) + ')"><rect x="-80" y="-22" width="160" height="44" rx="14"/><text y="5">' + esc(label.length > 20 ? label.slice(0, 19) + '…' : label) + '</text></g>';
      });
      show(head('Story map') + '<p class="nvp-sub">Scenes you have found. Tap one to replay from there.</p><div class="nvp-flow"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMin meet">' +
        '<g class="e">' + edges + '</g>' + nodes + '</svg></div>', 'flow');
    }
    function settingsScreen() {
      var p = P.prefs;
      function seg(name, opts_) {
        return '<div class="nvp-seg">' + opts_.map(function (o) { return '<button type="button" data-pref="' + name + '" data-val="' + o[0] + '" class="' + (String(p[name]) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
      }
      show(head('Settings') + '<div class="nvp-set">' +
        '<label>Text speed</label>' + seg('speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]) +
        '<label>Auto-play pace</label>' + seg('auto', [[0.6, 'Relaxed'], [1, 'Normal'], [1.8, 'Quick']]) +
        '<label>Text size</label>' + seg('size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]) +
        '<label>Music <output>' + Math.round(p.music * 100) + '%</output></label><input type="range" min="0" max="1" step="0.05" data-vol="music" value="' + p.music + '">' +
        '<label>Sound effects <output>' + Math.round(p.sfx * 100) + '%</output></label><input type="range" min="0" max="1" step="0.05" data-vol="sfx" value="' + p.sfx + '">' +
        '<label>Skip</label>' + seg('skipAll', [[false, 'Only text I\'ve read'], [true, 'Everything']]) +
        '<div class="nvp-btns"><button type="button" data-act="fullscreen">Full screen</button><button type="button" data-act="forget">Forget my progress</button></div>' +
        '<p class="nvp-keys">Keys: Space / Enter next · Backspace back · H history · A auto · S skip (or hold Ctrl) · Esc menu · 1-9 choose</p></div>', 'settings');
    }
    function menuScreen() {
      if (!st) return;
      show(head('Paused') + '<div class="nvp-menu">' +
        '<button type="button" class="pri" data-act="close">Resume</button><button type="button" data-act="save">Save</button><button type="button" data-act="load">Load</button>' +
        '<button type="button" data-act="log">History</button>' + (allEndings().length ? '<button type="button" data-act="endings">Endings</button>' : '') +
        '<button type="button" data-act="flow">Story map</button><button type="button" data-act="settings">Settings</button><button type="button" data-act="title">Title screen</button></div>', 'menu');
    }

    /* ---------------- events */
    var onClick = function (e) {
      var t = e.target;
      var act = t.closest('[data-act]'), q = t.closest('[data-q]'), ch = t.closest('[data-ch]'), slot = t.closest('[data-slot]'), pref = t.closest('[data-pref]');
      Audio.unlock();
      if (!st && S.title_music && !Audio.current() && screen.classList.contains('scr-title')) Audio.music(S.title_music, aud(S.title_music));
      if (ch) { e.stopPropagation(); if (!ch.disabled) choose(ch.getAttribute('data-ch')); return; }
      if (slot) { doSlot(slot.getAttribute('data-slot')); return; }
      if (pref) {
        var name = pref.getAttribute('data-pref'), val = pref.getAttribute('data-val');
        P.prefs[name] = val === 'true' ? true : val === 'false' ? false : isNaN(+val) ? val : +val;
        persist();
        if (name === 'size') { root.className = root.className.replace(/nvp-size-\w/, 'nvp-size-' + val); }
        settingsScreen(); return;
      }
      var view = t.closest('[data-view]');
      if (view) { show('<div class="nvp-view" data-act="gallery"><img alt="" src="' + esc(resolve(view.getAttribute('data-view'))) + '"></div>', 'view'); return; }
      var rep = t.closest('[data-replay]');
      if (rep) { var id = rep.getAttribute('data-replay'); newGame(id, clone(P.scenes[id] || initVars())); return; }
      if (q) {
        var k = q.getAttribute('data-q');
        if (k === 'back') rollback();
        else if (k === 'log') historyScreen();
        else if (k === 'auto') setMode('auto');
        else if (k === 'skip') setMode('skip');
        else if (k === 'save') saveScreen(true);
        else if (k === 'load') saveScreen(false);
        else if (k === 'menu') menuScreen();
        return;
      }
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'start') newGame();
        else if (a === 'continue') loadState(saves.auto.st);
        else if (a === 'load') saveScreen(false);
        else if (a === 'save') saveScreen(true);
        else if (a === 'log') historyScreen();
        else if (a === 'endings') endingsScreen();
        else if (a === 'gallery') galleryScreen();
        else if (a === 'flow') flowScreen();
        else if (a === 'settings') settingsScreen();
        else if (a === 'credits') show(head('Credits') + '<div class="nvp-credits">' + esc(S.credits).replace(/\n/g, '<br>') + '</div>', 'credits');
        else if (a === 'title') { Audio.music(S.title_music || '', aud(S.title_music)); titleScreen(); }
        else if (a === 'lastchoice') backToChoice();
        else if (a === 'fullscreen') { var fs = root.requestFullscreen || root.webkitRequestFullscreen; if (document.fullscreenElement) document.exitFullscreen(); else if (fs) fs.call(root); }
        else if (a === 'forget') { P = { endings: {}, cgs: {}, lines: {}, scenes: {}, chose: {}, prefs: P.prefs }; saves = { slots: [] }; persist(); persistSaves(); toast('Progress forgotten'); }
        else if (a === 'close') { if (st) hideScreen(); else titleScreen(); }
        return;
      }
      if (t.closest('.nvp-screen') || t.closest('.nvp-choices') || t.closest('.nvp-game') || t.closest('a')) return;
      if (t.closest('[data-stage]')) advance();
    };
    var onKey = function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (gameRun && screen.hidden) { gameRun.key(e); return; }
      var k = e.key;
      if (k === 'Control' && st) { mode.ctrl = true; setMode('skip', true); return; }
      if (k === 'Escape') { e.preventDefault(); if (!screen.hidden && st) hideScreen(); else if (st) menuScreen(); return; }
      if (!screen.hidden) return;
      if (k === ' ' || k === 'Enter') { e.preventDefault(); advance(); }
      else if (k === 'Backspace' || k === 'PageUp' || k === 'ArrowLeft') { e.preventDefault(); rollback(); }
      else if (k === 'h' || k === 'H') historyScreen();
      else if (k === 'a' || k === 'A') setMode('auto');
      else if (k === 's' || k === 'S') setMode('skip');
      else if (/^[1-9]$/.test(k) && !choicesEl.hidden) { var b = choicesEl.querySelectorAll('[data-ch]')[+k - 1]; if (b && !b.disabled) choose(b.getAttribute('data-ch')); }
    };
    var onKeyUp = function (e) { if (e.key === 'Control' && mode.ctrl) { mode.ctrl = false; setMode('skip', false); } };
    var onWheel = function (e) { if (e.deltaY < 0 && screen.hidden && st && !gameRun) { e.preventDefault(); rollback(); } };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('input', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-vol');
      if (!v) return;
      P.prefs[v] = +e.target.value; persist();
      Audio.volume(v === 'music' ? { music: P.prefs.music } : { sfx: P.prefs.sfx });
      var out = e.target.previousElementSibling && e.target.previousElementSibling.querySelector('output');
      if (out) out.textContent = Math.round(+e.target.value * 100) + '%';
      if (v === 'sfx') Audio.sfx('pop');
    });

    if (opts.startScene || opts.skipTitle) newGame(opts.startScene || story.start, opts.vars ? clone(opts.vars) : null);
    else titleScreen();

    return {
      el: root,
      destroy: function () { destroyed = true; clearTimers(); Audio.stop(); if (ro) ro.disconnect(); root.remove(); },
      state: function () { return st ? clone(st) : null; },
      setVar: function (name, val) { if (st) { st.vars[name] = val; } },
      jump: function (id) { if (!st) newGame(id); else { clearTimers(); hideScreen(); choicesEl.hidden = true; goScene(id); } },
      restart: function () { newGame(opts.startScene || story.start); },
      title: titleScreen,
      endings: function () { return clone(P.endings); }
    };
  };

  /* ================================================================== styles (injected once; exported games carry them too) */
  RT.CSS = [
    '.nvp{position:relative;width:100%;height:100%;display:grid;place-items:center;outline:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;--u:1px;--acc:#ff4f8b;--acc-ink:#221a2e;font-family:"Nunito",system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.nvp *{box-sizing:border-box}',
    '.nvp h1,.nvp h2,.nvp h3{color:inherit!important;letter-spacing:normal}',
    '.nvp.nvp-font-serif{font-family:Georgia,"Times New Roman",serif}.nvp.nvp-font-sans{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}.nvp.nvp-font-mono{font-family:ui-monospace,"Cascadia Mono",Consolas,"Courier New",monospace}',
    '.nvp-stage{position:relative;overflow:hidden;background:linear-gradient(160deg,#3a2f52,#1a1424);border-radius:calc(var(--u)*14);color:#fff;cursor:pointer}',
    '.nvp-bg,.nvp-bg img,.nvp-cg,.nvp-veil{position:absolute;inset:0;width:100%;height:100%}',
    '.nvp-bg{z-index:0}.nvp-bg img{object-fit:cover;opacity:0}',  /* own layer: the fading pictures' z-index stays inside it, below the characters */
    '.nvp-bg img:not([src]),.nvp-bg img[src=""]{visibility:hidden}',
    '.nvp-chars{position:absolute;z-index:2;inset:0;pointer-events:none}',
    '.nvp-ch{position:absolute;bottom:0;height:80%;width:max-content;transform:translateX(-50%);transition:left .45s cubic-bezier(.3,.8,.3,1),filter .3s,transform .3s}',
    '.nvp-landscape .nvp-ch{height:94%}',
    '.nvp-ch img{height:100%;width:auto;max-width:none;display:block;filter:drop-shadow(0 calc(var(--u)*6) calc(var(--u)*10) rgba(0,0,0,.25))}',
    '.nvp-ch.noimg{width:calc(var(--u)*120);height:40%;border-radius:calc(var(--u)*60) calc(var(--u)*60) 0 0;background:rgba(255,255,255,.25);border:calc(var(--u)*2) dashed rgba(255,255,255,.7)}',
    '.nvp-ch.noimg img{display:none}.nvp-ch.noimg::after{content:attr(data-label);position:absolute;top:30%;left:0;right:0;text-align:center;font-weight:800;font-size:calc(var(--u)*14)}',
    '.nvp-ch.dim{filter:brightness(.72) saturate(.85)}.nvp-ch.talk{transform:translateX(-50%) scale(1.015)}',
    '.nvp-ch.in-dissolve{animation:nvp-in .4s ease-out}.nvp-ch.in-slide{animation:nvp-slide .45s cubic-bezier(.3,.8,.3,1)}.nvp-ch.in-pop{animation:nvp-pop .4s cubic-bezier(.3,1.6,.5,1)}',
    '.nvp-ch.out-dissolve,.nvp-ch.out-slide,.nvp-ch.out-pop{opacity:0;transition:opacity .4s}',
    '@keyframes nvp-in{from{opacity:0}}@keyframes nvp-slide{from{opacity:0;margin-left:calc(var(--u)*-60)}}@keyframes nvp-pop{from{opacity:0;transform:translateX(-50%) scale(.85)}}',
    '.nvp-cg{opacity:0;transition:opacity .7s;pointer-events:none;z-index:3}.nvp-cg.on{opacity:1}.nvp-cg img{width:100%;height:100%;object-fit:cover}',
    '.nvp-veil{pointer-events:none;opacity:0;z-index:8}.nvp-veil.flash{background:#fff;animation:nvp-flash .5s}.nvp-veil.fade{background:#000;animation:nvp-fade 1.4s}',
    '@keyframes nvp-flash{0%{opacity:.95}100%{opacity:0}}@keyframes nvp-fade{0%{opacity:0}45%,55%{opacity:1}100%{opacity:0}}',
    '.nvp-stage.shake{animation:nvp-shake .5s}@keyframes nvp-shake{20%{transform:translate(-6px,2px)}40%{transform:translate(5px,-3px)}60%{transform:translate(-4px,1px)}80%{transform:translate(3px,0)}}',
    /* textbox */
    '.nvp-box{position:absolute;z-index:4;left:calc(var(--u)*12);right:calc(var(--u)*12);bottom:calc(var(--u)*34);min-height:calc(var(--u)*118);padding:calc(var(--u)*22) calc(var(--u)*20) calc(var(--u)*16);border-radius:calc(var(--u)*18);font-size:calc(var(--u)*15.5);line-height:1.5}',
    '.nvp-landscape .nvp-box{left:calc(var(--u)*40);right:calc(var(--u)*40);min-height:calc(var(--u)*104);bottom:calc(var(--u)*30)}',
    '.nvp-size-s .nvp-box{font-size:calc(var(--u)*13.5)}.nvp-size-l .nvp-box{font-size:calc(var(--u)*18)}',
    '.nvp-name{position:absolute;top:calc(var(--u)*-15);left:calc(var(--u)*16);padding:calc(var(--u)*4) calc(var(--u)*14);border-radius:999px;font-weight:800;font-size:calc(var(--u)*14.5);background:var(--who);color:var(--who-ink);letter-spacing:.01em}',
    '.nvp-name[hidden]{display:none}',
    '.nvp-text .nvp-c{opacity:0}.nvp-text .nvp-c.on{opacity:1}',
    '.nvp-text .nvp-big{font-size:1.35em;font-weight:800}.nvp-text .nvp-small{font-size:.8em}.nvp-text .nvp-shake{display:inline-block;animation:nvp-jit .25s infinite}',
    '@keyframes nvp-jit{25%{transform:translate(1px,-1px)}75%{transform:translate(-1px,1px)}}',
    '.nvp-box.narration .nvp-text{font-style:italic}',
    '.nvp-ctc{position:absolute;right:calc(var(--u)*16);bottom:calc(var(--u)*10);width:0;height:0;border-left:calc(var(--u)*7) solid transparent;border-right:calc(var(--u)*7) solid transparent;border-top:calc(var(--u)*9) solid var(--acc);opacity:0}',
    '.nvp-ctc.on{opacity:1;animation:nvp-bob 1s infinite}@keyframes nvp-bob{50%{transform:translateY(calc(var(--u)*3))}}',
    '.nvp-tb-sakura .nvp-box{background:rgba(255,255,255,.94);color:#2a2238;border:calc(var(--u)*3) solid #2a2238;box-shadow:0 calc(var(--u)*5) 0 #2a2238}',
    '.nvp-tb-sakura .nvp-name{border:calc(var(--u)*2.5) solid #2a2238}',
    '.nvp-tb-midnight .nvp-box{background:linear-gradient(180deg,rgba(18,20,48,.82),rgba(18,20,48,.92));color:#eef0ff;border:1px solid color-mix(in srgb,var(--acc) 70%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 0 calc(var(--u)*24) rgba(0,0,0,.4)}',
    '.nvp-tb-midnight .nvp-name{background:rgba(18,20,48,.95);color:var(--who);border:1px solid var(--who)}',
    '.nvp-tb-paper .nvp-box{background:#fbf3e3;color:#3b2a1e;border:calc(var(--u)*2) solid #3b2a1e;border-radius:calc(var(--u)*6);box-shadow:calc(var(--u)*5) calc(var(--u)*5) 0 #3b2a1e}',
    '.nvp-tb-paper .nvp-name{border-radius:calc(var(--u)*4);border:calc(var(--u)*2) solid #3b2a1e}',
    '.nvp-tb-pixel .nvp-box{background:#1c1630;color:#f4f1ff;border-radius:0;border:calc(var(--u)*4) solid #f4f1ff;box-shadow:0 0 0 calc(var(--u)*4) #1c1630;font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.01em}',
    '.nvp-tb-pixel .nvp-name{border-radius:0;border:calc(var(--u)*3) solid #f4f1ff}',
    /* quick menu */
    '.nvp-qm{position:absolute;z-index:5;left:0;right:0;bottom:calc(var(--u)*6);display:flex;justify-content:center;gap:calc(var(--u)*2)}',
    '.nvp-qm[hidden]{display:none}',
    '.nvp-qm button{font:inherit;font-size:calc(var(--u)*11.5);font-weight:800;color:#fff;background:rgba(20,14,30,.42);border:0;border-radius:999px;padding:calc(var(--u)*4) calc(var(--u)*9);cursor:pointer;text-shadow:0 1px 2px rgba(0,0,0,.5)}',
    '.nvp-qm button:hover{background:rgba(20,14,30,.7)}.nvp-qm button.on{background:var(--acc);color:var(--acc-ink);text-shadow:none}',
    /* choices */
    '.nvp-choices{position:absolute;z-index:6;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:calc(var(--u)*10);padding:calc(var(--u)*24);background:rgba(20,14,30,.35);cursor:default}',
    '.nvp-choices[hidden]{display:none}',
    '.nvp-choices button{font:inherit;font-weight:800;font-size:calc(var(--u)*15);width:min(100%,calc(var(--u)*340));display:flex;align-items:center;gap:calc(var(--u)*10);text-align:left;padding:calc(var(--u)*11) calc(var(--u)*16);border-radius:calc(var(--u)*16);background:#fff;color:#2a2238;border:calc(var(--u)*3) solid #2a2238;box-shadow:0 calc(var(--u)*4) 0 #2a2238;cursor:pointer;transition:transform .12s,box-shadow .12s;animation:nvp-rise .3s backwards}',
    '.nvp-choices button:nth-child(2){animation-delay:.05s}.nvp-choices button:nth-child(3){animation-delay:.1s}.nvp-choices button:nth-child(4){animation-delay:.15s}',
    '@keyframes nvp-rise{from{opacity:0;transform:translateY(calc(var(--u)*10))}}',
    '.nvp-choices button:hover:not(:disabled){transform:translateY(calc(var(--u)*-2));box-shadow:0 calc(var(--u)*6) 0 #2a2238;background:color-mix(in srgb,var(--acc) 22%,#fff)}',
    '.nvp-choices button b{flex:none;width:calc(var(--u)*24);height:calc(var(--u)*24);border-radius:50%;display:grid;place-items:center;background:var(--acc);color:var(--acc-ink);font-size:calc(var(--u)*12);border:calc(var(--u)*2) solid #2a2238}',
    '.nvp-choices button span{flex:1}.nvp-choices button small{display:block;font-weight:600;font-size:.78em;opacity:.8}',
    '.nvp-choices button em{font-style:normal;opacity:.5}',
    '.nvp-choices button.locked{background:#e9e4ef;color:#7a6f88;box-shadow:0 calc(var(--u)*3) 0 #8a7f98;border-color:#8a7f98;cursor:not-allowed}.nvp-choices button.locked b{background:#bdb3c9}',
    '.nvp-tb-midnight .nvp-choices button{background:rgba(18,20,48,.92);color:#eef0ff;border:1px solid var(--acc);box-shadow:none}.nvp-tb-midnight .nvp-choices button:hover:not(:disabled){background:rgba(40,44,90,.95)}',
    '.nvp-tb-pixel .nvp-choices button{border-radius:0;background:#1c1630;color:#fff;border-color:#f4f1ff;box-shadow:none}',
    '.nvp-tb-paper .nvp-choices button{background:#fbf3e3;color:#3b2a1e;border-radius:calc(var(--u)*6)}',
    '.nvp-in{display:grid;gap:calc(var(--u)*10);width:min(100%,calc(var(--u)*320));background:#fff;color:#2a2238;padding:calc(var(--u)*18);border-radius:calc(var(--u)*18);border:calc(var(--u)*3) solid #2a2238;box-shadow:0 calc(var(--u)*5) 0 #2a2238}',
    '.nvp-in label{font-weight:800;font-size:calc(var(--u)*16)}.nvp-in input{font:inherit;font-size:calc(var(--u)*16);padding:calc(var(--u)*10);border-radius:calc(var(--u)*10);border:calc(var(--u)*2) solid #2a2238;width:100%;user-select:text}',
    '.nvp-in button,.nvp-btns button,.nvp-title-menu button,.nvp-menu button{font:inherit;font-weight:800;cursor:pointer}',
    '.nvp-in button{padding:calc(var(--u)*9);border-radius:999px;border:calc(var(--u)*2.5) solid #2a2238;background:var(--acc);color:var(--acc-ink)}',
    '.nvp-timer{position:absolute;z-index:7;left:calc(var(--u)*30);right:calc(var(--u)*30);top:calc(var(--u)*16);height:calc(var(--u)*8);border-radius:999px;background:rgba(255,255,255,.35);overflow:hidden}',
    '.nvp-timer[hidden]{display:none}.nvp-timer i{display:block;height:100%;width:100%;background:var(--acc)}',
    '.nvp-card{position:absolute;z-index:9;inset:0;display:grid;place-items:center;text-align:center;background:#120d1a;opacity:0;transition:opacity .5s;padding:calc(var(--u)*24)}',
    '.nvp-card.on{opacity:1}.nvp-card[hidden]{display:none}',
    '.nvp-card h2{font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*30);margin:0;line-height:1.1;color:#fff}.nvp-card p{margin:calc(var(--u)*8) 0 0;font-size:calc(var(--u)*15);color:var(--acc)}',
    '.nvp-card h2::after{content:"";display:block;width:calc(var(--u)*50);height:calc(var(--u)*4);border-radius:4px;background:var(--acc);margin:calc(var(--u)*12) auto 0}',
    /* screens */
    '.nvp-screen{position:absolute;z-index:10;inset:0;background:rgba(18,12,28,.86);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);padding:calc(var(--u)*18);overflow:auto;cursor:default;font-size:calc(var(--u)*14);animation:nvp-in .2s}',
    '.nvp-screen[hidden]{display:none}',
    '.nvp-screen.scr-title{background:linear-gradient(180deg,rgba(18,12,28,.15),rgba(18,12,28,.05) 40%,rgba(18,12,28,.75));-webkit-backdrop-filter:none;backdrop-filter:none;display:flex}',
    '.nvp-title{display:flex;flex-direction:column;justify-content:space-between;width:100%;min-height:100%}',
    '.nvp-title-top{text-align:center;padding-top:calc(var(--u)*24)}',
    '.nvp-title h1{font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*36);line-height:1.02;margin:0;color:#fff;text-shadow:0 calc(var(--u)*3) 0 #2a2238,0 0 calc(var(--u)*18) rgba(0,0,0,.4);-webkit-text-stroke:calc(var(--u)*1) #2a2238}',
    '.nvp-title-top p{margin:calc(var(--u)*8) 0 0;font-weight:800;text-shadow:0 1px 3px rgba(0,0,0,.6)}',
    '.nvp-title-menu{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*7);width:min(100%,calc(var(--u)*290));margin:0 auto calc(var(--u)*22)}.nvp-title-menu .pri{grid-column:1/-1;font-size:calc(var(--u)*17)!important;padding:calc(var(--u)*11)!important}',
    '.nvp-landscape .nvp-title-menu{grid-template-columns:repeat(3,1fr);width:min(100%,calc(var(--u)*470))}',
    '.nvp-title-menu button{padding:calc(var(--u)*7) calc(var(--u)*8)!important;font-size:calc(var(--u)*13)!important}',
    '.nvp-title-menu button,.nvp-menu button,.nvp-btns button{padding:calc(var(--u)*9) calc(var(--u)*14);border-radius:999px;font-size:calc(var(--u)*14.5);background:rgba(255,255,255,.92);color:#2a2238;border:calc(var(--u)*2.5) solid #2a2238;box-shadow:0 calc(var(--u)*3) 0 #2a2238}',
    '.nvp-title-menu button:hover,.nvp-menu button:hover,.nvp-btns button:hover{transform:translateY(-1px)}',
    '.nvp-title-menu button.pri,.nvp-menu button.pri,.nvp-btns button.pri{background:var(--acc);color:var(--acc-ink)}',
    '.nvp-title-menu small{opacity:.6;margin-left:.3em}',
    '.nvp-brand{position:absolute;right:calc(var(--u)*10);bottom:calc(var(--u)*8);font-size:calc(var(--u)*10.5);font-weight:800;color:#fff;opacity:.8;text-decoration:none;background:rgba(20,14,30,.45);padding:calc(var(--u)*3) calc(var(--u)*9);border-radius:999px}',
    '.nvp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:calc(var(--u)*12)}',
    '.nvp-head h3{margin:0;font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*22)}',
    '.nvp-x{font:inherit;font-size:calc(var(--u)*16);width:calc(var(--u)*34);height:calc(var(--u)*34);border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer}',
    '.nvp-sub{margin:0 0 calc(var(--u)*10);opacity:.75}',
    '.nvp-menu{display:grid;gap:calc(var(--u)*8);width:min(100%,calc(var(--u)*260));margin:calc(var(--u)*8) auto}',
    '.nvp-slots{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*8)}.nvp-landscape .nvp-slots{grid-template-columns:repeat(3,1fr)}',
    '.nvp-slots button{font:inherit;text-align:left;display:grid;gap:calc(var(--u)*2);padding:calc(var(--u)*8);border-radius:calc(var(--u)*12);border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:calc(var(--u)*12.5);min-height:calc(var(--u)*64)}',
    '.nvp-slots button:hover:not(:disabled){background:rgba(255,255,255,.16)}.nvp-slots button:disabled{opacity:.45;cursor:default}',
    '.nvp-slots img,.nvp-slots .nvp-noimg{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:calc(var(--u)*8);background:rgba(255,255,255,.1);display:block}',
    '.nvp-slots small{opacity:.7}',
    '.nvp-log{max-height:calc(100% - var(--u)*50);overflow:auto;user-select:text}.nvp-log p{margin:0 0 calc(var(--u)*10);line-height:1.45}.nvp-log b{display:block;font-size:.85em}.nvp-log .ch{color:var(--acc);font-weight:800}',
    '.nvp-endlist{display:grid;gap:calc(var(--u)*8)}.nvp-endlist div{padding:calc(var(--u)*10) calc(var(--u)*12);border-radius:calc(var(--u)*12);background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.25)}',
    '.nvp-endlist div.got{border-style:solid;background:rgba(255,255,255,.12)}.nvp-endlist small{display:block;opacity:.7;font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:.72em}.nvp-endlist b{font-size:1.08em}.nvp-endlist p{margin:calc(var(--u)*4) 0 0;opacity:.85}',
    '.k-true{--k:#ffd24a}.k-good{--k:#ff7fa6}.k-neutral{--k:#8fe3df}.k-bad{--k:#a99bb8}.k-secret{--k:#b69cff}',
    '.nvp-endlist .got{border-color:var(--k)!important}.nvp-endlist .got small{color:var(--k);opacity:1}',
    '.nvp-end{text-align:center;max-width:calc(var(--u)*330);margin:auto;padding-top:calc(var(--u)*30)}',
    '.scr-end{display:flex;background:radial-gradient(circle at 50% 30%,rgba(60,40,80,.85),rgba(18,12,28,.95))}',
    '.nvp-end-badge{display:inline-block;padding:calc(var(--u)*4) calc(var(--u)*12);border-radius:999px;background:var(--k);color:#221a2e;font-weight:800;font-size:calc(var(--u)*12);text-transform:uppercase;letter-spacing:.08em}',
    '.nvp-end h2{font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*32);line-height:1.05;margin:calc(var(--u)*12) 0 calc(var(--u)*8)}',
    '.nvp-end p{opacity:.88;line-height:1.5}.nvp-end-count{margin-top:calc(var(--u)*14);font-weight:800;opacity:.85}',
    '.nvp-dots{display:flex;gap:calc(var(--u)*6);justify-content:center;margin:calc(var(--u)*8) 0 calc(var(--u)*14)}.nvp-dots i{width:calc(var(--u)*12);height:calc(var(--u)*12);border-radius:50%;border:2px solid rgba(255,255,255,.4)}.nvp-dots i.on{background:var(--k);border-color:var(--k)}',
    '.nvp-btns{display:flex;flex-wrap:wrap;gap:calc(var(--u)*8);justify-content:center;margin-top:calc(var(--u)*10)}.nvp-btns button{font-size:calc(var(--u)*13)}',
    '.nvp-gal{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--u)*8)}.nvp-gal button{padding:0;border:0;border-radius:calc(var(--u)*10);overflow:hidden;cursor:pointer;aspect-ratio:1}.nvp-gal img{width:100%;height:100%;object-fit:cover;display:block}',
    '.nvp-locked{display:grid;place-items:center;aspect-ratio:1;border-radius:calc(var(--u)*10);background:rgba(255,255,255,.08);font-size:calc(var(--u)*24);opacity:.6}',
    '.scr-view{padding:0;display:grid;place-items:center;background:#000}.nvp-view{width:100%;height:100%;cursor:pointer}.nvp-view img{width:100%;height:100%;object-fit:contain}',
    '.nvp-flow{overflow:auto;max-height:calc(100% - var(--u)*70)}.nvp-flow svg{width:100%;height:auto;min-height:calc(var(--u)*200)}',
    '.nvp-flow .e line{stroke:rgba(255,255,255,.35);stroke-width:3}',
    '.nvp-flow g rect{fill:rgba(255,255,255,.08);stroke:rgba(255,255,255,.3);stroke-width:2}.nvp-flow g text{fill:#fff;font-size:15px;font-weight:800;text-anchor:middle;font-family:inherit}',
    '.nvp-flow g.on rect{fill:#fff;stroke:#2a2238}.nvp-flow g.on text{fill:#2a2238}.nvp-flow g.on,.nvp-flow g.end{cursor:pointer}',
    '.nvp-flow g.end rect{fill:var(--k);stroke:#2a2238}.nvp-flow g.end text{fill:#221a2e}.nvp-flow g.off text{fill:rgba(255,255,255,.5)}',
    '.nvp-set{display:grid;gap:calc(var(--u)*6)}.nvp-set label{font-weight:800;margin-top:calc(var(--u)*6);display:flex;justify-content:space-between}',
    '.nvp-seg{display:flex;flex-wrap:wrap;gap:calc(var(--u)*4)}.nvp-seg button{font:inherit;font-size:calc(var(--u)*12.5);font-weight:700;padding:calc(var(--u)*6) calc(var(--u)*10);border-radius:999px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;cursor:pointer}',
    '.nvp-seg button.on{background:var(--acc);color:var(--acc-ink);border-color:var(--acc)}',
    '.nvp-set input[type=range]{width:100%;accent-color:var(--acc)}.nvp-keys{opacity:.6;font-size:.85em;margin-top:calc(var(--u)*8)}',
    '.nvp-credits{white-space:normal;line-height:1.7;text-align:center;font-size:calc(var(--u)*15);padding-top:calc(var(--u)*20)}',
    '.nvp-toast{position:absolute;z-index:20;left:50%;top:calc(var(--u)*14);transform:translate(-50%,-20px);opacity:0;transition:.25s;background:#2a2238;color:#fff;font-weight:800;font-size:calc(var(--u)*12.5);padding:calc(var(--u)*6) calc(var(--u)*14);border-radius:999px;pointer-events:none}',
    '.nvp-toast.on{opacity:1;transform:translate(-50%,0)}',
    '.nvp-skipping .nvp-stage::after{content:"SKIP ›››";position:absolute;z-index:11;top:calc(var(--u)*10);right:calc(var(--u)*12);font-weight:800;font-size:calc(var(--u)*12);color:#fff;text-shadow:0 1px 3px #000}',
    '.nvp-petals{position:absolute;inset:0;z-index:12;pointer-events:none;overflow:hidden}.nvp-petals i{position:absolute;top:-20px;width:calc(var(--u)*12);height:calc(var(--u)*8);border-radius:60% 0;background:#ff9fbe;animation:nvp-fall 3s linear forwards}',
    '.nvp-petals i:nth-child(3n){background:#ffd24a}.nvp-petals i:nth-child(4n){background:var(--acc)}',
    '@keyframes nvp-fall{to{transform:translate(calc(var(--u)*40),calc(var(--u)*640)) rotate(540deg)}}',
    /* mini-games */
    '.nvp-game{position:absolute;z-index:9;inset:0;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:calc(var(--u)*12);background:rgba(18,12,28,.45);cursor:default;--g1:#ff4f8b;--g2:#3cc6c0;--g3:#fff;--g1i:#221a2e;--g3i:#221a2e}',
    '.nvp-game[hidden]{display:none}.nvp-game.solo{position:relative;inset:auto;background:none;padding:0}',
    '.nvp-g-card{width:min(100%,calc(var(--u)*350));max-height:100%;overflow:auto;background:var(--g3);color:var(--g3i);border:calc(var(--u)*3) solid #2a2238;border-radius:calc(var(--u)*20);box-shadow:0 calc(var(--u)*5) 0 #2a2238;padding:calc(var(--u)*14) calc(var(--u)*16);text-align:center;font-size:calc(var(--u)*14);animation:nvp-gpop .3s cubic-bezier(.3,1.5,.5,1)}',
    '.nvp-landscape .nvp-g-card{width:min(100%,calc(var(--u)*470))}',
    '.nvp-g-head small{display:inline-block;font-weight:800;font-size:calc(var(--u)*10.5);letter-spacing:.12em;text-transform:uppercase;padding:calc(var(--u)*2) calc(var(--u)*9);border-radius:999px;background:var(--g2);color:var(--g2i)}',
    '.nvp-g-head h3{margin:calc(var(--u)*6) 0 calc(var(--u)*2);font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*22);line-height:1.1}',
    '.nvp-g-head p{margin:0;opacity:.8;font-size:calc(var(--u)*13)}',
    '.nvp-g-area{margin:calc(var(--u)*12) 0 calc(var(--u)*8);user-select:none;-webkit-user-select:none;touch-action:manipulation}',
    '.nvp-g-status{font-size:calc(var(--u)*12.5);opacity:.85;min-height:1.4em}',
    '.nvp-g-skip{font:inherit;font-size:calc(var(--u)*11.5);background:none;border:0;color:inherit;opacity:.6;text-decoration:underline;cursor:pointer;margin-top:calc(var(--u)*6)}',
    '.nvp-game button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.g-btn{display:block;width:100%;margin-top:calc(var(--u)*12);padding:calc(var(--u)*10);border-radius:999px;background:var(--g1);color:var(--g1i);border:calc(var(--u)*2.5) solid #2a2238;box-shadow:0 calc(var(--u)*3) 0 #2a2238;font-weight:800;font-size:calc(var(--u)*16)}',
    '.g-btn:active{transform:translateY(calc(var(--u)*2));box-shadow:0 calc(var(--u)*1) 0 #2a2238}.g-big{font-size:calc(var(--u)*24);padding:calc(var(--u)*20)}',
    '.g-track{position:relative;height:calc(var(--u)*36);border-radius:999px;background:color-mix(in srgb,var(--g3i) 12%,transparent);border:calc(var(--u)*2.5) solid color-mix(in srgb,var(--g3i) 40%,transparent);margin:calc(var(--u)*10) 0}',
    '.g-zone{position:absolute;top:0;bottom:0;background:var(--g2);border-radius:999px}',
    '.g-mark{position:absolute;top:calc(var(--u)*-8);bottom:calc(var(--u)*-8);width:calc(var(--u)*9);margin-left:calc(var(--u)*-4.5);background:var(--g1);border:calc(var(--u)*2) solid #2a2238;border-radius:calc(var(--u)*5)}',
    '.g-hit .g-track{box-shadow:0 0 0 calc(var(--u)*4) var(--g2)}.g-miss{animation:nvp-shake .4s}',
    '.g-ttt{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--u)*6);width:calc(var(--u)*210);margin:0 auto}',
    '.g-ttt button{aspect-ratio:1;border-radius:calc(var(--u)*12);background:color-mix(in srgb,var(--g3i) 8%,transparent);border:calc(var(--u)*2) solid color-mix(in srgb,var(--g3i) 30%,transparent);font-size:calc(var(--u)*32);font-weight:800;color:var(--g3i);padding:0;line-height:1}',
    '.g-ttt .g-X{color:var(--g1)}.g-ttt .g-O{color:var(--g2)}',
    '.g-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(var(--u)*6);width:min(100%,calc(var(--u)*260));margin:0 auto}',
    '.nvp-landscape .g-mem.g-n16{grid-template-columns:repeat(8,1fr);width:min(100%,calc(var(--u)*430))}.nvp-landscape .g-mem.g-n12{grid-template-columns:repeat(6,1fr);width:min(100%,calc(var(--u)*360))}',
    '.g-mem button{aspect-ratio:1;border-radius:calc(var(--u)*10);background:var(--g1);border:calc(var(--u)*2) solid #2a2238;padding:0;font-size:calc(var(--u)*24);color:var(--g1);transition:transform .2s,background .2s}',
    '.g-mem button span{opacity:0;transition:opacity .15s}.g-mem button.up{background:var(--g3);color:var(--g2);transform:scale(1.05)}.g-mem button.up span{opacity:1}',
    '.g-mem button.done{background:var(--g2);color:var(--g2i);opacity:.6}',
    '.g-pad{width:100%;height:calc(var(--u)*150);border-radius:calc(var(--u)*18);border:calc(var(--u)*3) solid #2a2238;background:color-mix(in srgb,var(--g3i) 12%,transparent);color:var(--g3i);font-size:calc(var(--u)*22);font-weight:800}',
    '.nvp-landscape .g-pad{height:calc(var(--u)*110)}',
    '.g-pad.g-wait{background:var(--g1);color:var(--g1i)}.g-pad.g-go{background:var(--g2);color:var(--g2i);font-size:calc(var(--u)*34)}.g-pad.g-good{background:var(--g2);color:var(--g2i)}.g-pad.g-bad{background:#8b7d9c;color:#fff}',
    '.g-find-t{font-size:calc(var(--u)*15);margin-bottom:calc(var(--u)*8)}.g-find-t b{font-size:calc(var(--u)*26);color:var(--g1);vertical-align:middle}',
    '.g-grid{display:grid;gap:calc(var(--u)*3);width:min(100%,calc(var(--u)*290));margin:0 auto}',
    '.g-grid button{aspect-ratio:1;background:none;border:0;padding:0;font-size:calc(var(--u)*22);line-height:1;color:var(--g3i)}.g-grid .gc0{color:var(--g1)}.g-grid .gc1{color:var(--g2)}',
    '.nvp-landscape .g-grid{width:min(100%,calc(var(--u)*330))}.nvp-landscape .g-grid button{font-size:calc(var(--u)*18)}',
    '.g-meter{height:calc(var(--u)*18);border-radius:999px;background:color-mix(in srgb,var(--g3i) 12%,transparent);border:calc(var(--u)*2) solid #2a2238;overflow:hidden}.g-meter i{display:block;height:100%;width:0;background:var(--g2);transition:width .1s}',
    '.g-simon{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*8);width:calc(var(--u)*190);margin:0 auto}',
    '.g-simon button{aspect-ratio:1;border-radius:calc(var(--u)*18);border:calc(var(--u)*3) solid #2a2238;opacity:.55;transition:opacity .1s,transform .1s,box-shadow .1s}',
    '.g-simon .p0{background:var(--g1);border-top-left-radius:50%}.g-simon .p1{background:var(--g2);border-top-right-radius:50%}.g-simon .p2{background:color-mix(in srgb,var(--g1) 45%,#ffd24a);border-bottom-left-radius:50%}.g-simon .p3{background:color-mix(in srgb,var(--g2) 45%,#8a6cff);border-bottom-right-radius:50%}',
    '.g-simon button.lit{opacity:1;transform:scale(1.05);box-shadow:0 0 calc(var(--u)*18) #fff}',
    '.g-holes{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--u)*8);width:calc(var(--u)*220);margin:0 auto}',
    '.nvp-landscape .g-holes{width:calc(var(--u)*190)}',
    '.g-holes button{aspect-ratio:1;border-radius:50%;background:color-mix(in srgb,var(--g3i) 14%,transparent);border:calc(var(--u)*2) solid color-mix(in srgb,var(--g3i) 35%,transparent);padding:0;display:grid;place-items:center;overflow:hidden}',
    '.g-holes i{width:72%;height:72%;border-radius:50%;background:var(--g1);border:calc(var(--u)*2.5) solid #2a2238;transform:scale(0) translateY(40%);transition:transform .12s;display:block;background-image:radial-gradient(circle at 35% 40%,#2a2238 0 7%,transparent 8%),radial-gradient(circle at 65% 40%,#2a2238 0 7%,transparent 8%)}',
    '.g-holes .up i{transform:scale(1)}.g-holes .bonk i{transform:scale(1.1);background-color:var(--g2)}',
    '.g-code-d{font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*44);font-weight:800;line-height:1;color:var(--g1)}.g-code-d.ok{color:var(--g2)}.g-code-d.bad{color:#8b7d9c}',
    '.g-code form{display:flex;gap:calc(var(--u)*8);margin-top:calc(var(--u)*10)}.g-code input{flex:1;min-width:0;font:inherit;font-size:calc(var(--u)*18);font-weight:800;text-align:center;padding:calc(var(--u)*8);border-radius:calc(var(--u)*12);border:calc(var(--u)*2.5) solid #2a2238;user-select:text}',
    '.g-code .g-btn{width:auto;margin:0;padding:calc(var(--u)*8) calc(var(--u)*16)}',
    '.g-hist{display:flex;flex-wrap:wrap;gap:calc(var(--u)*5);justify-content:center;margin-top:calc(var(--u)*10)}.g-hist span{font-size:calc(var(--u)*12);font-weight:700;padding:calc(var(--u)*3) calc(var(--u)*8);border-radius:999px;background:color-mix(in srgb,var(--g3i) 10%,transparent)}',
    '.g-vs{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*14);font-size:calc(var(--u)*40);margin-bottom:calc(var(--u)*10)}.g-vs b{font-size:calc(var(--u)*14);opacity:.6}',
    '.g-rps{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--u)*8)}',
    '.g-rps button{display:grid;gap:calc(var(--u)*2);justify-items:center;padding:calc(var(--u)*8) 0;border-radius:calc(var(--u)*14);background:var(--g1);color:var(--g1i);border:calc(var(--u)*2.5) solid #2a2238;box-shadow:0 calc(var(--u)*3) 0 #2a2238;font-weight:800;font-size:calc(var(--u)*12)}.g-rps button span{font-size:calc(var(--u)*28);line-height:1.1}',
    '.nvp-g-res{padding:calc(var(--u)*14) 0 calc(var(--u)*4)}.nvp-g-big{font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:calc(var(--u)*30);font-weight:800;line-height:1.1}.nvp-g-res.win .nvp-g-big{color:var(--g2)}.nvp-g-res.lose .nvp-g-big{color:var(--g1)}',
    '.nvp-g-res p{opacity:.75;margin:calc(var(--u)*4) 0 calc(var(--u)*12)}.nvp-g-btns{display:flex;flex-wrap:wrap;gap:calc(var(--u)*8);justify-content:center}',
    '.nvp-g-btns button{padding:calc(var(--u)*9) calc(var(--u)*16);border-radius:999px;font-weight:800;font-size:calc(var(--u)*14);background:transparent;color:var(--g3i);border:calc(var(--u)*2.5) solid #2a2238}.nvp-g-btns button.pri{background:var(--g1);color:var(--g1i);box-shadow:0 calc(var(--u)*3) 0 #2a2238}',
    '@keyframes nvp-shake{20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}',
    '.nvp-solo{height:auto;display:block}',
    '@keyframes nvp-gpop{from{opacity:0;transform:scale(.9)}}',
    '@media (prefers-reduced-motion:reduce){.nvp *{animation-duration:.01ms!important}}'
  ].join('\n');
  RT.injectCss = function (doc) {
    doc = doc || document;
    if (doc.getElementById('nvp-css')) return;
    var s = doc.createElement('style'); s.id = 'nvp-css'; s.textContent = RT.CSS;
    (doc.head || doc.documentElement).appendChild(s);
  };
  return RT;
}
window.NovellaRuntime = NovellaRuntime;
window.NV = NovellaRuntime();
NV.injectCss();

/* ===== _nv_tools.html ===== */
(function () {
  'use strict';
  var NVT = window.NVT = {};

  /* ---------------------------------------------------------------- built-in starter art (tools/make_art.py draws it) */
  var A = [];
  function add(kind, names, label) { names.forEach(function (n) { A.push({ key: 'demo:' + n, name: label(n), kind: kind }); }); }
  var nice = function (s) { return s.replace(/^(bg|cg|cover)-/, '').replace(/-/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); }); };
  add('bg', ['bg-sakura-park', 'bg-sakura-night', 'bg-classroom', 'bg-cafe', 'bg-station-night', 'bg-rooftop-sunset', 'bg-library', 'bg-bedroom', 'bg-festival', 'bg-shrine', 'bg-beach', 'bg-spaceship'], nice);
  ['mira', 'ren', 'sol', 'hana'].forEach(function (c) { add('sprite', ['neutral', 'happy', 'sad', 'surprised', 'angry', 'shy'].map(function (e) { return c + '-' + e; }), nice); });
  add('sprite', ['kuro-neutral', 'kuro-happy', 'kuro-surprised', 'stranger-neutral', 'stranger-smile', 'byte-neutral', 'byte-happy', 'byte-sad', 'byte-surprised', 'yoru-neutral', 'yoru-happy', 'yoru-surprised'], nice);
  add('cg', ['cg-promise', 'cg-train', 'cg-fireworks'], nice);
  add('cover', ['cover-cherry', 'cover-train', 'cover-rooftop', 'cover-library', 'cover-festival', 'cover-signal', 'cover-shrine', 'cover-cafe', 'cover-beach'], nice);
  NVT.ART = A;
  NVT.STARTER_CAST = [
    { id: 'mira', name: 'Mira', color: '#ff4f8b', base: 'mira', poses: ['neutral', 'happy', 'sad', 'surprised', 'angry', 'shy'] },
    { id: 'ren', name: 'Ren', color: '#8a93d6', base: 'ren', poses: ['neutral', 'happy', 'sad', 'surprised', 'angry', 'shy'] },
    { id: 'sol', name: 'Sol', color: '#ff9a3c', base: 'sol', poses: ['neutral', 'happy', 'sad', 'surprised', 'angry', 'shy'] },
    { id: 'kuro', name: 'Kuro', color: '#ffd24a', base: 'kuro', poses: ['neutral', 'happy', 'surprised'] },
    { id: 'conductor', name: 'Conductor', color: '#8fe3df', base: 'stranger', poses: ['neutral', 'smile'] },
    { id: 'hana', name: 'Hana', color: '#7a5aa8', base: 'hana', poses: ['neutral', 'happy', 'sad', 'surprised', 'angry', 'shy'] },
    { id: 'byte', name: 'Byte', color: '#3cc6c0', base: 'byte', poses: ['neutral', 'happy', 'sad', 'surprised'] },
    { id: 'yoru', name: 'Yoru', color: '#f08a3c', base: 'yoru', poses: ['neutral', 'happy', 'surprised'] }
  ];
  NVT.KINDS = { bg: 'Background', sprite: 'Character', cg: 'CG (illustration)', cover: 'Cover', other: 'Other' };
  NVT.GENRES = ['Romance', 'Mystery', 'Fantasy', 'Sci-fi', 'Slice of life', 'Comedy', 'Drama', 'Horror', 'Adventure'];

  /* ---------------------------------------------------------------- picture URLs */
  NVT.api = function () { return (window.IMG_API || '/_/api').replace(/\/$/, ''); };
  NVT.img = function (key) {
    if (!key) return '';
    if (key.indexOf('demo:') === 0) return '_/theme/demo-' + key.slice(5) + '.svg';
    if (/^i[0-9a-f]+$/.test(key)) return NVT.api() + '/img?k=' + encodeURIComponent(key);
    if (/^a[0-9a-f]+$/.test(key)) return NVT.api() + '/audio?k=' + encodeURIComponent(key);
    return '';
  };
  NVT.coverHtml = function (c, badge) {
    var src = NVT.img(c.cover);
    return '<div class="nv-cover">' + (src ? '<img alt="" loading="lazy" src="' + UI.esc(src) + '">' : '') +
      (badge ? '<div class="nv-cover-badge">' + badge + '</div>' : '') +
      (c.cover && c.cover.indexOf('cover') >= 0 ? '' : '<div class="nv-cover-t">' + UI.esc(c.title) + '</div>') + '</div>';
  };
  NVT.uid = function (p) { return (p || 'x') + Math.random().toString(36).slice(2, 8); };

  /* ---------------------------------------------------------------- the story checker */
  NVT.isFile = function (key) { return /^a[0-9a-f]+$/.test(key || ''); };
  /* Who is on stage? Follows every path through the story (choices, "then go to", jumps, mini-game results) and
     lists lines spoken by a character with pictures who may not be shown at that point: no "Show" step yet, or
     hidden earlier. A "Show" with an "only if" doesn't count as shown. Returns [{scene, k, who, msg}]. */
  NVT.offStage = function (data) {
    var byId = {}, pics = {}, names = {}, out = [], told = {};
    (data.scenes || []).forEach(function (s) { byId[s.id] = s; });
    (data.chars || []).forEach(function (c) { names[c.id] = c.name || 'A character'; if ((c.poses || []).some(function (p) { return p.img; })) pics[c.id] = 1; });
    if (!byId[data.start]) return out;
    var away = {}, todo = [data.start];
    away[data.start] = Object.assign({}, pics);
    function flow(to, set) {
      if (!byId[to]) return;
      var cur = away[to], grew = !cur;
      cur = cur || {};
      Object.keys(set).forEach(function (id) { if (!cur[id]) { cur[id] = 1; grew = true; } });
      away[to] = cur;
      if (grew && todo.indexOf(to) < 0) todo.push(to);
    }
    for (var guard = 0; todo.length && guard < 20000; guard++) {
      var s = byId[todo.shift()], a = Object.assign({}, away[s.id]), stop = false;
      (s.steps || []).forEach(function (x, i) {
        if (stop) return;
        if (x.t === 'show' && !x.if) delete a[x.char];
        else if (x.t === 'hide') a[x.char] = 1;
        else if (x.t === 'say' && x.who && a[x.who] && pics[x.who]) {
          var key = s.id + ':' + (x.k || i);
          if (!told[key]) {
            told[key] = 1;
            out.push({ scene: s.id, k: x.k || i, who: x.who, msg: names[x.who] + ' speaks in line ' + (i + 1) + ' but may not be on stage. Add a "Show character" step before it (or ignore this if they talk off-screen).' });
          }
        }
        else if (x.t === 'jump' && byId[x.to]) { flow(x.to, a); if (!x.if) stop = true; }
        else if (x.t === 'game') { if (x.win) flow(x.win, a); if (x.lose) flow(x.lose, a); }
      });
      if (stop) continue;
      (s.choices || []).forEach(function (c) { flow(c.to, a); });
      if (s.next) flow(s.next, a);
    }
    return out;
  };

  NVT.lint = function (data, images, sounds) {
    var out = [], scenes = data.scenes || [], byId = {}, chars = {}, vars = (data.vars || []).map(function (v) { return v.name; });
    var have = {};
    (images || []).forEach(function (i) { have[i.key] = 1; });
    (sounds || []).forEach(function (i) { have[i.key] = 1; });
    NVT.ART.forEach(function (a) { have[a.key] = 1; });
    scenes.forEach(function (s) { byId[s.id] = s; });
    (data.chars || []).forEach(function (c) { chars[c.id] = c; });
    function e(lvl, msg, s, k) { out.push({ lvl: lvl, msg: msg, scene: s ? s.id : null, sceneName: s ? s.name : '', k: k || null }); }
    function cond(c, s, k, where) {
      if (!c) return;
      var r = NV.check(c, vars);
      if (!r.ok) e('error', where + ': ' + r.error + ' ("' + c + '")', s, k);
    }
    function pic(key, s, k, where) { if (key && !have[key]) e('error', where + ' uses a picture that was deleted', s, k); }
    if (!scenes.length) e('error', 'Add at least one scene.');
    if (scenes.length && !byId[data.start]) e('error', 'Choose a starting scene (Settings, or "Set as start" on the map).');
    scenes.forEach(function (s) {
      (s.steps || []).forEach(function (x, i) {
        var k = x.k || i;
        cond(x.if, s, k, 'Line ' + (i + 1) + ' condition');
        if (x.t === 'say' && x.who && !chars[x.who]) e('error', 'Line ' + (i + 1) + ' is spoken by a character that was deleted', s, k);
        if (x.t === 'say' && !String(x.text || '').trim()) e('warn', 'Line ' + (i + 1) + ' is empty', s, k);
        if ((x.t === 'show' || x.t === 'hide') && !chars[x.char]) e('error', 'Step ' + (i + 1) + ': choose a character', s, k);
        if (x.t === 'show' && chars[x.char] && !(chars[x.char].poses || []).length) e('warn', chars[x.char].name + ' has no pictures yet (Cast tab)', s, k);
        if (x.t === 'bg' || x.t === 'cg') pic(x.img, s, k, 'Step ' + (i + 1));
        if (x.t === 'bg' && !x.img) e('warn', 'Step ' + (i + 1) + ': choose a background picture', s, k);
        if ((x.t === 'set' || x.t === 'input') && (!x.var || vars.indexOf(x.var) < 0)) e('error', 'Step ' + (i + 1) + ': choose a variable', s, k);
        if (x.t === 'jump' && !byId[x.to]) e('error', 'Step ' + (i + 1) + ': the jump has no target scene', s, k);
        if ((x.t === 'music' && NVT.isFile(x.track)) || (x.t === 'sfx' && NVT.isFile(x.name))) { if (!have[x.t === 'music' ? x.track : x.name]) e('error', 'Step ' + (i + 1) + ' plays a sound file that was deleted', s, k); }
        if (x.t === 'game') {
          if (!NV.GAMES[x.game]) e('error', 'Step ' + (i + 1) + ': choose a mini-game', s, k);
          if (x.win && !byId[x.win]) e('error', 'Step ' + (i + 1) + ': "if they win" leads to a scene that was deleted', s, k);
          if (x.lose && !byId[x.lose]) e('error', 'Step ' + (i + 1) + ': "if they lose" leads to a scene that was deleted', s, k);
          if (x.var && !(data.vars || []).some(function (v) { return v.name === x.var && v.type === 'flag'; })) e('error', 'Step ' + (i + 1) + ': the game\'s result needs a yes / no variable', s, k);
        }
      });
      (s.choices || []).forEach(function (c, i) {
        if (!String(c.text || '').trim()) e('error', 'Choice ' + (i + 1) + ' has no text', s);
        if (!c.to) e('error', 'Choice ' + (i + 1) + ' ("' + (c.text || '') + '") doesn\'t lead anywhere yet', s);
        else if (!byId[c.to]) e('error', 'Choice ' + (i + 1) + ' leads to a scene that was deleted', s);
        cond(c.if, s, null, 'Choice ' + (i + 1) + ' condition');
        (c.set || []).forEach(function (f) { if (vars.indexOf(f.var) < 0) e('error', 'Choice ' + (i + 1) + ' changes an unknown variable', s); });
      });
      if (s.next && !byId[s.next]) e('error', '"Then go to" points at a scene that was deleted', s);
      if (s.timer && (s.choices || []).length && s.timeout && !(s.choices || []).some(function (c) { return c.id === s.timeout; })) e('warn', 'The timer picks a choice that no longer exists', s);
      var exits = (s.choices || []).length || s.next || s.ending || (s.steps || []).some(function (x) { return x.t === 'jump' && !x.if; });
      if (!exits) e('warn', 'Ends the story without an ending: mark it as an ending, add choices, or "then go to" another scene', s);
      if ((s.choices || []).length && (s.choices || []).every(function (c) { return c.if; }) && !s.next) e('warn', 'Every choice has a condition: if none is met, the story stops here. Add a "then go to" fallback.', s);
    });
    // reachability from the start
    if (byId[data.start]) {
      var seen = {}, queue = [data.start];
      while (queue.length) {
        var id = queue.shift();
        if (seen[id] || !byId[id]) continue;
        seen[id] = 1;
        var s = byId[id];
        (s.choices || []).forEach(function (c) { queue.push(c.to); });
        if (s.next) queue.push(s.next);
        (s.steps || []).forEach(function (x) { if (x.t === 'jump') queue.push(x.to); if (x.t === 'game') { if (x.win) queue.push(x.win); if (x.lose) queue.push(x.lose); } });
      }
      scenes.forEach(function (s) { if (!seen[s.id]) e('warn', 'Nothing leads here: players can never reach this scene', s); });
      NVT.offStage(data).forEach(function (w) { e('warn', w.msg, byId[w.scene], w.k); });
    }
    if (scenes.length && !scenes.some(function (s) { return s.ending; })) e('warn', 'Your novel has no endings yet. Mark a final scene as an ending to unlock the endings screen.');
    return out;
  };
  NVT.stats = function (data) {
    var words = 0, lines = 0, choices = 0, endings = 0;
    (data.scenes || []).forEach(function (s) {
      (s.steps || []).forEach(function (x) { if (x.t === 'say') { lines++; words += String(x.text || '').split(/\s+/).filter(Boolean).length; } });
      (s.choices || []).forEach(function (c) { choices++; words += String(c.text || '').split(/\s+/).filter(Boolean).length; });
      if (s.ending) endings++;
    });
    return { scenes: (data.scenes || []).length, words: words, lines: lines, choices: choices, endings: endings, minutes: Math.max(1, Math.round(words / 180 + choices * 0.15)) };
  };

  /* ---------------------------------------------------------------- map helpers */
  NVT.targets = function (s) {
    var out = [];
    (s.choices || []).forEach(function (c) { if (c.to) out.push({ to: c.to, kind: 'choice', label: c.text, cond: !!c.if }); });
    (s.steps || []).forEach(function (x) {
      if (x.t === 'jump' && x.to) out.push({ to: x.to, kind: 'jump', label: x.if ? 'if ' + x.if : 'jump', cond: !!x.if });
      if (x.t === 'game') {
        if (x.win) out.push({ to: x.win, kind: 'game', label: 'win ' + ((NV.GAMES[x.game] || [''])[0]), cond: true });
        if (x.lose) out.push({ to: x.lose, kind: 'game', label: 'lose ' + ((NV.GAMES[x.game] || [''])[0]), cond: true });
      }
    });
    if (s.next) out.push({ to: s.next, kind: 'next', label: '' });
    return out;
  };
  NVT.layout = function (data) {
    var byId = {}, depth = {}, order = [], scenes = data.scenes || [];
    scenes.forEach(function (s) { byId[s.id] = s; });
    var queue = data.start && byId[data.start] ? [[data.start, 0]] : [];
    while (queue.length) {
      var q = queue.shift(), id = q[0];
      if (depth.hasOwnProperty(id) || !byId[id]) continue;
      depth[id] = q[1]; order.push(id);
      NVT.targets(byId[id]).forEach(function (t) { queue.push([t.to, q[1] + 1]); });
    }
    var maxD = order.length ? Math.max.apply(null, order.map(function (id) { return depth[id]; })) : -1;
    scenes.forEach(function (s) { if (!depth.hasOwnProperty(s.id)) { depth[s.id] = maxD + 1; order.push(s.id); } });
    var rows = {};
    order.forEach(function (id) { (rows[depth[id]] = rows[depth[id]] || []).push(id); });
    Object.keys(rows).forEach(function (d) {
      var row = rows[d], w = 230;
      row.forEach(function (id, i) { byId[id].x = Math.round((i - (row.length - 1) / 2) * w); byId[id].y = d * 170; });
    });
  };
  NVT.freeSpot = function (data, x, y) {
    var taken = function (px, py) { return (data.scenes || []).some(function (s) { return Math.abs(s.x - px) < 200 && Math.abs(s.y - py) < 80; }); };
    for (var i = 0; i < 40; i++) {
      var px = x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 230;
      if (!taken(px, y)) return { x: px, y: y };
    }
    return { x: x, y: y + 170 };
  };

  /* ---------------------------------------------------------------- renaming a variable everywhere */
  NVT.renameVar = function (data, from, to) {
    var rx = new RegExp('\\b' + from + '\\b', 'g'), tx = new RegExp('\\[' + from + '\\]', 'g');
    function cond(c) { return c ? c.replace(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*/g, function (w) { return w === from ? to : w; }) : c; }
    function text(t) { return t ? t.replace(tx, '[' + to + ']').replace(/\{if ([^}]*)\}/g, function (a, c) { return '{if ' + cond(c) + '}'; }) : t; }
    (data.scenes || []).forEach(function (s) {
      (s.steps || []).forEach(function (x) {
        if (x.if) x.if = cond(x.if);
        if (x.var === from) x.var = to;
        ['text', 'prompt', 'title', 'sub'].forEach(function (f) { if (x[f]) x[f] = text(x[f]); });
      });
      (s.choices || []).forEach(function (c) {
        if (c.if) c.if = cond(c.if);
        c.text = text(c.text);
        (c.set || []).forEach(function (f) { if (f.var === from) f.var = to; });
      });
      if (s.ending) { s.ending.title = text(s.ending.title); s.ending.text = text(s.ending.text); }
    });
    (data.chars || []).forEach(function (c) { c.name = text(c.name); });
    void rx;
  };
  NVT.varUses = function (data, name) {
    var n = 0, w = new RegExp('\\b' + name + '\\b'), t = '[' + name + ']';
    (data.scenes || []).forEach(function (s) {
      (s.steps || []).forEach(function (x) { if ((x.if && w.test(x.if)) || x.var === name || String(x.text || '').indexOf(t) >= 0) n++; });
      (s.choices || []).forEach(function (c) { if ((c.if && w.test(c.if)) || (c.set || []).some(function (f) { return f.var === name; }) || String(c.text || '').indexOf(t) >= 0) n++; });
    });
    return n;
  };

  /* ---------------------------------------------------------------- pictures: shrink to the plan before uploading */
  function loadImage(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { ok({ im: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); bad(new Error('That file isn\'t a picture we can read.')); };
      im.src = url;
    });
  }
  NVT.fitSize = function (w, h, lim) {
    var long = Math.max(w, h), short = Math.min(w, h);
    var s = Math.min(1, lim.long / long, lim.short / short);
    return { w: Math.max(1, Math.floor(w * s)), h: Math.max(1, Math.floor(h * s)), scaled: s < 1 };
  };
  NVT.resize = function (file, lim, kind) {
    if (!/^image\//.test(file.type || '')) return Promise.reject(new Error(file.name + ' isn\'t a picture.'));
    return loadImage(file).then(function (o) {
      var size = NVT.fitSize(o.im.naturalWidth, o.im.naturalHeight, lim);
      var cv = document.createElement('canvas');
      cv.width = size.w; cv.height = size.h;
      var g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(o.im, 0, 0, size.w, size.h);
      URL.revokeObjectURL(o.url);
      var alpha = kind === 'sprite' || /png|webp|gif|svg/.test(file.type);
      var webp = cv.toDataURL('image/webp', 0.9).indexOf('data:image/webp') === 0;
      var max = lim.max_kb * 1024 * 1.33, q = 0.9, url;
      for (var i = 0; i < 6; i++) {
        url = webp ? cv.toDataURL('image/webp', q) : (alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', q));
        if (url.length < max) break;
        if (!webp && alpha) { url = cv.toDataURL('image/jpeg', q); alpha = false; }
        q -= 0.1;
      }
      if (url.length >= max) throw new Error(file.name + ' is still too big after shrinking. Try a simpler picture.');
      return { dataUrl: url, w: size.w, h: size.h, scaled: size.scaled, kb: Math.round(url.length * 0.75 / 1024) };
    });
  };

  /* ---------------------------------------------------------------- packaging: a standalone HTML game */
  function usedPictures(data) {
    var keys = {};
    function k(v) { if (v) keys[v] = 1; }
    k((data.settings || {}).title_img);
    if (NVT.isFile((data.settings || {}).title_music)) k(data.settings.title_music);
    (data.scenes || []).forEach(function (s) {
      (s.steps || []).forEach(function (x) {
        if (x.t === 'bg' || x.t === 'cg') k(x.img);
        if (x.t === 'music' && NVT.isFile(x.track)) k(x.track);
        if (x.t === 'sfx' && NVT.isFile(x.name)) k(x.name);
      });
    });
    (data.chars || []).forEach(function (c) { (c.poses || []).forEach(function (p) { k(p.img); }); });
    return Object.keys(keys);
  }
  NVT.usedPictures = usedPictures;
  function toDataUrl(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('A picture could not be loaded (' + r.status + ').'); return r.blob(); }).then(function (b) {
      return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.readAsDataURL(b); });
    });
  }
  // JSON that is safe inside a script tag: no '<' (so no closing tag) and no line separators.
  var BS = String.fromCharCode(92);
  function json(v) {
    return JSON.stringify(v).split('<').join(BS + 'u003c').split(String.fromCharCode(0x2028)).join(BS + 'u2028').split(String.fromCharCode(0x2029)).join(BS + 'u2029');
  }
  NVT.slugify = function (s) { return String(s || 'novel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'novel'; };
  NVT.buildGame = function (meta, data, opts, progress) {
    opts = opts || {};
    var keys = usedPictures(data), pics = {}, done = 0;
    return keys.reduce(function (p, key) {
      return p.then(function () {
        return toDataUrl(NVT.img(key)).then(function (u) { pics[key] = u; done++; if (progress) progress(done, keys.length); });
      });
    }, Promise.resolve()).then(function () {
      var title = UI.esc(meta.title || 'My novel');
      var src = NovellaRuntime.toString().replace(/<\/script/gi, '<\\/script');
      var close = '</scr' + 'ipt>';
      var html = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
        '<title>' + title + '</title>\n<meta name="description" content="' + UI.esc(meta.blurb || '') + '">\n<meta name="generator" content="ImgNovella">\n' +
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
        '<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">\n' +
        '<sty' + 'le>html,body{margin:0;height:100%;background:#120d1a;overflow:hidden}#nv{position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}</sty' + 'le>\n' +
        '</head>\n<body>\n<div id="nv"></div>\n<script>\n' +
        '/* ' + (meta.title || 'A visual novel').replace(/\*\//g, '') + ' by ' + (meta.author || 'its author').replace(/\*\//g, '') + '. ' + (opts.license || '').replace(/\*\//g, '') + ' */\n' +
        'var STORY = ' + json(data) + ';\nvar PICS = ' + json(pics) + ';\nvar META = ' + json({ title: meta.title, author: meta.author }) + ';\n' +
        'var NV = (' + src + ')();\nNV.injectCss();\n' +
        'NV.mount(document.getElementById("nv"), STORY, { resolve: function (k) { return PICS[k] || ""; }, storageKey: ' + json('export-' + (meta.slug || NVT.slugify(meta.title))) + ', meta: META, branding: ' + (opts.branding ? 'true' : 'false') + ' });\n' +
        'document.getElementById("nv").firstChild.focus();\n' + close + '\n</body>\n</html>\n';
      return html;
    });
  };

  /* a tiny zip writer (stored, no compression), enough for an itch.io upload */
  var CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) crc = CRC[(crc ^ b[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  NVT.zip = function (files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var head = [].concat([0x50, 0x4b, 3, 4], u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push(new Uint8Array([].concat([0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += head.length + name.length + data.length;
    });
    var size = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array([].concat([0x50, 0x4b, 5, 6], u16(0), u16(0), u16(files.length), u16(files.length), u32(size), u32(offset), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  };
  /* sounds: read a file as a data URL and measure its length (audio isn't re-encoded, so the size limit is checked first) */
  NVT.readSound = function (file, lim) {
    if (!/^audio\//.test(file.type || '') && !/\.(mp3|ogg|wav|m4a|webm)$/i.test(file.name)) return Promise.reject(new Error(file.name + ' isn\'t a sound file (MP3, OGG, WAV or M4A).'));
    if (file.size > lim.sound_kb * 1024) return Promise.reject(new Error(file.name + ' is ' + Math.round(file.size / 1024) + ' KB; the ' + lim.label + ' plan allows ' + lim.sound_kb + ' KB per sound. Try a shorter clip or a lower-quality MP3.'));
    var secs = new Promise(function (ok) {
      try {
        var url = URL.createObjectURL(file), el = new window.Audio();
        var done = function (v) { URL.revokeObjectURL(url); ok(v); };
        el.preload = 'metadata';
        el.onloadedmetadata = function () { done(isFinite(el.duration) ? el.duration : 0); };
        el.onerror = function () { done(0); };
        setTimeout(function () { done(0); }, 4000);
        el.src = url;
      } catch (e) { ok(0); }
    });
    var data = new Promise(function (ok, bad) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { bad(new Error('Could not read ' + file.name)); }; fr.readAsDataURL(file); });
    return Promise.all([data, secs]).then(function (r) { return { dataUrl: r[0], seconds: Math.round(r[1] * 10) / 10 }; });
  };
  NVT.fmtSecs = function (s) { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : '–'; };
  NVT.GAME_PALETTES = [['Sakura', '#ff4f8b', '#3cc6c0', '#ffffff'], ['Midnight', '#8fe3df', '#ff6fa3', '#1c1a3a'], ['Forest', '#4c9a73', '#ffd24a', '#f3f7ec'],
    ['Sunset', '#ff9a3c', '#8a6cff', '#2a2238'], ['Candy', '#8a7ad6', '#ff4f8b', '#fff5f8'], ['Paper', '#3b2a1e', '#e5735e', '#fbf3e3']];
  NVT.download = function (blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['feedback', 'Feedback', 'inbox'], ['novels', 'Novels', 'book'], ['reports', 'Reports', 'flag'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.pro, 'on Pro', 'users') +
          stat(d.novels, 'novels', 'novels') + stat(d.published, 'published', 'novels') + stat(d.plays.toLocaleString(), 'plays', 'novels') +
          stat(d.images, 'pictures uploaded', 'novels') + stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.reports_open, 'open reports', 'reports') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : i.kind === 'pro' ? 'good' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>New feedback goes to Prepsto (prepsto.com). Older messages and requests from the app show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Novels</th><th>Pro</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td class="joined muted">' + u.novels + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-pro' + (u.plan === 'pro' ? ' checked' : '') + '> Pro</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    var novelFilter = 'published';
    function novels(query) {
      return UI.api('admin_stories', query || null, novelFilter).then(function (d) {
        body.innerHTML = '<div class="ui-row" style="margin-bottom:14px"><div class="ui-seg">' + [['published', 'Published'], ['featured', 'Featured'], ['hidden', 'Taken down'], ['all', 'All, incl. drafts']].map(function (f) {
          return '<button data-nfilter="' + f[0] + '" class="' + (novelFilter === f[0] ? 'on' : '') + '">' + f[1] + '</button>';
        }).join('') + '</div><form class="ui-row" data-nsearch><input type="search" name="q" placeholder="Title or creator" value="' + esc(query || '') + '" style="max-width:260px"><button class="ui-btn" type="submit" aria-label="Search">' + UI.icon('search') + '</button></form></div>' +
          (d.stories.length ? '<div class="ui-list">' + d.stories.map(function (c) {
            return '<div class="ui-item" data-sid="' + esc(c.id) + '"><div style="width:56px;flex:none">' + NVT.coverHtml(c) + '</div><div class="grow"><h3>' + esc(c.title) +
              (c.demo ? ' <span class="ui-badge">Demo</span>' : '') + (c.reports ? ' <span class="ui-badge bad">' + UI.plural(c.reports, 'report') + '</span>' : '') + '</h3>' +
              '<p class="small muted">by ' + esc(c.author) + ' · ' + esc(c.status) + ' · ' + (c.stats.scenes || 0) + ' scenes · ' + c.plays + ' plays · ♥ ' + c.likes + '</p>' +
              '<div class="ui-row" style="margin-top:8px">' + (c.status !== 'draft' ? '<a class="ui-btn sm" href="#play/' + esc(c.slug) + '" data-go="play/' + esc(c.slug) + '">' + UI.icon('play') + 'Open</a>' : '') +
              '<label class="ui-check"><input type="checkbox" data-feat' + (c.featured ? ' checked' : '') + '> Featured</label>' +
              '<label class="ui-check"><input type="checkbox" data-hide' + (c.hidden ? ' checked' : '') + '> Taken down</label></div></div></div>';
          }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('book') + '<h3>No novels here</h3></div>');
      });
    }
    var repFilter = 'open';
    function reports() {
      return UI.api('list_reports', repFilter).then(function (d) {
        body.innerHTML = '<div class="ui-row" style="margin-bottom:14px"><div class="ui-seg">' + [['open', 'Open'], ['all', 'All']].map(function (f) {
          return '<button data-rfilter="' + f[0] + '" class="' + (repFilter === f[0] ? 'on' : '') + '">' + f[1] + '</button>';
        }).join('') + '</div></div>' +
          (d.reports.length ? '<div class="ad-fb">' + d.reports.map(function (r) {
            return '<div class="ui-item" data-rid="' + esc(r.id) + '"><div class="meta"><span class="ui-badge ' + (r.status === 'open' ? 'bad' : '') + '">' + esc(r.status) + '</span><b>' + esc(r.by) + '</b><span>' + esc(UI.fmtDateTime(r.created)) + '</span></div>' +
              (r.story ? '<p><a href="#play/' + esc(r.story.slug) + '" data-go="play/' + esc(r.story.slug) + '"><b>' + esc(r.story.title) + '</b></a> by ' + esc(r.story.author) + (r.story.hidden ? ' <span class="ui-badge">taken down</span>' : '') + '</p>' : '<p class="muted">(novel deleted)</p>') +
              '<p class="msg">' + esc(r.reason) + '</p>' +
              (r.status === 'open' ? '<div class="ui-row"><button class="ui-btn sm" data-resolve="dismiss">' + UI.icon('check') + 'Nothing wrong</button><button class="ui-btn sm danger" data-resolve="hide">' + UI.icon('eyeoff') + 'Take the novel down</button></div>' : '') + '</div>';
          }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('flag') + '<h3>No ' + (repFilter === 'open' ? 'open ' : '') + 'reports</h3><p>Readers can report a novel from its play page.</p></div>');
      });
    }

    var DRAW = { overview: overview, feedback: feedback, novels: novels, reports: reports, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var nf = e.target.closest('[data-nfilter]');
      if (nf) { novelFilter = nf.getAttribute('data-nfilter'); novels(); return; }
      var rf = e.target.closest('[data-rfilter]');
      if (rf) { repFilter = rf.getAttribute('data-rfilter'); reports(); return; }
      var rs = e.target.closest('[data-resolve]');
      if (rs) { UI.api('resolve_report', rs.closest('[data-rid]').getAttribute('data-rid'), rs.getAttribute('data-resolve')).then(function () { UI.toast('Done', 'ok'); reports(); }); return; }
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var item = e.target.closest('[data-sid]');
      if (item && (e.target.hasAttribute('data-feat') || e.target.hasAttribute('data-hide'))) {
        var box0 = e.target;
        UI.api('admin_set_story', item.getAttribute('data-sid'), box0.hasAttribute('data-feat') ? 'featured' : 'hidden', box0.checked).then(function () { UI.toast('Saved', 'ok'); },
          function (err) { box0.checked = !box0.checked; UI.toast(err.message, 'error'); });
        return;
      }
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      if (box.hasAttribute('data-pro')) {
        UI.api('set_plan', id, box.checked ? 'pro' : 'free').then(function () { UI.toast(box.checked ? 'Pro switched on' : 'Back to Free', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
        return;
      }
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-nsearch]')) { e.preventDefault(); novels(UI.formData(e.target).q); return; }
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== discover.html ===== */
(function () {
  var esc = UI.esc;
  NVT.cardHtml = function (c) {
    var s = c.stats || {};
    return '<a class="dc-card" href="#play/' + esc(c.slug) + '" data-go="play/' + esc(c.slug) + '">' + NVT.coverHtml(c, c.featured ? '<span class="ui-badge brand">' + UI.icon('star') + 'Featured</span>' : '') +
      '<div><h3>' + esc(c.title) + '</h3><div class="dc-by">by ' + esc(c.author) + (c.genre ? ' · ' + esc(c.genre) : '') + '</div></div>' +
      '<div class="dc-nums"><span>' + UI.icon('play') + c.plays.toLocaleString() + '</span><span>' + UI.icon('heart') + c.likes.toLocaleString() + '</span>' +
      '<span>' + UI.icon('flag') + (s.endings || 0) + ' endings</span><span>' + UI.icon('clock') + '~' + (s.minutes || 1) + ' min</span></div></a>';
  };
  UI.page('discover', { title: 'Discover', nav: 'Discover', icon: 'search', order: 20 }, function (view, ctx) {
    var genre = ctx.args[0] || null, q = '', sort = 'popular';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:80px;margin-bottom:16px"></div><div class="ui-grid"><div class="ui-skel" style="height:320px"></div><div class="ui-skel" style="height:320px"></div></div></div>';
    function draw(d) {
      view.innerHTML = '<div class="ui-wrap"><div class="dc-head"><div><div class="eyebrow">Discover</div><h1>Stories with choices</h1><p class="muted" style="margin:6px 0 0">Free to play in your browser. Every choice matters; collect every ending.</p></div>' +
        '<form class="dc-search" data-s><input type="search" name="q" placeholder="Search titles, creators, tags" value="' + esc(q) + '"><button class="ui-btn" type="submit" aria-label="Search">' + UI.icon('search') + '</button></form></div>' +
        '<div class="dc-chips"><button data-genre="" class="' + (genre ? '' : 'on') + '">All</button>' + d.genres.filter(function (g) { return g.count || g.name === genre; }).map(function (g) {
          return '<button data-genre="' + esc(g.name) + '" class="' + (g.name === genre ? 'on' : '') + '">' + esc(g.name) + '<small>' + g.count + '</small></button>';
        }).join('') + '</div>' +
        (d.featured.length ? '<h2 style="margin:6px 0 14px">' + UI.icon('star') + ' Featured</h2><div class="dc-feat">' + d.featured.map(function (c) {
          return '<a class="ui-card dc-f" href="#play/' + esc(c.slug) + '" data-go="play/' + esc(c.slug) + '">' + NVT.coverHtml(c) + '<div><span class="ui-badge">' + esc(c.genre) + '</span><h3>' + esc(c.title) + '</h3><p>' + esc(c.blurb) + '</p>' +
            '<div class="dc-nums" style="margin-top:10px"><span>by ' + esc(c.author) + '</span><span>' + UI.icon('play') + c.plays.toLocaleString() + '</span><span>' + UI.icon('flag') + (c.stats.endings || 0) + ' endings</span></div></div></a>';
        }).join('') + '</div>' : '') +
        '<div class="ui-row between" style="margin-bottom:14px"><h2 style="margin:0">' + (genre ? esc(genre) : q ? 'Results' : 'All novels') + ' <span class="muted" style="font-size:1rem">' + d.total + '</span></h2>' +
        '<select class="dc-sort" data-sort aria-label="Sort">' + [['popular', 'Popular'], ['new', 'Newest'], ['liked', 'Most liked']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sort ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
        (d.stories.length ? '<div class="dc-grid">' + d.stories.map(NVT.cardHtml).join('') + '</div>'
          : '<div class="ui-empty">' + UI.icon('search') + '<h3>No novels found</h3><p>Try another word or genre. Or write the story you wanted to read!</p></div>') +
        '<div class="ui-card dc-cta"><div><h3 style="margin:0">Got a story in you?</h3><p class="muted" style="margin:4px 0 0">Make your own visual novel in the browser, then share it or sell it.</p></div>' +
        '<a class="ui-btn primary" href="#' + (ctx.me ? 'studio' : 'auth/signup') + '" data-go="' + (ctx.me ? 'studio' : 'auth/signup') + '">' + UI.icon('edit') + 'Start creating</a></div></div>';
    }
    function load() { return UI.api('library', q || null, genre, sort).then(draw); }
    view.addEventListener('click', function (e) {
      var g = e.target.closest('[data-genre]');
      if (g) { genre = g.getAttribute('data-genre') || null; try { history.replaceState(null, '', UI.hashFor('discover', genre)); } catch (er) {} load(); }
    });
    view.addEventListener('change', function (e) { if (e.target.matches('[data-sort]')) { sort = e.target.value; load(); } });
    view.addEventListener('submit', function (e) { if (e.target.matches('[data-s]')) { e.preventDefault(); q = UI.formData(e.target).q || ''; load(); } });
    return load();
  });
})();

/* ===== edit.html ===== */
(function () {
  'use strict';
  var esc = UI.esc;
  var TABS = [['map', 'Map', 'map'], ['write', 'Write', 'edit'], ['cast', 'Cast', 'users'], ['pics', 'Pictures', 'image'], ['sounds', 'Sounds', 'music'], ['vars', 'Variables', 'sliders'], ['settings', 'Settings', 'gear']];
  var POS_LABELS = [['farleft', 'Far left'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['farright', 'Far right']];
  var ACCENTS = ['#ff4f8b', '#ff9a3c', '#ffd24a', '#3cc6c0', '#8fe3df', '#8a7ad6', '#5b8def', '#2a2238'];

  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  UI.page('edit', { title: 'Editor', auth: 'user' }, function (view, ctx) {
    var id = ctx.args[0];
    var tab = TABS.some(function (t) { return t[0] === ctx.args[1]; }) ? ctx.args[1] : 'map';
    var selId = ctx.args[2] || null, selStep = null;
    var S = null, D = null;  // S = server reply (story, images, limits); D = the story document being edited
    var dirty = false, saving = false, saveT = null, undo = [], redo = [], lastJson = '', lastPush = 0, openCho = {};
    var cam = { x: 0, y: 0, z: 1, fitted: false }, drag = null, pan = null;

    view.innerHTML = '<div class="ed"><div class="ui-skel" style="height:60px;margin-bottom:14px"></div><div class="ui-skel" style="height:60vh"></div></div>';

    /* ------------------------------------------------------------ helpers */
    function sceneIdx(sid) { for (var i = 0; i < D.scenes.length; i++) if (D.scenes[i].id === sid) return i; return -1; }
    function scene(sid) { return D.scenes[sceneIdx(sid)]; }
    function charById(cid) { return (D.chars || []).filter(function (c) { return c.id === cid; })[0]; }
    function varDef(name) { return (D.vars || []).filter(function (v) { return v.name === name; })[0]; }
    function getPath(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, D); }
    function setPath(path, val) {
      var ks = path.split('.'), o = D;
      for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      o[ks[ks.length - 1]] = val;
    }
    function imgName(key) {
      if (!key) return '';
      var m = (S.images || []).concat(NVT.ART).filter(function (i) { return i.key === key; })[0];
      return m ? m.name : 'Missing picture';
    }
    function picField(path, kind, label) {
      var key = getPath(path);
      return '<button type="button" class="pic-field" data-a="pick" data-path="' + path + '" data-kind="' + kind + '">' +
        (key ? '<img alt="" src="' + esc(NVT.img(key)) + '">' : '<span class="ph"></span>') + '<span>' + esc(key ? imgName(key) : (label || 'Choose a picture')) + '</span></button>';
    }
    function sceneOptions(sel, allowNew, none) {
      return (none ? opt('', none, sel || '') : '') + D.scenes.map(function (s) { return opt(s.id, s.name + (s.ending ? ' ★' : ''), sel); }).join('') + (allowNew ? opt('__new', '＋ New scene…', '') : '');
    }
    function charOptions(sel, narrator) {
      return (narrator ? opt('', 'Narrator', sel || '') : '') + (D.chars || []).map(function (c) { return opt(c.id, NV.plain(c.name, { player: 'You' }), sel); }).join('');
    }
    function poseOptions(cid, sel, keep) {
      var c = charById(cid);
      return (keep ? opt('', keep, sel || '') : '') + (c ? (c.poses || []).map(function (p) { return opt(p.name, p.name, sel); }).join('') : '');
    }
    function varOptions(sel, type) {
      return opt('', 'Choose…', sel || '') + (D.vars || []).filter(function (v) { return !type || v.type === type; }).map(function (v) { return opt(v.name, v.name, sel); }).join('');
    }
    function valInput(path, def, val) {
      if (def && def.type === 'flag') return '<select data-bind="' + path + '" data-type="bools">' + opt('true', 'true', String(!!val)) + opt('false', 'false', String(!!val)) + '</select>';
      return '<input type="' + (def && def.type === 'number' ? 'number' : 'text') + '" class="num" data-bind="' + path + '" data-type="' + (def && def.type === 'number' ? 'num' : 'str') + '" value="' + esc(val == null ? '' : val) + '">';
    }
    function soundOptions(sel, sfx) {
      var built = sfx ? Object.keys(NV.SFX).map(function (k) { return opt(k, NV.SFX[k], sel); }) : Object.keys(NV.TRACKS).map(function (k) { return opt(k, NV.TRACKS[k].name, sel); });
      var want = sfx ? 'sound' : 'music';
      var mine = (S.sounds || []).slice().sort(function (a, b) { return (b.kind === want) - (a.kind === want); }).map(function (x) { return opt(x.key, x.name + ' · ' + NVT.fmtSecs(x.seconds), sel); });
      var missing = NVT.isFile(sel) && !(S.sounds || []).some(function (x) { return x.key === sel; }) ? opt(sel, 'Missing sound (deleted)', sel) : '';
      return '<optgroup label="Built-in">' + built.join('') + '</optgroup>' + (mine.length || missing ? '<optgroup label="Your sounds">' + missing + mine.join('') + '</optgroup>' : '');
    }
    function condCheck(c) { return c ? NV.check(c, (D.vars || []).map(function (v) { return v.name; })) : { ok: true }; }

    /* ------------------------------------------------------------ saving, undo */
    function status(kind, text) {
      var el = view.querySelector('[data-save]');
      if (!el) return;
      el.className = 'ed-save ' + (kind || '');
      el.innerHTML = (kind === 'ok' ? UI.icon('check') : '') + esc(text);
    }
    function change(skipUndo) {
      var now = JSON.stringify(D);
      if (now === lastJson) return;
      if (!skipUndo && Date.now() - lastPush > 900) { undo.push(lastJson); if (undo.length > 80) undo.shift(); redo = []; }
      lastPush = Date.now();
      lastJson = now;
      dirty = true;
      status('', 'Unsaved changes');
      clearTimeout(saveT);
      saveT = setTimeout(save, 1200);
      updateCheck();
    }
    function save() {
      clearTimeout(saveT);
      if (!dirty || saving) return Promise.resolve();
      saving = true; dirty = false;
      status('', 'Saving…');
      return UI.apiQuiet('save_story', id, D).then(function (r) {
        saving = false;
        S.story.stats = r.stats;
        if (S.story.status !== 'draft') S.story.changes = true;
        status('ok', 'Saved');
        drawStatus();
        if (dirty) saveT = setTimeout(save, 800);
      }, function (err) {
        saving = false; dirty = true;
        status('bad', 'Not saved: ' + err.message);
        saveT = setTimeout(save, 6000);
      });
    }
    function doUndo(back) {
      var from = back ? redo : undo, to = back ? undo : redo;
      if (!from.length) { UI.toast(back ? 'Nothing to redo' : 'Nothing to undo'); return; }
      to.push(JSON.stringify(D));
      D = JSON.parse(from.pop());
      lastJson = JSON.stringify(D);
      dirty = true; clearTimeout(saveT); saveT = setTimeout(save, 800);
      status('', 'Unsaved changes');
      drawTab(); updateCheck();
    }
    function beforeUnload(e) { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);

    /* ------------------------------------------------------------ the frame */
    function setUrl() { try { history.replaceState(null, '', UI.hashFor('edit', id, tab, tab === 'write' || tab === 'map' ? selId : null)); } catch (e) {} }
    function drawShell() {
      view.innerHTML = '<div class="ed"><div class="ed-top">' +
        '<a class="ui-btn ghost icon" href="#studio" data-go="studio" aria-label="Back to your studio">' + UI.icon('back') + '</a>' +
        '<div class="ed-title"><input type="text" class="ed-name" data-title maxlength="80" value="' + esc(S.story.title) + '" aria-label="Title"><span data-status></span></div>' +
        '<span class="ed-save ok" data-save>' + UI.icon('check') + 'Saved</span>' +
        '<div class="ed-acts"><button class="ui-btn ghost icon" data-a="undo" title="Undo (Ctrl+Z)" aria-label="Undo">' + UI.icon('undo') + '</button>' +
        '<button class="ui-btn" data-a="check">' + UI.icon('shield') + '<span class="lbl">Check</span><span data-checkn></span></button>' +
        '<button class="ui-btn" data-a="play">' + UI.icon('play') + '<span class="lbl">Playtest</span></button>' +
        '<button class="ui-btn" data-a="export">' + UI.icon('download') + '<span class="lbl">Package &amp; sell</span></button>' +
        '<button class="ui-btn primary" data-a="publish">' + UI.icon('globe') + 'Publish</button></div></div>' +
        '<nav class="ui-tabs ed-tabs">' + TABS.map(function (t) {
          return '<a href="#" data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
        }).join('') + '</nav><div data-body></div></div>';
      drawStatus(); updateCheck();
    }
    function drawStatus() {
      var el = view.querySelector('[data-status]'), st = S.story;
      if (!el) return;
      el.innerHTML = st.status === 'draft' ? '<span class="ui-badge">Draft</span>' :
        '<span class="ui-badge good">' + (st.status === 'public' ? 'Public' : 'Unlisted') + '</span>' + (st.changes ? ' <span class="ui-badge warn" title="Publish again to show readers your latest edits">Unpublished edits</span>' : '');
    }
    function updateCheck() {
      var el = view.querySelector('[data-checkn]');
      if (!el) return;
      var items = NVT.lint(D, S.images, S.sounds), errs = items.filter(function (i) { return i.lvl === 'error'; }).length;
      el.innerHTML = items.length ? ' <span class="count' + (errs ? '' : ' warn') + '">' + items.length + '</span>' : '';
    }
    function drawTab() {
      Array.prototype.forEach.call(view.querySelectorAll('[data-tab]'), function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === tab); });
      var body = view.querySelector('[data-body]');
      if (!body) return;
      if (selId && sceneIdx(selId) < 0) selId = null;
      ({ map: drawMap, write: drawWrite, cast: drawCast, pics: drawPics, sounds: drawSounds, vars: drawVars, settings: drawSettings })[tab](body);
      setUrl();
    }
    function goTab(t, sid) { tab = t; if (sid !== undefined) selId = sid; selStep = null; drawTab(); window.scrollTo(0, 0); }

    /* ------------------------------------------------------------ MAP */
    var NW = 200, NH = 66;
    function drawMap(body) {
      body.innerHTML = '<div class="mp"><div class="mp-canvas" data-canvas><svg data-svg aria-label="Story map"><g data-world></g></svg>' +
        '<div class="mp-tools"><button class="ui-btn primary" data-a="scene-new">' + UI.icon('plus') + 'Scene</button>' +
        '<button class="ui-btn" data-a="tidy" title="Arrange scenes in rows">' + UI.icon('grid') + 'Tidy up</button>' +
        '<button class="ui-btn icon" data-a="zoom-out" aria-label="Zoom out">−</button><button class="ui-btn icon" data-a="zoom-in" aria-label="Zoom in">' + UI.icon('plus') + '</button>' +
        '<button class="ui-btn" data-a="fit">Fit</button></div>' +
        '<div class="mp-legend"><span><i></i>choice</span><span><i class="n"></i>then</span><span><i class="j"></i>jump</span><span><i class="g"></i>game</span></div></div>' +
        '<aside class="mp-side" data-side></aside></div>';
      if (!cam.fitted) { fitMap(); cam.fitted = true; }
      renderWorld(); drawSide();
    }
    function fitMap() {
      var c = view.querySelector('[data-canvas]');
      if (!c || !D.scenes.length) return;
      var xs = D.scenes.map(function (s) { return s.x; }), ys = D.scenes.map(function (s) { return s.y; });
      var minX = Math.min.apply(null, xs) - NW / 2 - 30, maxX = Math.max.apply(null, xs) + NW / 2 + 30, minY = Math.min.apply(null, ys) - NH / 2 - 60, maxY = Math.max.apply(null, ys) + NH / 2 + 50;
      var W = c.clientWidth, H = c.clientHeight - 104;  // room for the toolbar (top) and the legend (bottom)
      cam.z = Math.max(0.3, Math.min(1.2, Math.min(W / (maxX - minX), H / (maxY - minY))));
      cam.x = W / 2 - (minX + maxX) / 2 * cam.z;
      cam.y = 60 + H / 2 - (minY + maxY) / 2 * cam.z;
    }
    function applyCam() { var w = view.querySelector('[data-world]'); if (w) w.setAttribute('transform', 'translate(' + cam.x + ' ' + cam.y + ') scale(' + cam.z + ')'); }
    function renderWorld() {
      var w = view.querySelector('[data-world]');
      if (!w) return;
      var lint = NVT.lint(D, S.images, S.sounds), bad = {};
      lint.forEach(function (i) { if (i.scene && i.lvl === 'error') bad[i.scene] = 1; });
      var edges = '', nodes = '';
      D.scenes.forEach(function (s) {
        NVT.targets(s).forEach(function (t, ti) {
          var o = scene(t.to);
          if (!o) return;
          var x1 = s.x, y1 = s.y + NH / 2, x2 = o.x, y2 = o.y - NH / 2, dy = Math.max(50, Math.abs(y2 - y1) / 2);
          if (y2 < y1) { dy = 120; }
          var mx = (x1 + x2) / 2 + (y2 < y1 ? 140 : 0), my = (y1 + y2) / 2;
          var d = 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + dy) + ' ' + x2 + ' ' + (y2 - dy) + ' ' + x2 + ' ' + y2;
          var label = t.kind === 'choice' ? NV.plain(t.label, {}) : t.kind === 'jump' ? t.label : '';
          if (label.length > 24) label = label.slice(0, 23) + '…';
          edges += '<g class="mp-e ' + t.kind + (t.cond ? ' cond' : '') + '"><path d="' + d + '" marker-end="url(#ar)"/>' +
            (label && cam.z > 0.55 ? '<rect x="' + (mx - label.length * 3.3 - 8) + '" y="' + (my - 10 + ti * 0) + '" width="' + (label.length * 6.6 + 16) + '" height="20" rx="10"/><text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle">' + esc(label) + '</text>' : '') + '</g>';
        });
      });
      D.scenes.forEach(function (s) {
        var e = s.ending, st = NVT.stats({ scenes: [s] });
        var sub = e ? '★ ' + (NV.ENDING_KINDS[e.kind] || 'Ending') : st.lines + ' lines · ' + (s.choices || []).length + ' choices';
        var name = s.name.length > 22 ? s.name.slice(0, 21) + '…' : s.name;
        nodes += '<g class="mp-n' + (s.id === selId ? ' sel' : '') + (e ? ' end k-' + e.kind : '') + '" data-node="' + esc(s.id) + '" transform="translate(' + s.x + ' ' + s.y + ')">' +
          '<rect class="sh" x="' + (-NW / 2) + '" y="' + (-NH / 2 + 4) + '" width="' + NW + '" height="' + NH + '" rx="18"/>' +
          '<rect class="box" x="' + (-NW / 2) + '" y="' + (-NH / 2) + '" width="' + NW + '" height="' + NH + '" rx="18"/>' +
          '<text class="t" x="0" y="-4" text-anchor="middle">' + esc(name) + '</text><text class="s" x="0" y="17" text-anchor="middle">' + esc(sub) + '</text>' +
          (s.id === D.start ? '<g class="badge" transform="translate(' + (-NW / 2 + 14) + ' ' + (-NH / 2 - 8) + ')"><rect x="0" y="-9" width="48" height="18" rx="9"/><text x="24" y="4" text-anchor="middle">START</text></g>' : '') +
          (bad[s.id] ? '<circle class="warn" cx="' + (NW / 2 - 6) + '" cy="' + (-NH / 2 + 6) + '" r="8"/>' : '') + '</g>';
      });
      var svg = view.querySelector('[data-svg]');
      if (!svg.querySelector('defs')) svg.insertAdjacentHTML('afterbegin', '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor" style="color:var(--c-ink)"/></marker></defs>');
      w.innerHTML = edges + nodes;
      applyCam();
    }
    function drawSide() {
      var side = view.querySelector('[data-side]');
      if (!side) return;
      var s = selId && scene(selId);
      if (!s) {
        var st = NVT.stats(D);
        side.innerHTML = '<div class="ui-card"><h3>Your story map</h3><p class="muted small">Each card is a scene. Lines show where choices lead. Drag cards to arrange them; tap one to see it here, double-tap to write it.</p>' +
          '<div class="mp-stats"><div><b>' + st.scenes + '</b><span>scenes</span></div><div><b>' + st.choices + '</b><span>choices</span></div><div><b>' + st.endings + '</b><span>endings</span></div>' +
          '<div><b>' + st.words + '</b><span>words</span></div><div><b>' + st.lines + '</b><span>lines</span></div><div><b>~' + st.minutes + '</b><span>min read</span></div></div></div>' +
          '<div class="ui-card"><h3>Tips</h3><ul class="cheat" style="padding-left:18px;margin:0">' +
          '<li><b>Branch:</b> select a scene, then "Add a choice to a new scene".</li><li><b>Endings:</b> mark final scenes as endings. Readers collect them.</li>' +
          '<li><b>Small changes:</b> give a single line a condition (Write tab) instead of copying the whole scene.</li><li><b>Loops:</b> "once" choices make "ask about…" menus that empty as you go.</li></ul></div>';
        return;
      }
      var into = D.scenes.filter(function (o) { return NVT.targets(o).some(function (t) { return t.to === s.id; }); });
      var outs = NVT.targets(s);
      side.innerHTML = '<div class="ui-card">' + (s.id === D.start ? '<span class="ui-badge mint">Start</span> ' : '') + (s.ending ? '<span class="ui-badge k-' + s.ending.kind + '"><span class="nv-kind"></span>' + esc(NV.ENDING_KINDS[s.ending.kind]) + '</span>' : '') +
        '<h3 style="margin-top:6px">' + esc(s.name) + '</h3><p class="muted small" style="margin:0">' + UI.plural(NVT.stats({ scenes: [s] }).lines, 'line') + ' · ' + UI.plural((s.choices || []).length, 'choice') + '</p>' +
        (outs.length ? '<h4 style="margin:14px 0 0">Leads to</h4><ul class="mp-links">' + outs.map(function (t) {
          var o = scene(t.to);
          return '<li>' + (t.kind === 'choice' ? '›' : t.kind === 'jump' ? '⤳' : '↓') + ' <span>' + (t.kind === 'choice' ? '“' + esc(NV.plain(t.label, {})) + '” → ' : t.kind === 'jump' ? esc(t.label) + ' → ' : 'then → ') + '<a data-a="select" data-id="' + esc(t.to) + '">' + esc(o ? o.name : '?') + '</a></span></li>';
        }).join('') + '</ul>' : '') +
        (into.length ? '<h4 style="margin:12px 0 0">Comes from</h4><ul class="mp-links">' + into.map(function (o) { return '<li>‹ <a data-a="select" data-id="' + esc(o.id) + '">' + esc(o.name) + '</a></li>'; }).join('') + '</ul>' : '') +
        '<div class="mp-btns"><button class="ui-btn primary" data-a="write" data-id="' + esc(s.id) + '">' + UI.icon('edit') + 'Write this scene</button>' +
        '<button class="ui-btn" data-a="play-from" data-id="' + esc(s.id) + '">' + UI.icon('play') + 'Playtest from here</button>' +
        (s.ending ? '' : '<button class="ui-btn" data-a="branch" data-id="' + esc(s.id) + '">' + UI.icon('jump') + 'Add a choice to a new scene</button>') +
        (s.id === D.start ? '' : '<button class="ui-btn" data-a="scene-start" data-id="' + esc(s.id) + '">' + UI.icon('flag') + 'Set as start</button>') +
        '<button class="ui-btn" data-a="scene-dup" data-id="' + esc(s.id) + '">' + UI.icon('copy') + 'Duplicate</button>' +
        '<button class="ui-btn danger" data-a="scene-del" data-id="' + esc(s.id) + '">' + UI.icon('trash') + 'Delete</button></div></div>';
    }
    function svgPoint(e) {
      var r = view.querySelector('[data-svg]').getBoundingClientRect();
      return { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z, sx: e.clientX - r.left, sy: e.clientY - r.top };
    }
    function zoomAt(f, sx, sy) {
      var c = view.querySelector('[data-canvas]');
      if (sx == null) { sx = c.clientWidth / 2; sy = c.clientHeight / 2; }
      var nz = Math.max(0.25, Math.min(2, cam.z * f));
      cam.x = sx - (sx - cam.x) * (nz / cam.z); cam.y = sy - (sy - cam.y) * (nz / cam.z); cam.z = nz;
      renderWorld();
    }
    view.addEventListener('pointerdown', function (e) {
      var svg = e.target.closest('[data-svg]');
      if (!svg || e.button > 0) return;
      var n = e.target.closest('[data-node]');
      if (n) {
        var s = scene(n.getAttribute('data-node')), p = svgPoint(e);
        drag = { id: s.id, dx: p.x - s.x, dy: p.y - s.y, cx: e.clientX, cy: e.clientY, moved: false };
      } else {
        pan = { cx: e.clientX, cy: e.clientY, x: cam.x, y: cam.y, moved: false };
        svg.classList.add('panning');
      }
      try { svg.setPointerCapture(e.pointerId); } catch (er) {}
    });
    view.addEventListener('pointermove', function (e) {
      if (drag) {
        if (Math.abs(e.clientX - drag.cx) + Math.abs(e.clientY - drag.cy) > 5) drag.moved = true;
        if (!drag.moved) return;
        var s = scene(drag.id), p = svgPoint(e);
        s.x = Math.round((p.x - drag.dx) / 10) * 10; s.y = Math.round((p.y - drag.dy) / 10) * 10;
        renderWorld();
      } else if (pan) {
        if (Math.abs(e.clientX - pan.cx) + Math.abs(e.clientY - pan.cy) > 4) pan.moved = true;
        cam.x = pan.x + e.clientX - pan.cx; cam.y = pan.y + e.clientY - pan.cy;
        applyCam();
      }
    });
    function endPointer() {
      if (drag) {
        if (drag.moved) change(); else { selId = drag.id; renderWorld(); drawSide(); setUrl(); }
        drag = null;
      }
      if (pan) {
        var svg = view.querySelector('[data-svg]');
        if (svg) svg.classList.remove('panning');
        if (!pan.moved && selId) { selId = null; renderWorld(); drawSide(); setUrl(); }
        pan = null;
      }
    }
    view.addEventListener('pointerup', endPointer);
    view.addEventListener('pointercancel', endPointer);
    view.addEventListener('dblclick', function (e) { var n = e.target.closest('[data-node]'); if (n) goTab('write', n.getAttribute('data-node')); });
    view.addEventListener('wheel', function (e) {
      if (!e.target.closest('[data-svg]')) return;
      e.preventDefault();
      var p = svgPoint(e);
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.sx, p.sy);
    }, { passive: false });

    function newScene(name, near) {
      var base = near ? { x: near.x, y: near.y + 170 } : { x: 0, y: D.scenes.length ? Math.max.apply(null, D.scenes.map(function (s) { return s.y; })) + 170 : 0 };
      var spot = NVT.freeSpot(D, base.x, base.y);
      var s = { id: NVT.uid('s'), name: name || 'New scene', x: spot.x, y: spot.y, note: '', steps: [{ t: 'say', who: null, text: '', k: NVT.uid('k') }], choices: [], next: null, ending: null, timer: 0, timeout: null };
      D.scenes.push(s);
      if (!D.start) D.start = s.id;
      return s;
    }

    /* ------------------------------------------------------------ WRITE */
    function drawWrite(body) {
      if (!selId || !scene(selId)) selId = D.start || (D.scenes[0] && D.scenes[0].id) || null;
      var list = D.scenes.slice().sort(function (a, b) { return (a.id === D.start ? -1 : 0) - (b.id === D.start ? -1 : 0) || a.y - b.y || a.x - b.x; });
      body.innerHTML = '<div class="wr-mobile"><select data-a-sel="scene">' + list.map(function (s) { return opt(s.id, s.name + (s.ending ? ' ★' : ''), selId); }).join('') + '</select>' +
        '<button class="ui-btn" data-a="scene-new">' + UI.icon('plus') + 'Scene</button></div>' +
        '<div class="wr"><aside class="wr-list"><button class="ui-btn primary sm" data-a="scene-new" style="justify-self:start;margin-bottom:4px">' + UI.icon('plus') + 'New scene</button>' +
        list.map(function (s) {
          return '<button type="button" class="wr-scene' + (s.id === selId ? ' on' : '') + (s.ending ? ' k-' + s.ending.kind : '') + '" data-a="select-w" data-id="' + esc(s.id) + '">' +
            (s.ending ? '<span class="nv-kind" style="flex:none"></span>' : '') + '<span>' + esc(s.name) + '</span>' + (s.id === D.start ? '<i class="flag">START</i>' : '') + '</button>';
        }).join('') + '</aside><section data-main></section>' +
        '<aside class="wr-prev"><div class="ed-pv" data-pv></div><p class="small muted" style="margin:0">Preview of the selected step. Characters and background carry over from the scene before.</p>' +
        '<button class="ui-btn" data-a="play-from" data-id="' + esc(selId || '') + '">' + UI.icon('play') + 'Playtest from this scene</button></aside></div>';
      drawScene();
    }
    function drawPreview() {
      var pv = view.querySelector('[data-pv]'), s = selId && scene(selId);
      if (!pv || !s || getComputedStyle(pv.parentNode).display === 'none') return;
      ED.preview(pv, D, s, selStep);
    }
    function stepHtml(si, i, x) {
      var p = 'scenes.' + si + '.steps.' + i + '.', meta = ED.STEPS[x.t] || ['Step', 'sparkle'], b = '';
      if (x.t === 'say') {
        var c = charById(x.who);
        b = '<div class="st-row"><select data-bind="' + p + 'who" data-rr aria-label="Who speaks">' + charOptions(x.who, true) + '</select>' +
          (c && (c.poses || []).length ? '<select data-bind="' + p + 'pose" aria-label="Expression">' + poseOptions(x.who, x.pose, 'Same face') + '</select>' : '') + '</div>' +
          '<textarea data-bind="' + p + 'text" rows="2" placeholder="' + (c ? 'What does ' + esc(NV.plain(c.name, { player: 'you' })) + ' say?' : 'What happens? (narration)') + '">' + esc(x.text || '') + '</textarea>';
      } else if (x.t === 'bg') {
        b = '<div class="st-row">' + picField(p + 'img', 'bg') + '<select data-bind="' + p + 'fx" aria-label="Transition">' + [['dissolve', 'Dissolve'], ['fade', 'Fade'], ['none', 'Instant']].map(function (o) { return opt(o[0], o[1], x.fx); }).join('') + '</select></div>';
      } else if (x.t === 'show') {
        b = '<div class="st-row"><select data-bind="' + p + 'char" data-rr aria-label="Character">' + opt('', 'Choose…', x.char || '') + charOptions(x.char) + '</select>' +
          '<select data-bind="' + p + 'pose" aria-label="Expression">' + poseOptions(x.char, x.pose) + '</select></div><div class="st-row">' +
          '<select data-bind="' + p + 'pos" aria-label="Position">' + POS_LABELS.map(function (o) { return opt(o[0], o[1], x.pos); }).join('') + '</select>' +
          '<select data-bind="' + p + 'fx" aria-label="Transition">' + [['dissolve', 'Dissolve in'], ['slide', 'Slide in'], ['pop', 'Pop in'], ['none', 'Instant']].map(function (o) { return opt(o[0], o[1], x.fx); }).join('') + '</select></div>';
      } else if (x.t === 'hide') {
        b = '<div class="st-row"><select data-bind="' + p + 'char" aria-label="Character">' + opt('', 'Choose…', x.char || '') + charOptions(x.char) + '</select>' +
          '<select data-bind="' + p + 'fx">' + [['dissolve', 'Dissolve out'], ['slide', 'Slide out'], ['none', 'Instant']].map(function (o) { return opt(o[0], o[1], x.fx); }).join('') + '</select></div>';
      } else if (x.t === 'set') {
        var d = varDef(x.var);
        b = '<div class="st-row"><select data-bind="' + p + 'var" data-rr aria-label="Variable">' + varOptions(x.var) + '</select>' +
          '<select data-bind="' + p + 'op" aria-label="How">' + (d && d.type === 'number' ? [['+', 'add'], ['-', 'subtract'], ['=', 'set to']] : d && d.type === 'flag' ? [['=', 'set to'], ['toggle', 'flip']] : [['=', 'set to']]).map(function (o) { return opt(o[0], o[1], x.op); }).join('') + '</select>' +
          (x.op === 'toggle' ? '' : valInput(p + 'val', d, x.val)) + '</div>' + (!(D.vars || []).length ? '<p class="ui-hint">Add a variable in the Variables tab first.</p>' : '');
      } else if (x.t === 'jump') {
        b = '<div class="st-row"><select data-bind="' + p + 'to" data-newscene aria-label="Jump to">' + sceneOptions(x.to, true, 'Choose a scene…') + '</select></div>';
      } else if (x.t === 'cg') {
        b = '<div class="st-row">' + picField(p + 'img', 'cg', 'Hide the illustration') + '</div><p class="ui-hint">Illustrations cover the whole stage and unlock in the reader\'s Gallery. Pick "No picture" to hide it again.</p>';
      } else if (x.t === 'music') {
        b = '<div class="st-row"><select data-bind="' + p + 'track" aria-label="Music">' + opt('', 'Stop the music', x.track || '') + soundOptions(x.track, false) + '</select>' +
          '<button class="ui-btn sm" data-a="try-music" data-path="' + p + 'track">' + UI.icon('play') + 'Listen</button></div>' +
          ((S.sounds || []).length ? '' : '<p class="ui-hint" style="margin:0">Upload your own music in the Sounds tab.</p>');
      } else if (x.t === 'sfx') {
        b = '<div class="st-row"><select data-bind="' + p + 'name">' + soundOptions(x.name, true) + '</select>' +
          '<button class="ui-btn sm" data-a="try-sfx" data-path="' + p + 'name">' + UI.icon('play') + 'Listen</button></div>';
      } else if (x.t === 'fx') {
        b = '<div class="st-row"><select data-bind="' + p + 'name">' + [['shake', 'Screen shake'], ['flash', 'White flash'], ['fade', 'Fade to black and back']].map(function (o) { return opt(o[0], o[1], x.name); }).join('') + '</select></div>';
      } else if (x.t === 'wait') {
        b = '<div class="st-row"><input type="number" class="num" min="0.2" max="60" step="0.1" data-bind="' + p + 'secs" data-type="num" value="' + esc(x.secs) + '"><span class="muted small">seconds (a click skips it)</span></div>';
      } else if (x.t === 'input') {
        b = '<div class="st-row"><input type="text" data-bind="' + p + 'prompt" placeholder="Question" value="' + esc(x.prompt || '') + '"></div><div class="st-row"><span class="small muted">Save the answer in</span><select data-bind="' + p + 'var">' + varOptions(x.var, 'text') + '</select>' +
          '<input type="text" data-bind="' + p + 'dflt" placeholder="Default answer" value="' + esc(x.dflt || '') + '"></div>';
      } else if (x.t === 'card') {
        b = '<div class="st-row"><input type="text" data-bind="' + p + 'title" placeholder="Chapter title" value="' + esc(x.title || '') + '"><input type="text" data-bind="' + p + 'sub" placeholder="Subtitle (optional)" value="' + esc(x.sub || '') + '"></div>';
      } else if (x.t === 'game') {
        var gm = NV.GAMES[x.game] || NV.GAMES.timing, flags = (D.vars || []).filter(function (v) { return v.type === 'flag'; });
        b = '<div class="st-row"><select data-bind="' + p + 'game" data-rr aria-label="Game">' + Object.keys(NV.GAMES).map(function (k) { return opt(k, NV.GAMES[k][0], x.game); }).join('') + '</select>' +
          '<select data-bind="' + p + 'diff" data-type="num" aria-label="Difficulty">' + [[0, 'Easy'], [1, 'Normal'], [2, 'Hard']].map(function (o) { return opt(o[0], o[1], x.diff || 0); }).join('') + '</select>' +
          '<button class="ui-btn sm primary" data-a="game-try" data-i="' + i + '">' + UI.icon('play') + 'Try it</button></div>' +
          '<p class="ui-hint" style="margin:0">' + esc(gm[1]) + '</p>' +
          '<div class="st-row"><input type="text" data-bind="' + p + 'title" maxlength="80" placeholder="Title: ' + esc(gm[0]) + '" value="' + esc(x.title || '') + '">' +
          '<input type="text" data-bind="' + p + 'prompt" maxlength="200" placeholder="Instructions (optional)" value="' + esc(x.prompt || '') + '"></div>' +
          '<div class="st-row">' + [['c1', 'Main'], ['c2', 'Accent'], ['c3', 'Panel']].map(function (c) {
            return '<label class="gcol"><input type="color" data-bind="' + p + c[0] + '" value="' + esc(x[c[0]] || '#ffffff') + '">' + c[1] + '</label>';
          }).join('') + NVT.GAME_PALETTES.map(function (pl, k) {
            return '<button type="button" class="gpal" data-a="game-pal" data-i="' + i + '" data-p="' + k + '" title="' + pl[0] + '" aria-label="' + pl[0] + ' colours"><i style="background:' + pl[1] + '"></i><i style="background:' + pl[2] + '"></i><i style="background:' + pl[3] + '"></i></button>';
          }).join('') + '</div>' +
          '<div class="st-row"><span class="small muted">If they win</span><select data-bind="' + p + 'win" data-newscene data-label="' + esc((x.title || gm[0]) + ': won') + '">' + sceneOptions(x.win, true, 'Carry on in this scene') + '</select></div>' +
          '<div class="st-row"><span class="small muted">If they lose</span><select data-bind="' + p + 'lose" data-newscene data-label="' + esc((x.title || gm[0]) + ': lost') + '">' + sceneOptions(x.lose, true, 'Carry on in this scene') + '</select></div>' +
          '<div class="st-row"><span class="small muted">Remember it in</span><select data-bind="' + p + 'var" aria-label="Result variable">' + opt('', flags.length ? 'Nothing' : 'Nothing (add a yes / no variable first)', x.var || '') +
          flags.map(function (v) { return opt(v.name, v.name + ' (true if they win)', x.var); }).join('') + '</select></div>' +
          '<div class="st-row"><label class="ui-check"><input type="checkbox" data-bind="' + p + 'retry" data-type="bool"' + (x.retry ? ' checked' : '') + '> Offer "Try again" after a loss</label>' +
          '<label class="ui-check"><input type="checkbox" data-bind="' + p + 'skip" data-type="bool"' + (x.skip !== false ? ' checked' : '') + '> Let readers skip it (counts as a loss)</label></div>';
      } else if (x.t === 'note') {
        b = '<div class="st-note"><textarea data-bind="' + p + 'text" rows="2" placeholder="A note to yourself. Readers never see it.">' + esc(x.text || '') + '</textarea></div>';
      }
      var hasIf = x.if != null && x.if !== '' || x.t === 'jump';
      var cc = condCheck(x.if);
      b += hasIf || x._if ? '<div class="st-if">' + (x.t === 'jump' ? 'Jump only if' : 'Only if') + '<input type="text" data-bind="' + p + 'if" data-cond class="' + (cc.ok ? '' : 'cond-bad') + '" placeholder="' + (x.t === 'jump' ? 'always (leave empty)' : 'e.g. trust >= 2') + '" value="' + esc(x.if || '') + '"></div>' + (cc.ok ? '' : '<div class="cond-msg">' + esc(cc.error) + '</div>') : '';
      return '<div class="st st-' + x.t + (selStep === i ? ' sel' : '') + '" data-step="' + i + '"><div class="st-k">' + UI.icon(meta[1]) + '<span>' + esc(meta[0]) + '</span></div><div class="st-b">' + b + '</div>' +
        '<div class="st-m"><button type="button" data-a="step-if" data-i="' + i + '" title="Only if… (condition)" aria-label="Add a condition">' + UI.icon('filter') + '</button>' +
        '<button type="button" data-a="step-up" data-i="' + i + '" aria-label="Move up">' + UI.icon('up') + '</button><button type="button" data-a="step-down" data-i="' + i + '" aria-label="Move down">' + UI.icon('chevron') + '</button>' +
        '<button type="button" data-a="step-dup" data-i="' + i + '" aria-label="Duplicate">' + UI.icon('copy') + '</button><button type="button" data-a="step-del" data-i="' + i + '" aria-label="Delete">' + UI.icon('trash') + '</button></div></div>';
    }
    function choiceHtml(si, ci, c, sc) {
      var p = 'scenes.' + si + '.choices.' + ci + '.', cc = condCheck(c.if);
      var open = openCho[c.id] || c.if || (c.set || []).length || c.once;
      return '<div class="cho" data-cho="' + ci + '"><div class="cho-top"><span class="cho-n">' + (ci + 1) + '</span>' +
        '<input type="text" data-bind="' + p + 'text" maxlength="300" placeholder="What the reader can choose" value="' + esc(c.text || '') + '">' +
        '<span class="ui-row" style="gap:2px"><button class="ui-btn ghost icon sm" data-a="cho-up" data-i="' + ci + '" aria-label="Move up">' + UI.icon('up') + '</button>' +
        '<button class="ui-btn ghost icon sm" data-a="cho-del" data-i="' + ci + '" aria-label="Delete choice">' + UI.icon('trash') + '</button></span></div>' +
        '<div class="cho-to">' + UI.icon('arrow') + 'Leads to <select data-bind="' + p + 'to" data-newscene data-label="' + esc(c.text || '') + '">' + sceneOptions(c.to, true, 'Choose a scene…') + '</select>' +
        (c.to && scene(c.to) ? '<button class="ui-btn ghost sm" data-a="select-w" data-id="' + esc(c.to) + '">Open ' + UI.icon('arrow') + '</button>' : '') + '</div>' +
        '<details data-cid="' + esc(c.id) + '"' + (open ? ' open' : '') + '><summary>Conditions &amp; effects' + (c.if ? ' · if ' + esc(c.if) : '') + ((c.set || []).length ? ' · ' + UI.plural(c.set.length, 'effect') : '') + (c.once ? ' · once' : '') + '</summary><div class="cho-more">' +
        '<label class="ui-field"><span>Only show it if <em>(leave empty for always)</em></span><input type="text" data-bind="' + p + 'if" data-cond class="' + (cc.ok ? '' : 'cond-bad') + '" placeholder="e.g. courage >= 2 and not angry" value="' + esc(c.if || '') + '"></label>' +
        (cc.ok ? '' : '<div class="cond-msg">' + esc(cc.error) + '</div>') +
        (c.if ? '<div class="st-row"><select data-bind="' + p + 'mode" data-rr>' + opt('hide', 'Otherwise hide it', c.mode) + opt('lock', 'Otherwise show it locked', c.mode) + '</select>' +
          (c.mode === 'lock' ? '<input type="text" data-bind="' + p + 'hint" maxlength="120" placeholder="Hint, e.g. Needs more courage" value="' + esc(c.hint || '') + '">' : '') + '</div>' : '') +
        '<div><span class="small" style="font-weight:800">When picked</span>' + (c.set || []).map(function (f, fi) {
          var d = varDef(f.var), fp = p + 'set.' + fi + '.';
          return '<div class="eff" style="margin-top:6px"><select data-bind="' + fp + 'var" data-rr>' + varOptions(f.var) + '</select>' +
            '<select data-bind="' + fp + 'op">' + (d && d.type === 'number' ? [['+', 'add'], ['-', 'subtract'], ['=', 'set to']] : d && d.type === 'flag' ? [['=', 'set to'], ['toggle', 'flip']] : [['=', 'set to']]).map(function (o) { return opt(o[0], o[1], f.op); }).join('') + '</select>' +
            valInput(fp + 'val', d, f.val) + '<button class="ui-btn ghost icon sm" data-a="eff-del" data-i="' + ci + '" data-j="' + fi + '" aria-label="Remove">' + UI.icon('x') + '</button></div>';
        }).join('') + '<button class="ui-btn sm" style="margin-top:8px" data-a="eff-add" data-i="' + ci + '">' + UI.icon('plus') + 'Change a variable</button></div>' +
        '<label class="ui-check"><input type="checkbox" data-bind="' + p + 'once" data-type="bool"' + (c.once ? ' checked' : '') + '> Can be picked only once (good for "ask about…" menus that loop back here)</label>' +
        '</div></details></div>';
    }
    function drawScene() {
      var main = view.querySelector('[data-main]');
      if (!main) return;
      var si = sceneIdx(selId), s = D.scenes[si];
      if (!s) { main.innerHTML = '<div class="ui-empty">' + UI.icon('edit') + '<h3>No scenes yet</h3><button class="ui-btn primary" data-a="scene-new">' + UI.icon('plus') + 'Add the first scene</button></div>'; return; }
      var p = 'scenes.' + si + '.', e = s.ending;
      var html = '<div class="sc-head"><input type="text" class="sc-name" data-bind="' + p + 'name" maxlength="80" value="' + esc(s.name) + '" aria-label="Scene name">' +
        '<div class="sc-chips">' + (s.id === D.start ? '<span class="ui-badge mint">' + UI.icon('flag') + 'Starting scene</span>' : '<button class="ui-btn sm" data-a="scene-start" data-id="' + esc(s.id) + '">' + UI.icon('flag') + 'Set as start</button>') +
        '<select data-a-sel="ending" aria-label="Ending">' + opt('', 'Not an ending', e ? e.kind : '') + Object.keys(NV.ENDING_KINDS).map(function (k) { return opt(k, '★ ' + NV.ENDING_KINDS[k], e ? e.kind : ''); }).join('') + '</select>' +
        '<button class="ui-btn sm" data-a="play-from" data-id="' + esc(s.id) + '">' + UI.icon('play') + 'Playtest</button>' +
        '<button class="ui-btn sm" data-a="scene-dup" data-id="' + esc(s.id) + '">' + UI.icon('copy') + 'Duplicate</button>' +
        '<button class="ui-btn sm danger" data-a="scene-del" data-id="' + esc(s.id) + '">' + UI.icon('trash') + 'Delete</button></div></div>';
      html += '<div class="sc-steps">' + (s.steps || []).map(function (x, i) { return stepHtml(si, i, x); }).join('') + '</div>';
      html += '<div class="sc-add"><button class="ui-btn primary" data-a="add-step" data-t="say">' + UI.icon('chat') + 'Line</button>' +
        '<button class="ui-btn" data-a="add-step" data-t="bg">' + UI.icon('image') + 'Background</button><button class="ui-btn" data-a="add-step" data-t="show">' + UI.icon('user') + 'Character</button>' +
        '<button class="ui-btn" data-a="add-step" data-t="set">' + UI.icon('sliders') + 'Variable</button>' +
        '<select data-a-sel="add" aria-label="Add something else">' + opt('', 'More…', '') + ED.ADD_ORDER.map(function (t) { return opt(t, ED.STEPS[t][0], ''); }).join('') + '</select>' +
        (selStep != null ? '<span class="small muted">adds after step ' + (selStep + 1) + '</span>' : '') + '</div>';
      if (e) {
        html += '<div class="sc-sec"><h3>Ending</h3></div><div class="sc-ending k-' + e.kind + '"><div class="st-row"><select data-bind="' + p + 'ending.kind" data-rr>' +
          Object.keys(NV.ENDING_KINDS).map(function (k) { return opt(k, NV.ENDING_KINDS[k], e.kind); }).join('') + '</select>' +
          '<input type="text" data-bind="' + p + 'ending.title" maxlength="80" placeholder="Ending title" value="' + esc(e.title || '') + '"></div>' +
          '<textarea data-bind="' + p + 'ending.text" maxlength="600" rows="2" placeholder="A last line on the ending card (optional)">' + esc(e.text || '') + '</textarea>' +
          '<p class="ui-hint" style="margin:0">After this scene\'s steps, the story ends here and readers unlock this ending.</p></div>';
      } else {
        html += '<div class="sc-sec"><h3>Choices</h3><span class="small muted">' + ((s.choices || []).length ? 'Shown after the last step.' : 'No choices: the story continues with "then go to".') + '</span></div>' +
          '<div class="sc-steps">' + (s.choices || []).map(function (c, ci) { return choiceHtml(si, ci, c, s); }).join('') + '</div>' +
          '<div class="sc-add"><button class="ui-btn" data-a="cho-add">' + UI.icon('plus') + 'Add a choice</button></div>' +
          '<div class="sc-tail"><div class="ui-card"><label class="ui-field"><span>' + ((s.choices || []).length ? 'If no choice can be shown, go to' : 'Then go to') + '</span>' +
          '<select data-bind="' + p + 'next" data-newscene>' + sceneOptions(s.next, true, (s.choices || []).length ? 'Nowhere (the story stops)' : 'Nowhere (The End)') + '</select></label></div>' +
          ((s.choices || []).length ? '<div class="ui-card"><span style="font-weight:800">' + UI.icon('clock') + ' Timed choice</span><div class="st-row"><input type="number" class="num" min="0" max="60" data-bind="' + p + 'timer" data-type="num" data-rr value="' + esc(s.timer || 0) + '"><span class="small muted">seconds (0 = no timer)</span>' +
            (s.timer ? '<span class="small muted">then pick</span><select data-bind="' + p + 'timeout">' + opt('', 'the first one', s.timeout || '') + (s.choices || []).map(function (c, i) { return opt(c.id, (i + 1) + '. ' + (c.text || '…'), s.timeout); }).join('') + '</select>' : '') + '</div></div>' : '') + '</div>';
      }
      html += '<details style="margin-top:16px"><summary class="small" style="font-weight:800;cursor:pointer">Writer\'s note for this scene</summary><textarea data-bind="' + p + 'note" rows="3" style="margin-top:8px" placeholder="Ideas, reminders, to-dos. Readers never see this.">' + esc(s.note || '') + '</textarea></details>';
      main.innerHTML = html;
      drawPreview();
    }

    /* ------------------------------------------------------------ CAST */
    function usesOfChar(cid) {
      var n = 0;
      D.scenes.forEach(function (s) { (s.steps || []).forEach(function (x) { if (x.who === cid || x.char === cid) n++; }); });
      return n;
    }
    function drawCast(body) {
      body.innerHTML = '<div class="ui-page-head"><div><h2 style="margin:0">Cast</h2><p class="muted">Characters, their name colour and a picture for each expression. Use <code>[player]</code> in a name to show the reader\'s name.</p></div>' +
        '<div class="ui-row"><button class="ui-btn" data-a="cast-starter">' + UI.icon('sparkle') + 'Add from the starter cast</button><button class="ui-btn primary" data-a="char-add">' + UI.icon('plus') + 'New character</button></div></div>' +
        ((D.chars || []).length ? '<div class="cast">' + D.chars.map(function (c, ci) {
          var p = 'chars.' + ci + '.';
          return '<div class="ui-card"><div class="cast-head"><input type="color" data-bind="' + p + 'color" value="' + esc(c.color) + '" aria-label="Name colour">' +
            '<input type="text" data-bind="' + p + 'name" maxlength="40" value="' + esc(c.name) + '" aria-label="Name"><button class="ui-btn ghost icon" data-a="char-del" data-i="' + ci + '" aria-label="Delete character">' + UI.icon('trash') + '</button></div>' +
            '<p class="small muted" style="margin:8px 0 0">Used in ' + UI.plural(usesOfChar(c.id), 'line or step', 'lines or steps') + '.</p>' +
            '<div class="poses">' + (c.poses || []).map(function (ps, pi) {
              var pp = p + 'poses.' + pi + '.';
              return '<div class="pose"><button type="button" class="pv" data-a="pick" data-path="' + pp + 'img" data-kind="sprite" aria-label="Change picture">' +
                (ps.img ? '<img class="nv-thumb contain" alt="" src="' + esc(NVT.img(ps.img)) + '">' : '<span class="nv-thumb" style="display:grid;place-items:center">' + UI.icon('image') + '</span>') + '</button>' +
                '<input type="text" data-bind="' + pp + 'name" maxlength="40" value="' + esc(ps.name) + '" aria-label="Expression name"><button class="ui-btn ghost icon sm x" data-a="pose-del" data-i="' + ci + '" data-j="' + pi + '" aria-label="Remove">' + UI.icon('x') + '</button></div>';
            }).join('') + '<button type="button" class="nv-drop" style="padding:10px;display:grid;place-items:center;gap:4px" data-a="pose-add" data-i="' + ci + '">' + UI.icon('plus') + '<span class="small">Expression</span></button></div></div>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('users') + '<h3>No characters yet</h3><p>Narration works without any. Add characters to give them names, colours and expressions.</p></div>');
    }

    /* ------------------------------------------------------------ PICTURES */
    function usesOfImg(key) {
      var n = 0;
      D.scenes.forEach(function (s) { (s.steps || []).forEach(function (x) { if (x.img === key) n++; }); });
      (D.chars || []).forEach(function (c) { (c.poses || []).forEach(function (p) { if (p.img === key) n++; }); });
      if (D.settings.title_img === key || S.story.cover === key) n++;
      return n;
    }
    function upload(file, kind) {
      var L = S.limits;
      return NVT.resize(file, L, kind).then(function (r) {
        var name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60);
        if (r.scaled) UI.toast(file.name + ' was shrunk to ' + r.w + ' × ' + r.h + ' (' + L.label + ' plan)');
        return UI.apiQuiet('upload_image', id, r.dataUrl, name, kind);
      }).then(function (res) { S.images.unshift(res.image); updateCheck(); return res.image; });
    }
    function drawPics(body) {
      var L = S.limits, n = S.images.length;
      body.innerHTML = '<div class="plan-bar"><div><h2 style="margin:0">Pictures</h2><p class="muted" style="margin:4px 0 0">' + esc(L.label) + ' plan: pictures up to <b>' + L.short + ' × ' + L.long + '</b> px (either way round). Bigger ones are shrunk automatically.</p></div>' +
        '<div class="ui-row"><div class="meter"><i style="width:' + Math.min(100, n / L.images * 100) + '%"></i></div><span class="small"><b>' + n + '</b> of ' + L.images + '</span>' +
        (L.plan === 'pro' ? '<span class="ui-badge brand">Pro</span>' : '<a class="ui-btn sm" href="#pro" data-go="pro">' + UI.icon('star') + 'Go Pro</a>') + '</div></div>' +
        '<label class="nv-drop" data-drop>' + UI.icon('upload') + '<div><b>Drop pictures here</b> or tap to choose</div><div class="small">PNG, JPEG or WebP. Upload as <select data-upkind style="width:auto;min-height:32px;padding:3px 8px;display:inline-block" onclick="event.stopPropagation()">' +
        Object.keys(NVT.KINDS).map(function (k) { return opt(k, NVT.KINDS[k], 'bg'); }).join('') + '</select></div><input type="file" accept="image/*" multiple data-files></label>' +
        '<div data-upmsg class="small muted" style="margin:8px 0"></div>' +
        (n ? '<div class="pics">' + S.images.map(function (im) {
          return '<div class="ui-card pic" data-img="' + esc(im.id) + '"><img class="nv-thumb' + (im.kind === 'sprite' ? ' contain' : '') + '" alt="" loading="lazy" src="' + esc(NVT.img(im.key)) + '">' +
            '<input type="text" data-imgname value="' + esc(im.name) + '" maxlength="60" aria-label="Name"><select data-imgkind aria-label="Kind">' + Object.keys(NVT.KINDS).map(function (k) { return opt(k, NVT.KINDS[k], im.kind); }).join('') + '</select>' +
            '<div class="ui-row between small muted"><span>' + im.w + ' × ' + im.h + ' · ' + Math.round(im.bytes / 1024) + ' KB</span><span>' + (usesOfImg(im.key) ? 'used ' + usesOfImg(im.key) + '×' : 'unused') + '</span></div>' +
            '<button class="ui-btn sm danger" data-a="img-del">' + UI.icon('trash') + 'Delete</button></div>';
        }).join('') + '</div>' : '<div class="ui-empty" style="margin-top:12px">' + UI.icon('image') + '<h3>No pictures uploaded yet</h3><p>Upload backgrounds, character expressions and illustrations, or use the starter art below.</p></div>') +
        '<details style="margin-top:22px"><summary style="cursor:pointer;font-weight:800">Starter art you can use for free (' + NVT.ART.length + ' pictures)</summary>' +
        '<p class="muted small">Backgrounds, three characters with six expressions each, a cat, a conductor, two illustrations and covers. Use them in any novel, including ones you sell.</p>' +
        '<div class="nv-pick-grid" style="max-height:none">' + NVT.ART.map(function (a) { return '<div class="ui-card tight" style="padding:6px"><img class="nv-thumb ' + (a.kind === 'sprite' ? 'contain' : '') + '" alt="" loading="lazy" src="' + esc(NVT.img(a.key)) + '"><div class="small" style="margin-top:4px;font-weight:700">' + esc(a.name) + '</div></div>'; }).join('') + '</div></details>';
    }
    function uploadFiles(files) {
      var kind = (view.querySelector('[data-upkind]') || {}).value || 'bg', msg = view.querySelector('[data-upmsg]'), list = Array.prototype.slice.call(files), done = 0;
      return list.reduce(function (p, f) {
        return p.then(function () {
          if (msg) msg.textContent = 'Uploading ' + (done + 1) + ' of ' + list.length + ': ' + f.name + '…';
          return upload(f, kind).then(function () { done++; }, function (err) { UI.toast(err.message, 'error'); });
        });
      }, Promise.resolve()).then(function () { if (done) UI.toast(UI.plural(done, 'picture') + ' uploaded', 'ok'); if (tab === 'pics') drawTab(); });
    }

    /* ------------------------------------------------------------ SOUNDS */
    function usesOfSound(key) {
      var n = D.settings.title_music === key ? 1 : 0;
      D.scenes.forEach(function (sc) { (sc.steps || []).forEach(function (x) { if ((x.t === 'music' && x.track === key) || (x.t === 'sfx' && x.name === key)) n++; }); });
      return n;
    }
    function kbText(kb) { return kb >= 1024 ? (Math.round(kb / 102.4) / 10) + ' MB' : kb + ' KB'; }
    function drawSounds(body) {
      var L = S.limits, list = S.sounds || [], n = list.length;
      body.innerHTML = '<div class="plan-bar"><div><h2 style="margin:0">Sounds</h2><p class="muted" style="margin:4px 0 0">Your own music and sound effects. ' + esc(L.label) + ' plan: up to <b>' + kbText(L.sound_kb) + '</b> per file (MP3, OGG, WAV or M4A; MP3 keeps files small).</p></div>' +
        '<div class="ui-row"><div class="meter"><i style="width:' + Math.min(100, n / L.sounds * 100) + '%"></i></div><span class="small"><b>' + n + '</b> of ' + L.sounds + '</span>' +
        (L.plan === 'pro' ? '<span class="ui-badge brand">Pro</span>' : '<a class="ui-btn sm" href="#pro" data-go="pro">' + UI.icon('star') + 'Go Pro</a>') + '</div></div>' +
        '<label class="nv-drop" data-drop="snd">' + UI.icon('music') + '<div><b>Drop sound files here</b> or tap to choose</div><div class="small">Upload as <select data-sndkind style="width:auto;min-height:32px;padding:3px 8px;display:inline-block" onclick="event.stopPropagation()">' +
        opt('music', 'Music (loops)', 'music') + opt('sound', 'Sound effect (plays once)', 'music') + '</select></div><input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a" multiple data-sndfiles></label>' +
        '<div data-sndmsg class="small muted" style="margin:8px 0"></div>' +
        (n ? '<div class="snds">' + list.map(function (x) {
          var u = usesOfSound(x.key);
          return '<div class="ui-card snd" data-snd="' + esc(x.id) + '"><button class="ui-btn icon" data-a="snd-play" data-key="' + esc(x.key) + '" aria-label="Play">' + UI.icon(NV.audio.current() === x.key ? 'x' : 'play') + '</button>' +
            '<input type="text" data-sndname value="' + esc(x.name) + '" maxlength="60" aria-label="Name"><select data-sndkind2 aria-label="Kind">' + opt('music', 'Music (loops)', x.kind) + opt('sound', 'Sound effect', x.kind) + '</select>' +
            '<div class="meta"><span>' + NVT.fmtSecs(x.seconds) + ' · ' + kbText(Math.round(x.bytes / 1024)) + ' · ' + (u ? 'used ' + u + '×' : 'unused') + '</span>' +
            '<button class="ui-btn ghost icon sm" data-a="snd-del" data-id="' + esc(x.id) + '" aria-label="Delete">' + UI.icon('trash') + '</button></div></div>';
        }).join('') + '</div>' : '<div class="ui-empty" style="margin-top:12px">' + UI.icon('music') + '<h3>No sounds uploaded yet</h3><p>The built-in moods and effects below work without any files. Upload your own to give your novel its own voice.</p></div>') +
        '<div class="set-grid" style="margin-top:22px"><div class="ui-card ui-stack"><h3>Built-in music moods</h3><p class="muted small">Made in the browser, so they cost no space. Tap to listen, tap again to stop.</p><div class="builtin">' +
        Object.keys(NV.TRACKS).map(function (k) { return '<button class="ui-btn" data-a="builtin-play" data-k="' + k + '">' + UI.icon('music') + esc(NV.TRACKS[k].name) + '</button>'; }).join('') + '</div></div>' +
        '<div class="ui-card ui-stack"><h3>Built-in sound effects</h3><p class="muted small">Short effects for knocks, chimes, heartbeats and more.</p><div class="builtin">' +
        Object.keys(NV.SFX).map(function (k) { return '<button class="ui-btn" data-a="builtin-play" data-sfx data-k="' + k + '">' + UI.icon('bell') + esc(NV.SFX[k]) + '</button>'; }).join('') + '</div></div></div>' +
        '<p class="small muted" style="margin-top:14px">Only upload music and sounds you made or have the rights to use (for example, with a licence that allows use in games you sell).</p>';
    }
    function uploadSounds(files) {
      var kind = (view.querySelector('[data-sndkind]') || {}).value || 'music', msg = view.querySelector('[data-sndmsg]'), list = Array.prototype.slice.call(files), done = 0;
      return list.reduce(function (pr, f) {
        return pr.then(function () {
          if (msg) msg.textContent = 'Uploading ' + (done + 1) + ' of ' + list.length + ': ' + f.name + '…';
          return NVT.readSound(f, S.limits).then(function (r) {
            return UI.apiQuiet('upload_sound', id, r.dataUrl, f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60), kind, r.seconds);
          }).then(function (res) { S.sounds.unshift(res.sound); done++; }, function (err) { UI.toast(err.message, 'error'); });
        });
      }, Promise.resolve()).then(function () { if (done) UI.toast(UI.plural(done, 'sound') + ' uploaded', 'ok'); if (msg) msg.textContent = ''; if (tab === 'sounds') drawTab(); updateCheck(); });
    }

    /* ------------------------------------------------------------ VARIABLES */
    function drawVars(body) {
      body.innerHTML = '<div class="ui-page-head"><div><h2 style="margin:0">Variables</h2><p class="muted">Remember what the reader did: points, flags and names. Choices and steps change them; conditions read them.</p></div>' +
        '<button class="ui-btn primary" data-a="var-add">' + UI.icon('plus') + 'New variable</button></div>' +
        '<div class="set-grid vars-grid"><div>' +
        ((D.vars || []).length ? '<table class="vars"><thead><tr><th>Name</th><th>Kind</th><th>Starts as</th><th>Note</th><th>Used</th><th></th></tr></thead><tbody>' + D.vars.map(function (v, vi) {
          var p = 'vars.' + vi + '.';
          return '<tr><td><input type="text" data-varname="' + vi + '" value="' + esc(v.name) + '" maxlength="32" aria-label="Name" style="font-family:ui-monospace,Consolas,monospace"></td>' +
            '<td><select data-vartype="' + vi + '">' + [['number', 'Number'], ['flag', 'Yes / no'], ['text', 'Text']].map(function (o) { return opt(o[0], o[1], v.type); }).join('') + '</select></td>' +
            '<td>' + (v.type === 'flag' ? '<select data-bind="' + p + 'init" data-type="bools">' + opt('false', 'no (false)', String(!!v.init)) + opt('true', 'yes (true)', String(!!v.init)) + '</select>'
              : '<input type="' + (v.type === 'number' ? 'number' : 'text') + '" data-bind="' + p + 'init" data-type="' + (v.type === 'number' ? 'num' : 'str') + '" value="' + esc(v.init) + '">') + '</td>' +
            '<td class="note"><input type="text" data-bind="' + p + 'note" maxlength="200" placeholder="What it tracks" value="' + esc(v.note || '') + '"></td>' +
            '<td class="small muted">' + NVT.varUses(D, v.name) + '×</td><td><button class="ui-btn ghost icon" data-a="var-del" data-i="' + vi + '" aria-label="Delete">' + UI.icon('trash') + '</button></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="ui-empty">' + UI.icon('sliders') + '<h3>No variables yet</h3><p>Try <code>trust</code> (a number) or <code>has_key</code> (yes / no).</p></div>') + '</div>' +
        '<div class="ui-card cheat"><h3>Cheat sheet</h3><ul style="padding-left:18px;margin:0">' +
        '<li>Conditions: <code>trust >= 3</code>, <code>has_key</code>, <code>not angry</code>, <code>name == "Aki"</code></li>' +
        '<li>Combine: <code>trust >= 2 and (has_key or brave)</code></li>' +
        '<li>History: <code>seen("Scene name")</code>, <code>chose("choice-id")</code>, <code>ended("Ending title")</code> (any earlier playthrough: great for secret routes)</li>' +
        '<li>In text: <code>[name]</code> shows a variable. <code>{if trust >= 3}warmly{else}coldly{/if}</code> picks words.</li>' +
        '<li>Style: <code>**bold**</code>, <code>*italic*</code>, <code>{color=#ff4f8b}pink{/color}</code>, <code>{big}…{/big}</code>, <code>{shake}…{/shake}</code>, <code>{w=0.5}</code> pause</li>' +
        '<li>Renaming a variable here updates every condition, effect and text that uses it.</li></ul></div></div>';
    }

    /* ------------------------------------------------------------ SETTINGS */
    function drawSettings(body) {
      var st = S.story, set = D.settings;
      body.innerHTML = '<div class="set-grid"><form class="ui-card ui-stack" data-meta><h3>About your novel</h3>' +
        '<label class="ui-field"><span>Title</span><input type="text" name="title" maxlength="80" required value="' + esc(st.title) + '"></label>' +
        '<label class="ui-field"><span>Blurb <em>(shown in Discover)</em></span><textarea name="blurb" maxlength="600" rows="3" placeholder="One or two sentences that make people want to play.">' + esc(st.blurb || '') + '</textarea></label>' +
        '<div class="ui-grid two"><label class="ui-field"><span>Genre</span><select name="genre">' + opt('', 'Choose…', st.genre || '') + S.genres.map(function (g) { return opt(g, g, st.genre); }).join('') + '</select></label>' +
        '<label class="ui-field"><span>Rating</span><select name="rating">' + S.ratings.map(function (g) { return opt(g, g, st.rating); }).join('') + '</select></label></div>' +
        '<label class="ui-field"><span>Tags <em>(comma separated, up to 8)</em></span><input type="text" name="tags" value="' + esc((st.tags || []).join(', ')) + '" placeholder="cats, school, short"></label>' +
        '<div class="ui-field"><span>Cover <em>(portrait 2:3 looks best)</em></span><div class="ui-row"><button type="button" class="pic-field" data-a="pick-cover">' +
        (st.cover ? '<img alt="" src="' + esc(NVT.img(st.cover)) + '">' : '<span class="ph"></span>') + '<span>' + esc(st.cover ? imgName(st.cover) : 'Choose a cover') + '</span></button></div></div>' +
        '<button class="ui-btn primary" type="submit">' + UI.icon('check') + 'Save details</button></form>' +
        '<div class="ui-card ui-stack"><h3>Look &amp; feel</h3>' +
        '<div class="ui-field"><span>Stage shape</span><div class="or-opts">' +
        '<label class="ui-choice"><input type="radio" name="orient" data-set="orientation" value="portrait"' + (set.orientation !== 'landscape' ? ' checked' : '') + '><span><i style="width:16px;height:24px"></i>Portrait (phones)</span></label>' +
        '<label class="ui-choice"><input type="radio" name="orient" data-set="orientation" value="landscape"' + (set.orientation === 'landscape' ? ' checked' : '') + '><span><i style="width:24px;height:16px"></i>Landscape (desktop)</span></label></div></div>' +
        '<div class="ui-field"><span>Text box style</span><div class="tb-opts">' + [['sakura', 'Sakura'], ['midnight', 'Midnight'], ['paper', 'Paper'], ['pixel', 'Pixel']].map(function (o) {
          return '<label class="tb-' + o[0] + '"><input type="radio" name="tb" data-set="textbox" value="' + o[0] + '"' + (set.textbox === o[0] ? ' checked' : '') + '><span><i></i>' + o[1] + '</span></label>';
        }).join('') + '</div></div>' +
        '<div class="ui-field"><span>Accent colour</span><div class="swatches">' + ACCENTS.map(function (c) { return '<button type="button" data-accent="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>'; }).join('') +
        '<input type="color" data-set="accent" value="' + esc(set.accent) + '" aria-label="Custom colour"></div></div>' +
        '<div class="ui-grid two"><label class="ui-field"><span>Font</span><select data-set="font">' + [['rounded', 'Rounded'], ['sans', 'Clean'], ['serif', 'Storybook serif'], ['mono', 'Typewriter']].map(function (o) { return opt(o[0], o[1], set.font); }).join('') + '</select></label>' +
        '<label class="ui-field"><span>Text speed: <b data-cpsv>' + set.cps + '</b> letters/s</span><input type="range" min="10" max="120" step="5" data-set="cps" value="' + set.cps + '" style="width:100%;accent-color:var(--c-brand)"></label></div>' +
        '<div class="ui-grid two"><div class="ui-field"><span>Title screen picture</span><button type="button" class="pic-field" data-a="pick" data-path="settings.title_img" data-kind="cover">' +
        (set.title_img ? '<img alt="" src="' + esc(NVT.img(set.title_img)) + '">' : '<span class="ph"></span>') + '<span>' + esc(set.title_img ? imgName(set.title_img) : 'First background') + '</span></button></div>' +
        '<label class="ui-field"><span>Title screen music</span><select data-set="title_music">' + opt('', 'None', set.title_music || '') + soundOptions(set.title_music, false) + '</select></label></div>' +
        '<div class="ed-pv" data-setpv style="max-width:240px;border:2.5px solid var(--c-outline);background:#1a1424"></div></div>' +
        '<div class="ui-card ui-stack"><h3>Story</h3><label class="ui-field"><span>Starting scene</span><select data-set-root="start">' + sceneOptions(D.start) + '</select></label>' +
        '<label class="ui-field"><span>Credits <em>(the Credits screen; one line each)</em></span><textarea data-bind="settings.credits" rows="4" maxlength="1500">' + esc(set.credits || '') + '</textarea></label></div>' +
        '<div class="ui-card ui-stack"><h3>Publishing</h3>' +
        (st.status === 'draft' ? '<p class="muted">Not published yet. Only you can play it (Playtest).</p>'
          : '<p>' + (st.status === 'public' ? 'Public: listed in Discover.' : 'Unlisted: anyone with the link can play.') + (st.changes ? ' <span class="ui-badge warn">You have unpublished edits</span>' : '') + '</p>' +
          '<div class="share-box"><input type="text" readonly value="' + esc(location.origin + location.pathname + '#play/' + st.slug) + '"><button class="ui-btn" data-a="copy-link">' + UI.icon('copy') + 'Copy</button></div>') +
        '<div class="ui-row"><button class="ui-btn primary" data-a="publish">' + UI.icon('globe') + (st.status === 'draft' ? 'Publish…' : 'Publish changes…') + '</button>' +
        (st.status === 'draft' ? '' : '<button class="ui-btn" data-a="unpublish">Unpublish</button>') + '</div></div>' +
        '<div class="ui-card ui-stack danger-zone"><h3>Danger zone</h3><p class="muted small">Deleting removes the novel, its pictures, likes and stats. Downloaded copies keep working.</p>' +
        '<div><button class="ui-btn danger" data-a="story-del">' + UI.icon('trash') + 'Delete this novel</button></div></div></div>';
      var pv = view.querySelector('[data-setpv]'), s0 = scene(D.start);
      if (pv && s0) ED.preview(pv, D, s0, (s0.steps || []).reduce(function (a, x, i) { return x.t === 'say' && a < 0 ? i : a; }, -1));
    }

    /* ------------------------------------------------------------ events */
    function coerce(el, v) {
      var t = el.getAttribute('data-type');
      if (t === 'num') { var f = parseFloat(v); return isNaN(f) ? 0 : f; }
      if (t === 'bool') return !!el.checked;
      if (t === 'bools') return v === 'true';
      return v;
    }
    view.addEventListener('input', function (e) {
      var el = e.target, path = el.getAttribute('data-bind');
      if (path) {
        if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color') return;
        setPath(path, coerce(el, el.value));
        if (el.hasAttribute('data-cond')) {
          var r = condCheck(el.value);
          el.classList.toggle('cond-bad', !r.ok);
          var msg = el.parentNode.parentNode.querySelector('.cond-msg');
          if (!r.ok) { if (!msg) { msg = document.createElement('div'); msg.className = 'cond-msg'; el.parentNode.insertAdjacentElement('afterend', msg); } msg.textContent = r.error; }
          else if (msg) msg.remove();
        }
        change();
        if (tab === 'write') { clearTimeout(view._pv); view._pv = setTimeout(drawPreview, 250); }
        if (/\.name$/.test(path) && tab === 'write' && /^scenes\.\d+\.name$/.test(path)) {
          var on = view.querySelector('.wr-scene.on span');
          if (on) on.textContent = el.value;
        }
        return;
      }
      if (el.matches('[data-set="cps"]')) { D.settings.cps = +el.value; view.querySelector('[data-cpsv]').textContent = el.value; change(); }
    });
    view.addEventListener('change', function (e) {
      var el = e.target, path = el.getAttribute('data-bind');
      if (path && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color')) {
        var v = coerce(el, el.value);
        if (el.hasAttribute('data-newscene') && v === '__new') {
          var cur = scene(selId) || D.scenes[0];
          var label = el.getAttribute('data-label') || '';
          var ns = newScene(label ? label.slice(0, 40) : 'New scene', cur);
          v = ns.id;
          UI.toast('Added the scene "' + ns.name + '"', 'ok');
          setPath(path, v); change(); drawTab();
          return;
        }
        setPath(path, v === '' && /\.(next|to|who|timeout|win|lose)$/.test(path) ? null : v);
        // keep a set step sensible when its variable changes kind
        var m = /^(scenes\.\d+\.steps\.\d+|scenes\.\d+\.choices\.\d+\.set\.\d+)\.var$/.exec(path);
        if (m) { var obj = getPath(m[1]), d = varDef(obj.var); if (d) { obj.op = d.type === 'number' ? '+' : '='; obj.val = d.type === 'number' ? 1 : d.type === 'flag' ? true : ''; } }
        var mc = /^scenes\.\d+\.steps\.\d+\.(char|who)$/.exec(path);
        if (mc) { var st_ = getPath(path.replace(/\.(char|who)$/, '')), c = charById(st_[mc[1]]); if (mc[1] === 'char') st_.pose = c && c.poses[0] ? c.poses[0].name : ''; else st_.pose = ''; }
        change();
        if (el.hasAttribute('data-rr') || tab === 'cast' && el.type === 'color') drawTab(); else if (tab === 'write') drawPreview();
        return;
      }
      var sel = el.getAttribute('data-a-sel');
      if (sel === 'scene') { selId = el.value; selStep = null; drawTab(); return; }
      if (sel === 'add' && el.value) { addStep(el.value); return; }
      if (sel === 'ending') {
        var s = scene(selId);
        if (el.value) { s.ending = s.ending || { kind: el.value, title: s.name, text: '' }; s.ending.kind = el.value; } else s.ending = null;
        change(); drawTab(); return;
      }
      var setk = el.getAttribute('data-set');
      if (setk) {
        D.settings[setk] = el.type === 'range' ? +el.value : el.value;
        change(); if (setk !== 'cps') drawTab(); return;
      }
      if (el.getAttribute('data-set-root') === 'start') { D.start = el.value; change(); return; }
      if (el.hasAttribute('data-varname')) { renameVar(+el.getAttribute('data-varname'), el.value.trim(), el); return; }
      if (el.hasAttribute('data-vartype')) {
        var vd = D.vars[+el.getAttribute('data-vartype')];
        vd.type = el.value; vd.init = vd.type === 'number' ? 0 : vd.type === 'flag' ? false : '';
        change(); drawTab(); return;
      }
      if (el.hasAttribute('data-files') && el.files.length) { uploadFiles(el.files); el.value = ''; return; }
      if (el.hasAttribute('data-sndfiles') && el.files.length) { uploadSounds(el.files); el.value = ''; return; }
      var sc_ = el.closest('[data-snd]');
      if (sc_ && (el.hasAttribute('data-sndname') || el.hasAttribute('data-sndkind2'))) {
        var sid_ = sc_.getAttribute('data-snd');
        UI.apiQuiet('update_sound', sid_, sc_.querySelector('[data-sndname]').value, sc_.querySelector('[data-sndkind2]').value).then(function (r) {
          S.sounds = S.sounds.map(function (x) { return x.id === sid_ ? r.sound : x; }); UI.toast('Saved', 'ok');
        });
        return;
      }
      var card = el.closest('[data-img]');
      if (card && (el.hasAttribute('data-imgname') || el.hasAttribute('data-imgkind'))) {
        var imgId = card.getAttribute('data-img');
        UI.apiQuiet('update_image', imgId, card.querySelector('[data-imgname]').value, card.querySelector('[data-imgkind]').value).then(function (r) {
          S.images = S.images.map(function (i) { return i.id === imgId ? r.image : i; });
          UI.toast('Saved', 'ok');
        });
      }
    });
    view.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d.matches && d.matches('details[data-cid]')) openCho[d.getAttribute('data-cid')] = d.open;
    }, true);
    view.addEventListener('focusin', function (e) {
      var row = e.target.closest('[data-step]');
      if (row && tab === 'write') {
        var i = +row.getAttribute('data-step');
        if (selStep !== i) {
          selStep = i;
          Array.prototype.forEach.call(view.querySelectorAll('[data-step]'), function (r) { r.classList.toggle('sel', +r.getAttribute('data-step') === i); });
          drawPreview();
          var hint = view.querySelector('.sc-add .small'); if (hint) hint.textContent = 'adds after step ' + (i + 1);
        }
      }
    });
    view.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.closest('.st-say')) {
        e.preventDefault();
        selStep = +e.target.closest('[data-step]').getAttribute('data-step');
        addStep('say');
      }
    });
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y') && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !document.querySelector('.pt')) {
        e.preventDefault(); doUndo(e.key === 'y' || e.shiftKey);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save().then(function () { UI.toast('Saved', 'ok'); }); }
    }
    document.addEventListener('keydown', onKey);
    view.addEventListener('dragover', function (e) { var d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
    view.addEventListener('dragleave', function (e) { var d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
    view.addEventListener('drop', function (e) {
      var d = e.target.closest('[data-drop]');
      if (!d) return;
      e.preventDefault(); d.classList.remove('over');
      if (d.getAttribute('data-drop') === 'snd') uploadSounds(e.dataTransfer.files); else uploadFiles(e.dataTransfer.files);
    });

    function addStep(t) {
      var s = scene(selId);
      if (!s) return;
      var x = ED.newStep(t, D, s), at = selStep == null ? s.steps.length : selStep + 1;
      s.steps.splice(at, 0, x);
      selStep = at;
      change(); drawScene();
      var row = view.querySelector('[data-step="' + at + '"]');
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); var f = row.querySelector('textarea, input'); if (f && t === 'say') f.focus(); }
    }
    function renameVar(vi, name, el) {
      var v = D.vars[vi];
      if (name === v.name) return;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(name)) { UI.toast('Use letters, digits and _ (start with a letter), e.g. trust or has_key.', 'error'); el.value = v.name; return; }
      if (['and', 'or', 'not', 'true', 'false', 'True', 'False'].indexOf(name) >= 0 || D.vars.some(function (o) { return o.name === name; })) { UI.toast('That name is taken.', 'error'); el.value = v.name; return; }
      NVT.renameVar(D, v.name, name);
      v.name = name;
      change(); drawTab();
      UI.toast('Renamed everywhere', 'ok');
    }
    function pick(path, kind) {
      ED.pickImage({ kind: kind, images: S.images, allowNone: true, upload: upload, title: kind === 'sprite' ? 'Choose an expression picture' : kind === 'cg' ? 'Choose an illustration' : 'Choose a picture' }).then(function (key) {
        if (key == null) return;
        setPath(path, key);
        var m = /^chars\.(\d+)\.poses\.(\d+)\.img$/.exec(path);
        if (m) { var ps = D.chars[+m[1]].poses[+m[2]]; if (!ps.name || /^pose\d*$/.test(ps.name)) ps.name = (imgName(key).split(' ').pop() || 'neutral').toLowerCase(); }
        change(); drawTab();
      });
    }

    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { e.preventDefault(); goTab(t.getAttribute('data-tab')); return; }
      var a = e.target.closest('[data-a]');
      if (!a) { var acc = e.target.closest('[data-accent]'); if (acc) { D.settings.accent = acc.getAttribute('data-accent'); change(); drawTab(); } return; }
      var act = a.getAttribute('data-a'), sid = a.getAttribute('data-id'), i = +a.getAttribute('data-i'), j = +a.getAttribute('data-j');
      var s = scene(selId);
      switch (act) {
        case 'undo': doUndo(false); break;
        case 'check': {
          var items = NVT.lint(D, S.images, S.sounds);
          var m = UI.modal('<h2>' + UI.icon('shield') + ' Story check</h2><p class="muted">Things that could confuse or strand a reader. Tap one to go there.</p>' + ED.lintHtml(items), { wide: true });
          m.el.addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-lint]');
            if (b) { var it = items[+b.getAttribute('data-lint')]; m.close(); if (it.scene) goTab('write', it.scene); else goTab('settings'); }
          });
          break;
        }
        case 'play': ED.playtest(D, { title: S.story.title, slug: S.story.slug, author: ctx.me.name }, null); break;
        case 'play-from': ED.playtest(D, { title: S.story.title, slug: S.story.slug, author: ctx.me.name }, sid || selId); break;
        case 'export': ED.exportGame({ story: S.story, data: D, images: S.images, sounds: S.sounds, limits: S.limits, me: ctx.me }); break;
        case 'publish':
          save().then(function () {
            ED.publish({ story: S.story, data: D, images: S.images, sounds: S.sounds, onDone: function (st) { S.story = st; S.story.changes = false; drawStatus(); if (tab === 'settings') drawTab(); },
              onLint: function (it) { if (it.scene) goTab('write', it.scene); } });
          });
          break;
        case 'unpublish':
          UI.confirm({ title: 'Unpublish this novel?', text: 'Readers won\'t be able to open it until you publish again. Likes and play counts are kept.', ok: 'Unpublish', danger: true }).then(function (y) {
            if (y) UI.api('unpublish_story', id).then(function (r) { S.story = r.story; drawStatus(); drawTab(); UI.toast('Unpublished'); });
          });
          break;
        case 'copy-link': ED.copy(location.origin + location.pathname + '#play/' + S.story.slug); break;
        case 'story-del':
          UI.confirm({ title: 'Delete "' + S.story.title + '"?', text: 'Its scenes, pictures, likes and stats are deleted for good.', ok: 'Delete', danger: true }).then(function (y) {
            if (y) { dirty = false; clearTimeout(saveT); UI.api('delete_story', id).then(function () { UI.toast('Deleted'); UI.go('studio'); }); }
          });
          break;
        case 'tidy': NVT.layout(D); change(); fitMap(); renderWorld(); break;
        case 'fit': fitMap(); renderWorld(); break;
        case 'zoom-in': zoomAt(1.25); break;
        case 'zoom-out': zoomAt(0.8); break;
        case 'select': selId = sid; if (tab === 'map') { renderWorld(); drawSide(); setUrl(); } else drawTab(); break;
        case 'select-w': selId = sid; selStep = null; tab = 'write'; drawTab(); window.scrollTo(0, 0); break;
        case 'write': goTab('write', sid); break;
        case 'scene-new': { var ns = newScene('New scene', tab === 'map' && selId ? scene(selId) : null); selId = ns.id; change(); if (tab === 'map') { renderWorld(); drawSide(); } else drawTab(); break; }
        case 'branch': {
          var from = scene(sid), nb = newScene('After "' + from.name + '"', from);
          from.choices.push({ id: NVT.uid('c'), text: '', to: nb.id, if: '', mode: 'hide', hint: '', once: false, set: [] });
          change(); selId = nb.id; renderWorld(); drawSide();
          UI.toast('Added a choice and a new scene. Write the choice text in the Write tab.', 'ok');
          break;
        }
        case 'scene-start': D.start = sid; change(); drawTab(); UI.toast('This is now where the story starts', 'ok'); break;
        case 'scene-dup': {
          var src = scene(sid), copy = JSON.parse(JSON.stringify(src)), spot = NVT.freeSpot(D, src.x, src.y);
          copy.id = NVT.uid('s'); copy.name = src.name + ' (copy)'; copy.x = spot.x; copy.y = spot.y;
          copy.choices.forEach(function (c) { c.id = NVT.uid('c'); });
          copy.steps.forEach(function (x) { x.k = NVT.uid('k'); });
          D.scenes.push(copy); selId = copy.id; change(); drawTab(); break;
        }
        case 'scene-del': {
          var del = scene(sid), refs = D.scenes.filter(function (o) { return NVT.targets(o).some(function (tt) { return tt.to === sid; }); }).length;
          UI.confirm({ title: 'Delete "' + del.name + '"?', text: (refs ? UI.plural(refs, 'scene') + ' lead here; those links will need a new target. ' : '') + 'Ctrl+Z (or the undo button) brings it back.', ok: 'Delete', danger: true }).then(function (y) {
            if (!y) return;
            D.scenes.splice(sceneIdx(sid), 1);
            D.scenes.forEach(function (o) {
              (o.choices || []).forEach(function (c) { if (c.to === sid) c.to = null; });
              if (o.next === sid) o.next = null;
              (o.steps || []).forEach(function (x) { if (x.t === 'jump' && x.to === sid) x.to = null; });
            });
            if (D.start === sid) D.start = D.scenes[0] ? D.scenes[0].id : null;
            selId = null; change(); drawTab();
          });
          break;
        }
        case 'add-step': addStep(a.getAttribute('data-t')); break;
        case 'step-del': s.steps.splice(i, 1); selStep = null; change(); drawScene(); break;
        case 'step-up': if (i > 0) { s.steps.splice(i - 1, 0, s.steps.splice(i, 1)[0]); selStep = i - 1; change(); drawScene(); } break;
        case 'step-down': if (i < s.steps.length - 1) { s.steps.splice(i + 1, 0, s.steps.splice(i, 1)[0]); selStep = i + 1; change(); drawScene(); } break;
        case 'step-dup': { var cp = JSON.parse(JSON.stringify(s.steps[i])); cp.k = NVT.uid('k'); s.steps.splice(i + 1, 0, cp); selStep = i + 1; change(); drawScene(); break; }
        case 'step-if': {
          var x = s.steps[i];
          if (x.if) { x.if = ''; delete x._if; } else x._if = 1;
          selStep = i; change(); drawScene();
          var inp = view.querySelector('[data-step="' + i + '"] [data-cond]'); if (inp) inp.focus();
          break;
        }
        case 'cho-add': s.choices.push({ id: NVT.uid('c'), text: '', to: null, if: '', mode: 'hide', hint: '', once: false, set: [] }); change(); drawScene();
          var last = view.querySelectorAll('.cho input[type=text]'); var li = view.querySelectorAll('[data-cho]'); if (li.length) li[li.length - 1].querySelector('input').focus(); void last; break;
        case 'cho-del': s.choices.splice(i, 1); change(); drawScene(); break;
        case 'cho-up': if (i > 0) { s.choices.splice(i - 1, 0, s.choices.splice(i, 1)[0]); change(); drawScene(); } break;
        case 'eff-add': { var v0 = (D.vars || [])[0]; if (!v0) { UI.toast('Add a variable in the Variables tab first.', 'error'); break; } openCho[s.choices[i].id] = true; s.choices[i].set.push({ var: v0.name, op: v0.type === 'number' ? '+' : '=', val: v0.type === 'number' ? 1 : v0.type === 'flag' ? true : '' }); change(); drawScene(); break; }
        case 'eff-del': s.choices[i].set.splice(j, 1); change(); drawScene(); break;
        case 'try-music': { var tr = getPath(a.getAttribute('data-path')); if (NV.audio.current() === tr) { NV.audio.music(''); a.innerHTML = UI.icon('play') + 'Listen'; } else { NV.audio.music(tr, NVT.img(tr)); a.innerHTML = UI.icon('x') + 'Stop'; } break; }
        case 'try-sfx': { var sn = getPath(a.getAttribute('data-path')); NV.audio.sfx(sn, NVT.img(sn)); break; }
        case 'game-try': ED.tryGame(s.steps[i], D.settings.accent); break;
        case 'game-pal': { var pl = NVT.GAME_PALETTES[+a.getAttribute('data-p')], gs = s.steps[i]; gs.c1 = pl[1]; gs.c2 = pl[2]; gs.c3 = pl[3]; selStep = i; change(); drawScene(); break; }
        case 'snd-play': {
          var key = a.getAttribute('data-key'), snd = (S.sounds || []).filter(function (x) { return x.key === key; })[0];
          if (snd && snd.kind === 'sound') { NV.audio.sfx(key, NVT.img(key)); break; }
          if (NV.audio.current() === key) { NV.audio.music(''); a.innerHTML = UI.icon('play'); } else { NV.audio.music(key, NVT.img(key)); Array.prototype.forEach.call(view.querySelectorAll('[data-a="snd-play"]'), function (o) { o.innerHTML = UI.icon('play'); }); a.innerHTML = UI.icon('x'); }
          break;
        }
        case 'builtin-play': {
          var bk = a.getAttribute('data-k');
          if (a.hasAttribute('data-sfx')) NV.audio.sfx(bk); else if (NV.audio.current() === bk) NV.audio.music(''); else NV.audio.music(bk);
          break;
        }
        case 'snd-del': {
          var sd = (S.sounds || []).filter(function (x) { return x.id === a.getAttribute('data-id'); })[0], su = usesOfSound(sd.key);
          UI.confirm({ title: 'Delete "' + sd.name + '"?', text: su ? 'It\'s used ' + su + ' times; those steps will play nothing until you pick another.' : 'It isn\'t used anywhere.', ok: 'Delete', danger: true }).then(function (y) {
            if (y) UI.api('delete_sound', sd.id).then(function () { if (NV.audio.current() === sd.key) NV.audio.music(''); S.sounds = S.sounds.filter(function (x) { return x.id !== sd.id; }); drawTab(); updateCheck(); });
          });
          break;
        }
        case 'pick': pick(a.getAttribute('data-path'), a.getAttribute('data-kind')); break;
        case 'pick-cover':
          ED.pickImage({ kind: 'cover', images: S.images, allowNone: true, upload: upload, title: 'Choose a cover' }).then(function (key) {
            if (key == null) return;
            UI.api('update_story_meta', id, { cover: key }).then(function (r) { S.story = Object.assign(S.story, r.story); drawTab(); UI.toast('Cover saved', 'ok'); });
          });
          break;
        case 'char-add': {
          D.chars.push({ id: NVT.uid('c'), name: 'New character', color: ACCENTS[D.chars.length % ACCENTS.length], poses: [] });
          change(); drawTab(); break;
        }
        case 'char-del': {
          var ch = D.chars[i], used = usesOfChar(ch.id);
          UI.confirm({ title: 'Delete ' + ch.name + '?', text: used ? used + ' lines or steps use them; those lines become narration.' : 'Nobody uses them yet.', ok: 'Delete', danger: true }).then(function (y) {
            if (!y) return;
            D.scenes.forEach(function (o) { o.steps = (o.steps || []).filter(function (x) { return !((x.t === 'show' || x.t === 'hide') && x.char === ch.id); }); o.steps.forEach(function (x) { if (x.who === ch.id) { x.who = null; x.pose = ''; } }); });
            D.chars.splice(i, 1); change(); drawTab();
          });
          break;
        }
        case 'pose-add': {
          var chr = D.chars[i];
          ED.pickImage({ kind: 'sprite', images: S.images, upload: upload, title: 'Picture for a new expression' }).then(function (key) {
            if (!key) return;
            var nm = (imgName(key).split(' ').pop() || 'neutral').toLowerCase();
            if (chr.poses.some(function (p) { return p.name === nm; })) nm = nm + (chr.poses.length + 1);
            chr.poses.push({ name: nm, img: key }); change(); drawTab();
          });
          break;
        }
        case 'pose-del': D.chars[i].poses.splice(j, 1); change(); drawTab(); break;
        case 'cast-starter': {
          var mm = UI.modal('<h2>Starter cast</h2><p class="muted">Ready-made characters with expressions, free to use.</p><div class="ui-list">' + NVT.STARTER_CAST.map(function (c, ci) {
            var have = D.chars.some(function (x) { return x.id === c.id; });
            return '<div class="ui-item" style="align-items:center"><img src="' + NVT.img('demo:' + c.base + '-' + c.poses[0]) + '" alt="" style="width:56px;height:56px;object-fit:cover;object-position:top;border-radius:12px;background:var(--c-surface-2)">' +
              '<div class="grow"><h3 style="color:' + c.color + '">' + esc(c.name) + '</h3><p class="small muted">' + c.poses.join(', ') + '</p></div>' +
              (have ? '<span class="ui-badge good">Added</span>' : '<button class="ui-btn sm primary" data-add-cast="' + ci + '">Add</button>') + '</div>';
          }).join('') + '</div>');
          mm.el.addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-add-cast]');
            if (!b) return;
            var c = NVT.STARTER_CAST[+b.getAttribute('data-add-cast')];
            D.chars.push({ id: c.id, name: c.name, color: c.color, poses: c.poses.map(function (p) { return { name: p, img: 'demo:' + c.base + '-' + p }; }) });
            change(); b.outerHTML = '<span class="ui-badge good">Added</span>'; drawTab();
          });
          break;
        }
        case 'img-del': {
          var cardEl = a.closest('[data-img]'), im = S.images.filter(function (x) { return x.id === cardEl.getAttribute('data-img'); })[0], u = usesOfImg(im.key);
          UI.confirm({ title: 'Delete this picture?', text: u ? 'It\'s used ' + u + ' times; those places will show nothing until you pick another.' : 'It isn\'t used anywhere.', ok: 'Delete', danger: true }).then(function (y) {
            if (y) UI.api('delete_image', im.id).then(function () { S.images = S.images.filter(function (x) { return x.id !== im.id; }); drawTab(); updateCheck(); });
          });
          break;
        }
        case 'var-add': {
          var base = 'points', k = 1;
          while (D.vars.some(function (v) { return v.name === base + (k > 1 ? k : ''); })) k++;
          D.vars.push({ name: base + (k > 1 ? k : ''), type: 'number', init: 0, note: '' }); change(); drawTab();
          var ins = view.querySelectorAll('[data-varname]'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); }
          break;
        }
        case 'var-del': {
          var vv = D.vars[i], uses = NVT.varUses(D, vv.name);
          UI.confirm({ title: 'Delete ' + vv.name + '?', text: uses ? 'It\'s used ' + uses + ' times. Conditions that use it will show up in Check.' : 'It isn\'t used anywhere.', ok: 'Delete', danger: true }).then(function (y) {
            if (y) { D.vars.splice(i, 1); change(); drawTab(); }
          });
          break;
        }
      }
    });
    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-meta]')) return;
      e.preventDefault();
      var v = UI.formData(e.target);
      var meta = { title: v.title, blurb: v.blurb, genre: v.genre, rating: v.rating, tags: (v.tags || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean) };
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_story_meta', id, meta)).then(function (r) {
        S.story = Object.assign(S.story, r.story);
        var ti = view.querySelector('[data-title]'); if (ti) ti.value = S.story.title;
        UI.toast('Details saved', 'ok');
      });
    });
    view.addEventListener('change', function (e) {
      if (!e.target.matches('[data-title]')) return;
      var v = e.target.value.trim();
      if (v.length < 2) { e.target.value = S.story.title; return; }
      UI.apiQuiet('update_story_meta', id, { title: v }).then(function (r) { S.story = Object.assign(S.story, r.story); UI.toast('Renamed', 'ok'); document.title = v + ' · ' + UI.config.name; });
    });

    var ready = UI.api('get_story', id).then(function (r) {
      S = r; D = r.data; S.sounds = S.sounds || [];
      D.chars = D.chars || []; D.vars = D.vars || []; D.scenes = D.scenes || []; D.settings = D.settings || {};
      lastJson = JSON.stringify(D);
      document.title = S.story.title + ' · ' + UI.config.name;
      drawShell(); drawTab();
    });
    return {
      ready: ready,
      destroy: function () {
        window.removeEventListener('beforeunload', beforeUnload);
        document.removeEventListener('keydown', onKey);
        NV.audio.music('');
        if (dirty && D) { clearTimeout(saveT); UI.apiQuiet('save_story', id, D).catch(function () { UI.toast('Your last edits may not be saved.', 'error'); }); }
      }
    };
  });
})();

/* ===== guide.html ===== */
(function () {
  var SECTIONS = [['basics', 'The basics', 'book'], ['writing', 'Writing scenes', 'edit'], ['branch', 'Choices & branches', 'jump'], ['games', 'Mini-games', 'game'], ['sound', 'Music & sounds', 'music'], ['vars', 'Variables & conditions', 'sliders'],
                  ['text', 'Text styling', 'chat'], ['readers', 'What readers get', 'play'], ['renpy', 'Coming from Ren\'Py', 'refresh'], ['sell', 'Sharing & selling', 'download']];
  function row(a, b, c) { return '<tr><td>' + a + '</td><td>' + b + '</td>' + (c != null ? '<td>' + c + '</td>' : '') + '</tr>'; }
  function card(icon, title, text) { return '<div class="ui-card"><h3>' + UI.icon(icon) + title + '</h3><p class="muted" style="margin:0">' + text + '</p></div>'; }
  UI.page('guide', { title: 'Guide', nav: 'Guide', icon: 'book', order: 30 }, function (view) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Guide</div><h1>How ImgNovella works</h1><p class="muted">Everything you need to write a branching visual novel, without code.</p></div></div>' +
      '<div class="gd"><nav class="gd-toc">' + SECTIONS.map(function (s) { return '<a href="#guide" data-jump="' + s[0] + '">' + UI.icon(s[2]) + ' ' + s[1] + '</a>'; }).join('') + '</nav><div>' +
      '<section id="g-basics"><h2>' + UI.icon('book') + 'The basics</h2><div class="cards">' +
      card('map', 'Scenes', 'A novel is a set of scenes on a map. Each scene is a list of steps (lines, backgrounds, characters…) followed by choices.') +
      card('jump', 'Choices', 'Choices connect scenes. The map draws them as arrows, so you can see every branch at a glance.') +
      card('flag', 'Endings', 'Mark final scenes as endings (true, good, neutral, bad or secret). Readers collect them on the Endings screen.') +
      card('sliders', 'Variables', 'Numbers, yes/no flags and text that remember what the reader did, so later scenes can react.') + '</div></section>' +
      '<section id="g-writing"><h2>' + UI.icon('edit') + 'Writing scenes</h2><div class="tw"><table><thead><tr><th>Step</th><th>What it does</th></tr></thead><tbody>' +
      row('<b>Line</b>', 'Someone speaks, or the narrator describes. Pick an expression to change their face for that line. <code>Ctrl+Enter</code> adds the next line.') +
      row('<b>Background</b>', 'Changes the scene behind everyone, with a dissolve, fade or instant cut.') +
      row('<b>Show / hide character</b>', 'Puts a character on stage at one of five positions, with an expression; showing them again moves them or changes their face.') +
      row('<b>Change variable</b>', 'Adds, subtracts, sets or flips a variable.') +
      row('<b>Jump to scene</b>', 'Goes to another scene right away, usually with a condition: "if trust < 2, jump to The Fight".') +
      row('<b>Illustration (CG)</b>', 'Covers the stage with a full picture; readers unlock it in their Gallery.') +
      row('<b>Music & sound</b>', 'Eight built-in music moods and ten sound effects, or your own uploaded music and sounds.') +
      row('<b>Mini-game</b>', 'A short challenge in the middle of the story (10 games). Winning or losing can lead to different scenes.') +
      row('<b>Effect, pause, chapter card</b>', 'Screen shake, flash, fade to black; a timed pause; a big chapter title.') +
      row('<b>Ask the reader</b>', 'Shows a text box ("What\'s your name?") and saves the answer in a text variable.') +
      row('<b>Writer\'s note</b>', 'A note for you. Readers never see it.') + '</tbody></table></div></section>' +
      '<section id="g-branch"><h2>' + UI.icon('jump') + 'Choices &amp; branches</h2><div class="cards">' +
      card('filter', 'Conditional choices', 'Give a choice a condition. When it isn\'t met, hide the choice or show it locked with a hint ("Needs more courage"): readers learn what they missed.') +
      card('sliders', 'Effects', 'A choice can change variables when picked: <code>courage + 1</code>, <code>met_mira = true</code>.') +
      card('refresh', 'Once-only choices', 'Tick "only once" and loop back to the same scene: a menu of questions that empties as the reader asks them.') +
      card('clock', 'Timed choices', 'Give a scene a timer. If the reader hesitates, the choice you picked is made for them.') +
      card('edit', 'Small differences', 'You don\'t need a whole new scene for a small change: give any line a condition, or use <code>{if …}…{else}…{/if}</code> inside a line.') +
      card('shield', 'Story check', 'The Check button finds choices that lead nowhere, scenes nobody can reach, dead ends and typos in conditions.') + '</div></section>' +
      '<section id="g-games"><h2>' + UI.icon('game') + 'Mini-games</h2><p class="muted">Add a <b>Mini-game</b> step anywhere in a scene. Pick a game, a difficulty and three colours (main, accent and panel) so it matches your novel, then choose what happens next.</p>' +
      '<div class="tw"><table><thead><tr><th>Game</th><th>What the reader does</th></tr></thead><tbody>' +
      Object.keys(NV.GAMES).map(function (k) { return row('<b>' + UI.esc(NV.GAMES[k][0]) + '</b>', UI.esc(NV.GAMES[k][1])); }).join('') + '</tbody></table></div>' +
      '<div class="cards" style="margin-top:14px">' +
      card('jump', 'Win or lose paths', '"If they win" and "If they lose" can each carry on in the scene or lead to another scene. The map draws them as dashed mint arrows.') +
      card('sliders', 'Remember the result', 'Store the result in a yes / no variable (true if they won), then react later: <code>{if won_duel}You beat me!{else}Better luck next time.{/if}</code>') +
      card('refresh', 'Retry & skip', 'Offer "Try again" after a loss, and let readers skip a game (it counts as a loss) so nobody gets stuck.') +
      card('star', 'Difficulty', 'Easy, Normal or Hard changes speed, time limits and how clever the computer plays.') + '</div></section>' +
      '<section id="g-sound"><h2>' + UI.icon('music') + 'Music &amp; sounds</h2><div class="cards">' +
      card('music', 'Built-in moods', 'Calm, Romance, Upbeat, Mystery, Tension, Sad, Dreamy and Rain, made in the browser: they cost no space.') +
      card('upload', 'Your own files', 'Upload MP3, OGG, WAV or M4A in the Sounds tab, as music (loops) or sound effects (play once). Free: up to 1 MB per file, 10 per novel. Pro: 4 MB, 60.') +
      card('download', 'In exported games', 'Your music and sounds are packed into the HTML game, so it plays offline too.') +
      card('shield', 'Rights', 'Only upload audio you made or have a licence for, especially in novels you sell.') + '</div></section>' +
      '<section id="g-vars"><h2>' + UI.icon('sliders') + 'Variables &amp; conditions</h2><div class="tw"><table><thead><tr><th>Write</th><th>Means</th></tr></thead><tbody>' +
      row('<code>trust >= 3</code>', 'trust is 3 or more (also <code>&gt;</code> <code>&lt;</code> <code>&lt;=</code> <code>==</code> <code>!=</code>)') +
      row('<code>has_key</code> / <code>not has_key</code>', 'a yes/no flag is on / off') +
      row('<code>name == "Aki"</code>', 'text comparison (quotes needed)') +
      row('<code>trust >= 2 and (has_key or brave)</code>', 'combine with and, or, not and brackets') +
      row('<code>seen("The Rooftop")</code>', 'the reader visited that scene in this playthrough') +
      row('<code>chose("c3")</code>', 'the reader picked that choice in this playthrough') +
      row('<code>ended("The Promise")</code>', 'the reader reached that ending in any earlier playthrough: perfect for secret routes and "new game +"') +
      '</tbody></table></div></section>' +
      '<section id="g-text"><h2>' + UI.icon('chat') + 'Text styling</h2><div class="tw"><table><thead><tr><th>Write</th><th>Shows</th></tr></thead><tbody>' +
      row('<code>**bold**</code> and <code>*italic*</code>', '<b>bold</b> and <i>italic</i>') +
      row('<code>[player]</code>', 'the value of a variable, e.g. the name the reader typed') +
      row('<code>{if trust >= 3}warmly{else}coldly{/if}</code>', 'different words depending on a condition') +
      row('<code>{color=#ff4f8b}pink{/color}</code>', 'coloured text') +
      row('<code>{big}WHAT?{/big}</code>, <code>{small}psst{/small}</code>', 'bigger or smaller text') +
      row('<code>{shake}trembling{/shake}</code>', 'shaky text') +
      row('<code>{w=0.5}</code>', 'a half-second pause while the text types out') + '</tbody></table></div></section>' +
      '<section id="g-readers"><h2>' + UI.icon('play') + 'What readers get</h2><div class="cards">' +
      card('home', 'Title screen', 'Start, Continue, Load, Endings, Gallery, Story map, Settings and Credits.') +
      card('refresh', 'Rollback & history', 'Back (Backspace or scroll up) undoes lines; History shows everything said. "Back to the last choice" after an ending.') +
      card('clock', 'Auto & skip', 'Auto-play, and Skip that only skips text they\'ve already read (or hold Ctrl).') +
      card('copy', 'Saves', 'Six save slots plus autosave, kept on their device. Quick to resume.') +
      card('map', 'Story map', 'After playing, readers see the scenes they found and can replay from any of them.') +
      card('sliders', 'Settings', 'Text speed, auto pace, text size, music and sound volume, full screen. Works with keyboard, mouse and touch.') + '</div></section>' +
      '<section id="g-renpy"><h2>' + UI.icon('refresh') + 'Coming from Ren\'Py</h2><p class="muted">The same ideas, without scripts. Here\'s where things live.</p><div class="tw"><table><thead><tr><th>Ren\'Py</th><th>ImgNovella</th><th>Notes</th></tr></thead><tbody>' +
      row('<code>label start:</code>', 'Scenes on the map', 'The START badge marks the first one') +
      row('<code>define e = Character("Eileen", color="#c8ffc8")</code>', 'Cast tab', 'Name, colour and an expression picture each') +
      row('<code>e happy "Hi!"</code>', 'A Line with an expression', 'Changes the face if they\'re on stage') +
      row('<code>scene bg park with dissolve</code>', 'Background step', 'dissolve, fade or instant') +
      row('<code>show eileen happy at left</code> / <code>hide</code>', 'Show / hide character', 'Five positions; dissolve, slide or pop') +
      row('<code>menu:</code>', 'Choices', 'Up to 12 per scene') +
      row('<code>"Choice" if flag:</code>', 'Choice condition', 'Plus "show it locked with a hint"') +
      row('<code>menu set</code> / <code>menu:</code> loops', '"Only once" choices', '') +
      row('<code>jump</code> / <code>call</code>', '"Leads to", "Then go to", Jump step', 'Conditional jumps too') +
      row('<code>default points = 0</code>, <code>$ points += 1</code>', 'Variables + Change variable / choice effects', 'Numbers, flags, text') +
      row('<code>if / elif / else</code> blocks', 'Conditions on any step', 'and <code>{if}</code> inside a line') +
      row('<code>renpy.input()</code>', 'Ask the reader', 'Saves into a text variable') +
      row('<code>persistent.*</code>', '<code>ended("…")</code>, Gallery, Story map', 'Kept on the reader\'s device') +
      row('<code>play music</code> / <code>play sound</code>', 'Music & Sound steps', 'Built-in moods, or your uploaded files') +
      row('Mini-games in Python / screens', 'Mini-game step', '10 ready-made games, themed with 3 colours, win / lose paths') +
      row('<code>{b} {i} {color} {w} [var]</code>', '<code>** * {color} {w} [var]</code>', '') +
      row('Build distributions', 'Package & sell', 'One HTML file or an itch.io zip; runs in any browser') + '</tbody></table></div></section>' +
      '<section id="g-sell"><h2>' + UI.icon('download') + 'Sharing &amp; selling</h2><div class="cards">' +
      card('globe', 'Publish', 'Public novels appear in Discover; unlisted ones play by link. Publishing freezes a copy, so you can keep editing.') +
      card('download', 'Package & sell', 'Download your novel as a single HTML file (or an itch.io-ready zip) with every picture inside. Sell it on itch.io, Gumroad, Ko-fi or your own site.') +
      card('star', 'Free & Pro', 'Free: pictures up to 400 × 600 and 5 novels. Pro: up to 1200 × 1800, 100 novels and no ImgNovella credit on exports.') +
      card('heart', 'Starter art', 'The built-in backgrounds, characters and illustrations are free to use in any novel, including ones you sell.') + '</div></section>' +
      '</div></div></div>';
    view.addEventListener('click', function (e) {
      var a = e.target.closest('[data-jump]');
      if (!a) return;
      e.preventDefault();
      var el = view.querySelector('#g-' + a.getAttribute('data-jump'));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Visual novels, in your browser',
    title: 'Write stories where <em>every choice</em> matters',
    lead: 'ImgNovella is a visual novel maker you use online: scenes, characters, branching choices and multiple endings, with no code to learn. Share your novel with a link, or package it as a game and sell it.',
    cta: 'Start creating, free',
    proof: ['Free to start', 'Works on phones', 'Export & sell your game'],
    steps: [['Write your scenes', 'Backgrounds, characters with expressions, dialogue and narration. Pick from the starter art or upload your own.'],
            ['Branch with choices', 'Draw your story on a map. Choices can depend on what readers did earlier and quietly change later scenes.'],
            ['Share or sell it', 'Publish to Discover, send a link, or download a standalone HTML game for itch.io, Gumroad or your own site.']],
    features: [['map', 'A story map, not a script', 'See every scene and branch at once. Drag scenes around, follow the arrows, spot dead ends.'],
               ['sliders', 'Choices that remember', 'Points, flags and names. Lock a choice until the reader earns it, or tweak a single line when they took another path.'],
               ['flag', 'Multiple endings', 'True, good, bad and secret endings that readers collect, with a story map to replay from any scene.'],
               ['clock', 'Timed choices', 'Make readers decide under pressure. If they hesitate, the story decides for them.'],
               ['game', '10 mini-games', 'Drop a challenge into any scene: timing, tic-tac-toe, memory, reaction and more. Win and lose can lead to different scenes.'],
               ['music', 'Music & sound', 'Eight built-in moods and ten effects, or upload your own music and sounds.'],
               ['shield', 'A story checker', 'One click finds choices that lead nowhere, unreachable scenes and typos in conditions.'],
               ['play', 'Playtest with x-ray vision', 'Play from any scene and watch (or change) every variable live.'],
               ['download', 'Package & sell', 'One HTML file with saves, rollback, gallery and endings built in. Ready for itch.io.'],
               ['image', 'Starter art included', 'Backgrounds, a cast with six expressions each, illustrations and covers, free for any novel.'],
               ['refresh', 'Readers in control', 'Rollback, history, auto, skip, six save slots and adjustable text speed and size.']],
    faq: [['Do I need to know how to code?', 'No. Everything Ren\'Py does with scripts (characters, menus, jumps, variables, conditions), ImgNovella does with forms and a map.'],
          ['Is it free?', 'Yes. The Free plan includes every editor feature, publishing and exporting. Pictures are kept to 400 × 600 px and you can have 5 novels. Pro allows 1200 × 1800 pictures, 100 novels and removes the ImgNovella credit from exported games.'],
          ['Can I sell what I make?', 'Yes. "Package & sell" downloads your novel as a standalone HTML game (or an itch.io-ready zip). Sell it wherever you like; we take no cut. Only use art you have the rights to: the built-in starter art is free to use.'],
          ['Do readers need an account?', 'No. Anyone can play published novels. Their saves, endings and settings stay in their own browser. An account is only needed to like novels or to create.'],
          ['Who can see my novel?', 'Only you, until you publish. Public novels appear in Discover; unlisted ones only play for people with the link. Publishing saves a copy, so you can keep editing in private.'],
          ['Does it work on my phone?', 'Yes, for reading and for writing. Novels can be portrait (made for phones) or landscape.']]
  };

  // the scene behind the dialogue box: the park, Mira, petals, and the story map peeking in
  function heroArt() {
    var petals = '';
    for (var i = 0; i < 12; i++) petals += '<i class="lp-petal" aria-hidden="true" style="left:' + (4 + i * 8) + '%;top:' + (-10 - (i % 3) * 8) + '%;animation-delay:' + (i * -1.1) + 's;animation-duration:' + (8 + i % 4) + 's"></i>';
    return '<img class="bg" alt="" src="_/theme/demo-bg-sakura-park.svg"><img class="sp" alt="" src="_/theme/demo-mira-happy.svg">' + petals +
      '<div class="lp-map" aria-hidden="true"><p class="t">Story map</p><svg viewBox="0 0 220 210"><g fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--c-ink)" opacity=".6">' +
      '<path d="M110 34 C110 60 50 50 50 82"/><path d="M110 34 C110 60 170 50 170 82"/><path d="M50 108 C50 136 110 126 110 152"/><path d="M170 108 C170 136 110 126 110 152" stroke-dasharray="6 5"/><path d="M170 108 C175 140 200 150 196 166"/></g>' +
      '<g font-family="Nunito, sans-serif" font-weight="800" font-size="10" text-anchor="middle">' +
      '<rect x="62" y="10" width="96" height="26" rx="10" fill="var(--c-brand-soft)" stroke="var(--c-outline)" stroke-width="2"/><text x="110" y="27" fill="var(--c-ink)">Petals on the path</text>' +
      '<rect x="10" y="82" width="80" height="26" rx="10" fill="var(--c-surface)" stroke="var(--c-outline)" stroke-width="2"/><text x="50" y="99" fill="var(--c-ink)">Paper chase</text>' +
      '<rect x="130" y="82" width="80" height="26" rx="10" fill="var(--c-surface)" stroke="var(--c-outline)" stroke-width="2"/><text x="170" y="99" fill="var(--c-ink)">Running late</text>' +
      '<rect x="70" y="152" width="80" height="26" rx="10" fill="#ffd24a" stroke="var(--c-outline)" stroke-width="2"/><text x="110" y="169" fill="#2a2238">★ The Promise</text>' +
      '<rect x="160" y="166" width="56" height="26" rx="10" fill="#c9bfd6" stroke="var(--c-outline)" stroke-width="2"/><text x="188" y="183" fill="#2a2238">★ Bad</text></g></svg></div>';
  }

  UI.page('landing', { title: 'Make visual novels online' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#studio" data-go="studio"><span class="n">1</span>Open your studio ' + UI.icon('arrow') + '</a><a class="ui-btn lg" href="#discover" data-go="discover"><span class="n">2</span>Play novels</a>'
      : '<a class="ui-btn primary lg" href="#auth/signup" data-go="auth/signup"><span class="n">1</span>' + esc(C.cta) + ' ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn lg" href="#discover" data-go="discover"><span class="n">2</span>Play a novel first</a>';
    view.innerHTML =
      '<section class="lp-hero">' + heroArt() + '<div class="ui-wrap"><div class="lp-vnbox"><span class="who">ImgNovella</span>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div></div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>From first line to finished game</h2><p>Three steps, and you can do them all on a phone.</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Everything a visual novel needs</h2><p>The power of Ren\'Py, without the scripting, and a few things it never had.</p></div>' +
        '<div class="ui-grid lp-feats">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Play something now</h2><p>No account needed. Every story has more than one ending.</p></div><div class="lp-shelf" data-shelf>' +
        '<div class="ui-skel" style="height:300px"></div><div class="ui-skel" style="height:300px"></div><div class="ui-skel" style="height:300px"></div><div class="ui-skel" style="height:300px"></div></div>' +
        '<div style="text-align:center;margin-top:20px"><a class="ui-btn" href="#discover" data-go="discover">' + UI.icon('search') + 'Browse every novel</a></div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-two">' +
        '<div class="ui-card"><span class="ui-badge brand">For creators</span><h2 style="margin-top:10px">Write the story you want to read</h2><ul>' +
        ['A finished starter novel to remix', 'Conditions, variables and timed choices', '10 mini-games and your own music', 'Playtest from any scene', 'Publish, share a link, or sell the game'].map(function (x) { return '<li>' + UI.icon('check') + x + '</li>'; }).join('') +
        '</ul><a class="ui-btn primary" href="#' + (me ? 'studio' : 'auth/signup') + '" data-go="' + (me ? 'studio' : 'auth/signup') + '">' + UI.icon('edit') + 'Start creating</a></div>' +
        '<div class="ui-card"><span class="ui-badge mint">For readers</span><h2 style="margin-top:10px">Stories that change when you do</h2><ul>' +
        ['Free novels, playable on any device', 'Save anywhere, roll back any line', 'Collect every ending', 'A story map to replay any path'].map(function (x) { return '<li>' + UI.icon('check') + x + '</li>'; }).join('') +
        '</ul><a class="ui-btn" href="#discover" data-go="discover">' + UI.icon('play') + 'Find a story</a></div></div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>Your story has more than one ending.</h2><p>Start with the starter novel and change everything.</p></div>' +
        (me ? '<a class="ui-btn lg" href="#studio" data-go="studio">Open your studio</a>' : '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + '</a>') +
      '</div></div></section>';
    UI.apiQuiet('library', null, null, 'popular').then(function (d) {
      var shelf = view.querySelector('[data-shelf]');
      if (!shelf) return;
      shelf.innerHTML = d.stories.length ? d.stories.slice(0, 4).map(NVT.cardHtml).join('') : '<div class="ui-empty" style="grid-column:1/-1">' + UI.icon('book') + '<h3>The first novels are being written</h3><p>Yours could be one of them.</p></div>';
    }).catch(function () {});
  });
})();

/* ===== play.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('play', { title: 'Play' }, function (view, ctx) {
    var slug = ctx.args[0], draft = ctx.args[1] === 'draft', player = null, R = null;
    view.innerHTML = '<div class="ui-wrap"><div class="pl"><div class="ui-skel pl-stage"></div><div class="ui-skel" style="height:320px"></div></div></div>';
    function endedHere() {
      try { var p = JSON.parse(localStorage.getItem('nvp:' + (draft ? 'draft-' : '') + slug) || '{}'); return p.endings || {}; } catch (e) { return {}; }
    }
    function drawInfo() {
      var c = R.story, s = c.stats || {}, box = view.querySelector('[data-info]');
      var endings = (R.data.scenes || []).filter(function (x) { return x.ending; }), mine = endedHere(), found = endings.filter(function (x) { return mine[x.id]; }).length;
      var total = endings.reduce(function (a, x) { return a + (R.ending_counts[x.id] || 0); }, 0);
      box.innerHTML = (R.draft ? '<div class="pl-draft">' + UI.icon('edit') + ' You\'re playing your draft. Readers see the published version.</div>' : '') +
        '<div><div class="ui-row"><span class="ui-badge">' + esc(c.genre || 'Story') + '</span><span class="ui-badge">' + esc(c.rating) + '</span>' + (c.featured ? '<span class="ui-badge brand">' + UI.icon('star') + 'Featured</span>' : '') + '</div>' +
        '<h1>' + esc(c.title) + '</h1><div class="pl-by">by ' + esc(c.author) + (c.author_bio ? '<small>' + esc(c.author_bio) + '</small>' : '') + '</div></div>' +
        (c.blurb ? '<p style="margin:0">' + esc(c.blurb) + '</p>' : '') +
        ((c.tags || []).length ? '<div class="ui-row">' + c.tags.map(function (t) { return '<span class="ui-badge mint">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="pl-acts"><button class="ui-btn ' + (R.liked ? 'primary pl-liked' : '') + '" data-like>' + UI.icon('heart') + (R.liked ? 'Liked' : 'Like') + ' · ' + c.likes + '</button>' +
        '<button class="ui-btn" data-share>' + UI.icon('link') + 'Share</button>' +
        (c.can_edit ? '<a class="ui-btn" href="#edit/' + esc(c.id) + '" data-go="edit/' + esc(c.id) + '">' + UI.icon('edit') + 'Edit</a>' : '') + '</div>' +
        '<div class="ui-card pl-nums"><div><b>' + c.plays.toLocaleString() + '</b><span>plays</span></div><div><b>' + (s.endings || 0) + '</b><span>endings</span></div><div><b>~' + (s.minutes || 1) + '</b><span>minutes</span></div></div>' +
        (endings.length ? '<div class="ui-card pl-ends"><h3 style="margin:0">Endings <span class="muted" style="font-size:.95rem">· you found ' + found + ' of ' + endings.length + '</span></h3>' +
          endings.map(function (x) {
            var got = !!mine[x.id], n = R.ending_counts[x.id] || 0, pct = total ? Math.round(n / total * 100) : 0;
            return '<div class="pl-end k-' + esc(x.ending.kind) + '"><span class="nv-kind"></span><span>' + (got ? esc(NV.plain(x.ending.title, {})) : '??? <span class="muted small">' + esc(NV.ENDING_KINDS[x.ending.kind]) + '</span>') + '</span><span class="muted small">' + (total ? pct + '% of readers' : '') + '</span>' +
              '<div class="pl-bar"><i style="width:' + pct + '%"></i></div></div>';
          }).join('') + '</div>' : '') +
        '<p class="small muted" style="margin:0">Tip: tap or press Space to continue, Backspace to go back, and Esc for the menu. Your saves stay on this device.</p>' +
        (c.can_edit ? '' : '<button class="ui-btn ghost sm" style="justify-self:start" data-report>' + UI.icon('info') + 'Report this novel</button>');
    }
    function mount() {
      var c = R.story, host = view.querySelector('[data-plhost]');
      if (player) player.destroy();
      player = NV.mount(host, R.data, {
        resolve: NVT.img, storageKey: (R.draft ? 'draft-' : '') + slug, meta: { title: c.title, author: c.author },
        branding: false,
        onStart: function () { if (!R.draft) UI.apiQuiet('record_play', slug, 'start').catch(function () {}); },
        onEnding: function (sid) { if (!R.draft) UI.apiQuiet('record_play', slug, 'ending', sid).catch(function () {}); setTimeout(drawInfo, 400); }
      });
    }
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-like]')) {
        if (!ctx.me) { UI.after = location.hash; UI.toast('Sign in to like novels'); UI.go('auth'); return; }
        UI.busy(e.target.closest('[data-like]'), UI.api('toggle_like', slug)).then(function (r) { R.liked = r.liked; R.story.likes = r.likes; drawInfo(); });
      }
      if (e.target.closest('[data-share]')) {
        var link = location.origin + location.pathname + '#play/' + slug;
        if (navigator.share) navigator.share({ title: R.story.title, text: 'Play "' + R.story.title + '" on ImgNovella', url: link }).catch(function () {});
        else ED.copy(link);
      }
      if (e.target.closest('[data-report]')) {
        var m = UI.modal('<h2>Report this novel</h2><p class="muted">Tell us what\'s wrong (for example: harmful content, stolen art, wrong rating). An admin will review it.</p>' +
          '<form class="ui-stack" data-rf><textarea name="reason" required minlength="5" rows="4"></textarea><div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">Send report</button></div></form>');
        m.el.querySelector('[data-rf]').addEventListener('submit', function (ev) {
          ev.preventDefault();
          UI.busy(ev.target.querySelector('[type=submit]'), UI.api('report_story', slug, UI.formData(ev.target).reason)).then(function () { m.close(); UI.toast('Thanks. We\'ll take a look.', 'ok'); });
        });
      }
    });
    var ready = UI.api('get_play', slug, draft).then(function (r) {
      R = r;
      document.title = r.story.title + ' · ' + UI.config.name;
      var land = (r.data.settings || {}).orientation === 'landscape';
      view.innerHTML = '<div class="ui-wrap" style="max-width:1320px"><div class="pl"><div class="pl-stage' + (land ? ' landscape' : '') + '" data-plhost></div><aside class="pl-info" data-info></aside></div><div data-more></div></div>';
      mount(); drawInfo();
      UI.apiQuiet('creator_page', slug).then(function (m) {
        if (!m.stories.length) return;
        view.querySelector('[data-more]').innerHTML = '<div class="pl-more"><h2>More by ' + esc(r.story.author) + '</h2><div class="dc-grid">' + m.stories.map(NVT.cardHtml).join('') + '</div></div>';
      }).catch(function () {});
    }, function (err) {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('book') + '<h3>We couldn\'t open this novel</h3><p>' + esc(err.message) + '</p><a class="ui-btn primary" href="#discover" data-go="discover">Find another story</a></div></div>';
    });
    return { ready: ready, destroy: function () { if (player) player.destroy(); } };
  });
})();

/* ===== pro.html ===== */
(function () {
  UI.page('pro', { title: 'ImgNovella Pro' }, function (view, ctx) {
    var me = ctx.me, isPro = me && me.plan === 'pro';
    function li(t) { return '<li>' + UI.icon('check') + '<span>' + t + '</span></li>'; }
    view.innerHTML = '<div class="ui-wrap"><div class="pr-hero"><div class="eyebrow">Plans</div><h1>Bigger pictures, more novels, your name only</h1>' +
      '<p class="muted" style="font-size:1.1rem">Free has everything you need to write, publish and sell a complete visual novel. Pro is for creators who want crisp art and a clean, unbranded game.</p></div>' +
      '<div class="pr-grid"><div class="ui-card pr-card"><span class="ui-badge" style="justify-self:start">Free</span><h2>Free</h2><div class="big">$0</div><ul>' +
      li('Pictures up to <b>400 × 600</b> px (either way round), shrunk for you') + li('<b>5</b> novels, <b>40</b> pictures each') + li('Your own music and sounds: <b>10</b> files per novel, up to <b>1 MB</b> each') + li('Every editor feature: map, conditions, variables, timed choices, 10 mini-games, music') +
      li('Publish publicly or by link') + li('Export standalone HTML games and sell them anywhere') + li('A small "Made with ImgNovella" credit on the title screen') + '</ul>' +
      (me ? (isPro ? '' : '<span class="ui-badge good" style="justify-self:start">Your plan</span>') : '<a class="ui-btn" href="#auth/signup" data-go="auth/signup">Start free</a>') + '</div>' +
      '<div class="ui-card pr-card pro"><span class="ui-badge brand" style="justify-self:start">' + UI.icon('star') + 'Pro</span><h2>Pro</h2><div class="big">For serious creators</div><ul>' +
      li('Pictures up to <b>1200 × 1800</b> px: sharp on big screens') + li('<b>100</b> novels, <b>300</b> pictures each') + li('<b>60</b> sound files per novel, up to <b>4 MB</b> each') + li('Remove the ImgNovella credit from exported games') +
      li('Everything in Free') + '</ul>' +
      (isPro ? '<span class="ui-badge good" style="justify-self:start">' + UI.icon('check') + 'You\'re Pro. Thank you!</span>'
        : me ? '<form class="ui-stack" data-req><label class="ui-field"><span>Tell us about your project <em>(optional)</em></span><textarea name="msg" rows="3" placeholder="What are you making? Where will you sell it?"></textarea></label>' +
          '<button class="ui-btn primary" type="submit">' + UI.icon('star') + 'Ask for Pro</button><p class="ui-hint" style="margin:0">Pro is in early access: we switch it on by hand and email you at ' + UI.esc(me.email) + '.</p></form>'
          : '<a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Sign up, then ask for Pro</a>') + '</div></div></div>';
    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-req]')) return;
      e.preventDefault();
      var msg = 'Pro request from ' + me.name + ' (' + me.email + '). ' + (UI.formData(e.target).msg || '');
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('submit_feedback', 'pro', msg, null, { page: '#pro' })).then(function () {
        e.target.innerHTML = '<div class="ui-note">' + UI.icon('check') + ' Request sent! We\'ll switch on Pro and let you know.</div>';
      });
    });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label>' +
      '<label class="ui-field"><span>A line about you <em>(shown under your name on your novels)</em></span><input type="text" name="bio" value="' + esc(me.bio || '') + '" maxlength="160" placeholder="e.g. Cozy mysteries and cats."></label>' +
      '<p class="small muted" style="margin:0">Plan: <b>' + (me.plan === 'pro' ? 'Pro' : 'Free') + '</b> · <a href="#pro" data-go="pro">compare plans</a></p>' +
      '<button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name).then(function (r) { return UI.api('update_bio', v.bio || '').then(function () { return r; }); })).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== studio.html ===== */
(function () {
  var esc = UI.esc;
  function statusBadge(c) {
    if (c.status === 'public') return '<span class="ui-badge good">' + UI.icon('globe') + 'Public</span>';
    if (c.status === 'unlisted') return '<span class="ui-badge mint">' + UI.icon('link') + 'Unlisted</span>';
    return '<span class="ui-badge">Draft</span>';
  }
  UI.page('studio', { title: 'Your studio', nav: 'Studio', icon: 'edit', auth: 'user', order: 10 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:90px;margin-bottom:18px"></div><div class="ui-grid"><div class="ui-skel" style="height:300px"></div><div class="ui-skel" style="height:300px"></div></div></div>';
    var D = null;
    function draw() {
      var t = D.totals, L = D.limits, first = ctx.me.name.split(' ')[0];
      view.innerHTML = '<div class="ui-wrap"><div class="sd-hero"><div><div class="eyebrow">Your studio</div><h1>' + (D.stories.length ? 'Welcome back, ' + esc(first) + '!' : 'Let\'s make your first novel, ' + esc(first) + '!') + '</h1>' +
        '<p class="muted" style="margin:6px 0 0">' + (D.stories.length ? 'Pick up where you left off, or start something new.' : 'Start blank, or from a finished example you can pull apart and remix.') + '</p></div>' +
        '<button class="ui-btn primary lg" data-new>' + UI.icon('plus') + 'New novel</button></div>' +
        (D.stories.length ? '<div class="sd-stats"><div class="ui-card"><b>' + t.novels + '</b><span>novels</span></div><div class="ui-card"><b>' + t.published + '</b><span>published</span></div>' +
          '<div class="ui-card"><b>' + t.plays.toLocaleString() + '</b><span>plays</span></div><div class="ui-card"><b>' + t.likes.toLocaleString() + '</b><span>likes</span></div></div>' : '') +
        '<div class="sd-list">' + D.stories.map(function (c) {
          var s = c.stats || {};
          return '<article class="ui-card sd-card" data-id="' + esc(c.id) + '"><a href="#edit/' + esc(c.id) + '" data-go="edit/' + esc(c.id) + '" aria-label="Edit ' + esc(c.title) + '">' + NVT.coverHtml(c) + '</a>' +
            '<div class="sd-body"><div class="sd-meta">' + statusBadge(c) + (c.changes ? '<span class="ui-badge warn">Unpublished edits</span>' : '') + (c.genre ? '<span class="ui-badge">' + esc(c.genre) + '</span>' : '') + '</div>' +
            '<h3>' + esc(c.title) + '</h3>' +
            '<div class="sd-nums">' + (s.scenes || 0) + ' scenes · ' + (s.endings || 0) + ' endings · ' + (s.words || 0).toLocaleString() + ' words' + (c.status !== 'draft' ? ' · ' + c.plays.toLocaleString() + ' plays · ♥ ' + c.likes : '') + '</div>' +
            '<div class="small faint">Edited ' + esc(UI.ago(c.updated)) + '</div>' +
            '<div class="sd-acts"><a class="ui-btn primary" href="#edit/' + esc(c.id) + '" data-go="edit/' + esc(c.id) + '">' + UI.icon('edit') + 'Edit</a>' +
            (c.status !== 'draft' ? '<a class="ui-btn" href="#play/' + esc(c.slug) + '" data-go="play/' + esc(c.slug) + '">' + UI.icon('play') + 'Play</a>' : '') +
            '<button class="ui-btn ghost icon" data-dup aria-label="Duplicate" title="Duplicate">' + UI.icon('copy') + '</button>' +
            '<button class="ui-btn ghost icon" data-del aria-label="Delete" title="Delete">' + UI.icon('trash') + '</button></div></div></article>';
        }).join('') + '<button class="sd-new" data-new>' + UI.icon('plus') + '<span>New novel</span><span class="small" style="font-weight:600">' + D.stories.length + ' of ' + L.novels + ' on ' + esc(L.label) + '</span></button></div>' +
        (L.plan === 'pro' ? '' : '<div class="ui-card sd-plan"><div><h3 style="margin:0">' + UI.icon('star') + ' You\'re on the Free plan</h3><p class="muted">Pictures up to 400 × 600, ' + L.novels + ' novels, ' + L.images + ' pictures each, and a small "Made with ImgNovella" credit on exports.</p></div>' +
          '<a class="ui-btn" href="#pro" data-go="pro">See Pro ' + UI.icon('arrow') + '</a></div>') + '</div>';
    }
    function newNovel() {
      var m = UI.modal('<h2>New novel</h2><form class="ui-stack" data-nf><label class="ui-field"><span>Title</span><input type="text" name="title" maxlength="80" required placeholder="e.g. The Lighthouse Letters"></label>' +
        '<div class="ui-field"><span>Start from</span><div class="tpl"><label><input type="radio" name="template" value="starter" checked><span><b>' + UI.icon('sparkle') + ' The starter story</b><small>"Cherry Blossom Promise": 9 scenes, 3 endings, variables, a timed choice. Learn by remixing.</small></span></label>' +
        '<label><input type="radio" name="template" value="blank"><span><b>' + UI.icon('edit') + ' A blank page</b><small>One scene and a background. Build it your way.</small></span></label></div></div>' +
        '<div class="ui-field"><span>Stage shape</span><div class="tpl"><label><input type="radio" name="orientation" value="portrait" checked><span><b>Portrait</b><small>Made for phones (2:3)</small></span></label>' +
        '<label><input type="radio" name="orientation" value="landscape"><span><b>Landscape</b><small>Classic desktop visual novel (3:2)</small></span></label></div></div>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('sparkle') + 'Create</button></div></form>');
      var f = m.el.querySelector('[data-nf]');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = UI.formData(f);
        UI.busy(f.querySelector('[type=submit]'), UI.api('create_story', v.title, v.template, v.orientation)).then(function (r) {
          m.close(); UI.toast('Created! Have fun.', 'ok'); UI.go('edit', r.story.id, v.template === 'starter' ? 'map' : 'write');
        });
      });
    }
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-new]')) { newNovel(); return; }
      var card = e.target.closest('[data-id]');
      if (!card) return;
      var sid = card.getAttribute('data-id'), c = D.stories.filter(function (x) { return x.id === sid; })[0];
      if (e.target.closest('[data-dup]')) UI.api('duplicate_story', sid).then(function () { UI.toast('Duplicated', 'ok'); load(); });
      if (e.target.closest('[data-del]')) {
        UI.confirm({ title: 'Delete "' + c.title + '"?', text: 'Its scenes, pictures, likes and stats are deleted for good.', ok: 'Delete', danger: true }).then(function (y) {
          if (y) UI.api('delete_story', sid).then(function () { UI.toast('Deleted'); load(); });
        });
      }
    });
    function load() { return UI.api('studio_home').then(function (r) { D = r; draw(); }); }
    return load();
  });
})();
