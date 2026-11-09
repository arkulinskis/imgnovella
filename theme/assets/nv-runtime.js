/* nv-runtime.js: THE visual novel player (window.NV = NovellaRuntime()). Self-contained on purpose: exported
   games embed NovellaRuntime.toString() as-is, so no UI.*, no app globals. Moved unchanged from web/pages/_nv_runtime.html. */
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
