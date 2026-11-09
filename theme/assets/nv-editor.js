/* nv-editor.js: the novel editor, one JavaScript engine screen (UI.page('edit', ...)) mounted by
   client_code/Components/Screen, plus its shared parts (window.ED: step types, picture picker, preview, playtest,
   publish and Package & sell dialogs). Moved unchanged from web/pages/_ed.html + edit.html; the UI.* helpers it uses
   come from nv-kit.js. */
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
