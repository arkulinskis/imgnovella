/* nv-tools.js: studio helpers (window.NVT): built-in art, picture URLs, the story checker, resizing, map layout,
   packaging a novel as a standalone HTML game. Moved unchanged from web/pages/_nv_tools.html. */
(function () {
  'use strict';
  var NVT = window.NVT = {};

  /* ---------------------------------------------------------------- built-in starter art (tools/make_art.py draws it) */
  var A = [];
  function add(kind, names, label) { names.forEach(function (n) { A.push({ key: 'demo:' + n, name: label(n), kind: kind }); }); }
  var nice = function (s) { return s.replace(/^(bg|cg|cover)-/, '').replace(/-/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); }); };
  add('bg', ['bg-sakura-park', 'bg-sakura-night', 'bg-classroom', 'bg-cafe', 'bg-station-night', 'bg-rooftop-sunset', 'bg-library', 'bg-bedroom', 'bg-festival', 'bg-shrine', 'bg-beach', 'bg-spaceship', 'bg-station-dawn'], nice);
  ['mira', 'ren', 'sol', 'hana'].forEach(function (c) { add('sprite', ['neutral', 'happy', 'sad', 'surprised', 'angry', 'shy'].map(function (e) { return c + '-' + e; }), nice); });
  add('sprite', ['kuro-neutral', 'kuro-happy', 'kuro-surprised', 'stranger-neutral', 'stranger-smile', 'byte-neutral', 'byte-happy', 'byte-sad', 'byte-surprised', 'yoru-neutral', 'yoru-happy', 'yoru-surprised'], nice);
  add('cg', ['cg-promise', 'cg-train', 'cg-fireworks', 'cg-lanterns', 'cg-wishrack'], nice);
  add('cover', ['cover-cherry', 'cover-train', 'cover-rooftop', 'cover-library', 'cover-festival', 'cover-signal', 'cover-shrine', 'cover-cafe', 'cover-beach', 'cover-lantern'], nice);
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
