/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways. Signed out: landing (Watch section, footer links, the live shelf), Discover (+ a
   genre), Guide, Pro, a demo novel's play page (the player starts), a missing novel, sign in / up. Then as a new
   creator: the empty studio, the New novel dialog, a new starter novel in the editor (every editor tab), the studio
   with it, a demo novel (like), profile, pro. Then as admin: every Admin tab. Python/JS errors are caught by
   ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return $$((root || '') + ' button').find((b) => re.test(b.textContent.trim()) && visible(b)); }
  const modal = () => $$('.modal, .anvil-modal').find((m) => visible(m) && m.innerText.trim().length > 10);
  function check(name, expect) {
    const main = $('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) {
      const wide = $$('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(name + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + name);
  }
  async function open(hash, expect, ready) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && location.hash.split('/')[0] === hash.split('/')[0], hash, 40000);
    if (ready) await until(ready, hash + ' content', 30000);
    await sleep(800);
    check(hash, expect);
  }
  async function dialog(name, opener, expect) {
    if (!opener) { bad.push('dialog ' + name + ': no button to open it'); return; }
    opener.click();
    const dlg = await until(modal, 'dialog ' + name, 15000);
    await sleep(400);
    const problems = [];
    if (expect && !expect.test(dlg.innerText)) problems.push('missing ' + expect);
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push('dialog ' + name + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + 'dialog ' + name);
    const close = $$('.modal button, .anvil-modal button').find((b) => /^(Cancel|Close)$/.test(b.textContent.trim()) && visible(b));
    if (close) close.click();
    await until(() => !modal(), 'dialog closed', 10000);
    await sleep(300);
  }
  const signedIn = () => visible($('.anvil-role-avatar button'));
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      if (location.hash === '#studio' && window.UI_READY && signedIn()) return true;
      const msg = $('.au-card .anvil-role-msg-error');
      if (msg && visible(msg) && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && $$('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type($('.au-card input[type=email]'), email); type($('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash === '#studio' && window.UI_READY && signedIn(), 'signed in as ' + email, 40000);
  }
  async function signOut() {
    $('.anvil-role-avatar button').click();
    await sleep(300);
    button(/Sign out/, '.ui-menu').click();
    await until(() => location.hash === '#landing' && window.UI_READY && !signedIn(), 'signed out');
    await sleep(500);
  }
  try {
    // ---- signed out
    await open('#landing', /every choice/, () => $$('.dc-card').length || visible($('.ui-empty')));
    if (!$('.ytf-cover')) bad.push('no Watch section');
    const foot = $('.ui-footer').innerText;
    for (const t of ['Submit feedback', 'Privacy & Terms', 'arkvital.com', 'addanapp.com']) if (foot.indexOf(t) < 0) bad.push('footer misses ' + t);
    await open('#discover', /Discover stories/, () => $$('.dc-card').length);
    const playHref = $('.dc-card').getAttribute('href');
    log.push('     ' + $$('.dc-card').length + ' novels on Discover; playing ' + playHref);
    await open('#discover/Romance', /Romance/);
    await open('#guide', /How ImgNovella works/);
    await open('#pro', /Bigger pictures/);
    await open(playHref, /Endings/, () => $('.nvp-stage, .nvp') && $('.nv-player').innerText.trim().length > 3);
    await open('#play/no-such-novel', /couldn't open this novel/);
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);

    // ---- a new creator
    const pw = 'Nv-' + Math.random().toString(36).slice(2) + '-Kq7';
    if (!(await signUp('Smoke Creator', 'smoke' + Date.now() + '@example.com', pw))) throw new Error('sign-up failed');
    await sleep(800);
    check('#studio (empty)', /first novel/);
    await dialog('new novel', button(/New novel/, '.sd-hero'), /Stage shape/);
    button(/New novel/, '.sd-hero').click();
    const dlg = await until(modal, 'new novel dialog');
    type(dlg.querySelector('input[type=text]'), 'Smoke Test Novel');
    $$('.anvil-modal button, .modal button').find((b) => /^Create$/.test(b.textContent.trim()) && visible(b)).click();
    await until(() => /^#edit\//.test(location.hash) && window.UI_READY && $('.ed'), 'the editor', 40000);
    await sleep(1500);
    check('#edit (map)', /Smoke Test Novel|Map/);
    const editId = location.hash.split('/')[1];
    for (const tab of ['write', 'cast', 'pics', 'sounds', 'vars', 'settings', 'map']) {
      await open('#edit/' + editId + '/' + tab, null, () => $('.ed'));
    }
    await open('#studio', /Smoke Test Novel/, () => $$('.sd-card').length);
    await open(playHref, /Endings/, () => $('.nv-player') && $('.nv-player').innerText.trim().length > 3);
    const like = button(/^Like/, '.pl-acts');
    if (like) {
      like.click();
      await until(() => button(/^Liked/, '.pl-acts'), 'liked', 20000);
      log.push('ok   like');
      button(/^Liked/, '.pl-acts').click();
      await sleep(1500);
    } else bad.push('no Like button');
    await open('#profile', /Appearance/);
    await open('#pro', /Ask for Pro/);
    await open('#landing', /Open your studio/);
    await signOut();

    // ---- admin (ADMIN_EMAILS in Accounts.py): sign up the first time, sign in after that
    const adminPw = 'Nv-smoke-adm-93Kx-7q';
    if (!(await signUp('Admin Tester', 'arkulinskis@gmail.com', adminPw))) await signIn('arkulinskis@gmail.com', adminPw);
    for (const t of ['overview', 'feedback', 'novels', 'reports', 'users', 'demo']) await open('#admin/' + t, /Admin/);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    const main = $('.ui-main');
    log.push('at ' + location.hash + ': ' + (main ? main.innerText : '').replace(/\s+/g, ' ').slice(0, 300));
    if (errs.length) log.push('errors: ' + errs.join(' / '));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
