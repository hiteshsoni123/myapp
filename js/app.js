/* =========================================================================
   Dhandha — App controller (v2: Instagram-style, concise, bilingual)
   ========================================================================= */
(function () {
  'use strict';

  const E = window.DhandhaEngine, S = window.DhandhaStore, ART = window.DhandhaArt, AU = window.DhandhaAudio;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { screen: null, feed: [], offset: 0, loading: false, playingId: null };
  let lang = localStorage.getItem('dhandha.lang') || 'both';

  /* ======================= ROUTER ======================= */
  function go(name) {
    $$('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-' + name));
    $('#bottomnav').classList.toggle('hidden', name === 'auth' || name === 'interests');
    $$('#bottomnav .nav-item').forEach(b => b.classList.toggle('on', b.dataset.go === name));
    state.screen = name;
    AU.stop(); hideAudioBar(); state.playingId = null;
    if (name === 'feed' && !state.feed.length) loadMore(true);
    if (name === 'saved') renderSaved();
    if (name === 'profile') renderProfile();
    const sc = $('#feedScroll'); if (sc) sc.scrollTop = 0;
  }

  /* ======================= LANGUAGE ======================= */
  function applyLang() { document.body.dataset.lang = lang; $('#langBtn').textContent = lang === 'hi' ? 'हिं' : (lang === 'en' ? 'EN' : 'हिं+EN'); }
  function cycleLang() {
    lang = lang === 'both' ? 'hi' : (lang === 'hi' ? 'en' : 'both');
    localStorage.setItem('dhandha.lang', lang);
    applyLang();
    toast(lang === 'hi' ? 'सिर्फ़ Hindi' : lang === 'en' ? 'English only' : 'Hindi + English');
  }

  /* ======================= AUTH ======================= */
  function initAuth() {
    let mode = 'signup';
    const setMode = m => {
      mode = m;
      $('#authTitle').textContent = m === 'signup' ? 'स्वागत है 🙏' : 'वापसी पर स्वागत है';
      $('#authSub').textContent = m === 'signup' ? 'नाम और password डालो — बस शुरू। ' : 'नाम और password से login करो.';
      $('#authBtn').textContent = m === 'signup' ? 'शुरू करो' : 'Login';
      $('#authSwap').innerHTML = m === 'signup' ? 'पहले से account है? <b>Login</b>' : 'नया account? <b>Sign up</b>';
      $('#regionWrap').style.display = m === 'signup' ? '' : 'none';
      $('#authError').classList.add('hidden');
    };
    $('#authSwap').addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
    $('#authForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const name = $('#authName').value.trim(), pw = $('#authPw').value, region = $('#authRegion').value.trim();
      const err = $('#authError');
      if (name.length < 2) return showErr(err, 'नाम कम से कम 2 अक्षर का हो.');
      if (pw.length < 4) return showErr(err, 'Password कम से कम 4 character.');
      const res = mode === 'signup' ? S.signup(name, pw, region) : S.login(name, pw);
      if (!res.ok) return showErr(err, res.error);
      $('#greetName').textContent = res.user.name;
      go(S.areas().length ? 'feed' : 'interests');
    });
    function showErr(el, m) { el.textContent = m; el.classList.remove('hidden'); }
  }

  /* ======================= INTERESTS ======================= */
  function selectedChips() { return $$('#sugBox .chip.on').map(c => c.dataset.area); }
  function renderSuggestions() {
    $('#sugBox').innerHTML = Object.keys(E.SUGGESTIONS).map(cat => `
      <div class="sug-group"><div class="sug-cat">${esc(cat)}</div>
      <div class="chips">${E.SUGGESTIONS[cat].map(a => `<button class="chip" data-area="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>`).join('');
    $('#sugBox').addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c || c.disabled) return;
      c.classList.toggle('on');
      $('#interestCount').textContent = selectedChips().length;
      $('#startFeedBtn').disabled = selectedChips().length === 0;
    });
  }
  function initInterests() {
    renderSuggestions();
    $('#customAddBtn').addEventListener('click', addCustom);
    $('#customAdd').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
    function addCustom() {
      const v = $('#customAdd').value.trim(); if (!v) return;
      v.split(',').map(x => x.trim()).filter(Boolean).forEach(a => {
        const ex = $(`#sugBox .chip[data-area="${a}"]`);
        if (ex) ex.classList.add('on');
        else {
          let g = $('#customGroup');
          if (!g) { g = document.createElement('div'); g.className = 'sug-group'; g.id = 'customGroup'; g.innerHTML = `<div class="sug-cat">आपके अपने</div><div class="chips"></div>`; $('#sugBox').prepend(g); }
          const b = document.createElement('button'); b.className = 'chip on'; b.dataset.area = a; b.textContent = a;
          b.addEventListener('click', () => b.classList.toggle('on'));
          g.querySelector('.chips').appendChild(b);
        }
      });
      $('#customAdd').value = '';
      $('#interestCount').textContent = selectedChips().length;
      $('#startFeedBtn').disabled = selectedChips().length === 0;
    }
    $('#startFeedBtn').addEventListener('click', () => {
      const list = selectedChips().filter(a => S.areas().indexOf(a) === -1);
      if (list.length) S.addAreas(list);
      resetFeed(); go('feed');
    });
    $('#skipInterests').addEventListener('click', () => { if (!S.areas().length) S.addAreas(['Samosa', 'Hotel']); resetFeed(); go('feed'); });
  }

  /* ======================= FEED (snap cards) ======================= */
  function resetFeed() { state.feed = []; state.offset = 0; $('#feedList').innerHTML = ''; }

  function loadMore(reset) {
    if (state.loading) return;
    state.loading = true;
    $('#feedSkeleton').classList.remove('hidden');
    setTimeout(() => {
      const areas = S.areas();
      if (!areas.length) { state.loading = false; $('#feedSkeleton').classList.add('hidden'); return; }
      if (reset) { $('#feedList').innerHTML = ''; state.feed = []; state.offset = 0; }
      const batch = E.generateCards(areas, S.region(), 6, S.seed(), state.offset);
      state.offset += batch.length;
      state.feed = state.feed.concat(batch);
      const frag = document.createDocumentFragment();
      batch.forEach(p => frag.appendChild(buildCard(p)));
      $('#feedList').appendChild(frag);
      state.loading = false;
      $('#feedSkeleton').classList.add('hidden');
    }, reset ? 200 : 350);
  }

  function buildCard(p) {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.id = p.id;
    el.style.backgroundImage = `url("${ART.toDataUri(ART.bg(p))}")`;
    const saved = S.saved(p.id);
    el.innerHTML = `
      <div class="card-top">
        <span class="chip-area">${p.emoji} <span class="lang-hi">${esc(p.area)}</span><span class="lang-en">${esc(p.area)}</span></span>
        <span class="chip-tag"><span class="lang-hi">${esc(p.tag.hi)}</span><span class="lang-en">${esc(p.tag.en)}</span></span>
      </div>
      <div class="card-mid">
        <div class="tip-hi lang-hi">${esc(p.tip.hi)}</div>
        <div class="tip-en lang-en">${esc(p.tip.en)}</div>
      </div>
      ${p.stat ? `<div class="card-stat"><b>${esc(p.stat.v)}</b><span><span class="lang-hi">${esc(p.stat.hi)}</span><span class="lang-en">${esc(p.stat.en)}</span></span></div>` : ''}
      <div class="card-actions">
        <button class="cact ${saved ? 'on' : ''}" data-act="save"><span>🔖</span><span class="lang-hi">${saved ? 'Saved' : 'Save'}</span><span class="lang-en">${saved ? 'Saved' : 'Save'}</span></button>
        <button class="cact" data-act="listen"><span class="ic">▶</span><span class="lang-hi">सुनो</span><span class="lang-en">Listen</span></button>
        <button class="cact" data-act="lang"><span>अ/A</span><span class="lang-hi">भाषा</span><span class="lang-en">Lang</span></button>
      </div>
      <div class="swipe-hint lang-hi">↑ swipe — अगली tip</div>
      <div class="swipe-hint lang-en">↑ swipe — next tip</div>
      <div class="waveform hidden" data-wave></div>`;
    return el;
  }

  function findPost(id) { return state.feed.filter(p => p.id === id)[0]; }

  function initFeed() {
    $('#feedList').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const card = e.target.closest('.card'); if (!card) return;
      const p = findPost(card.dataset.id); if (!p) return;
      const act = btn.dataset.act;
      if (act === 'save') {
        const on = S.toggleSave(p.id, { id: p.id, title: p.tip.hi, en: p.tip.en, tag: p.tag.hi, area: p.area, artSeed: p.artSeed, emoji: p.emoji });
        btn.classList.toggle('on', on);
        btn.querySelectorAll('span')[1].textContent = on ? 'Saved' : 'Save';
        btn.querySelectorAll('span')[2].textContent = on ? 'Saved' : 'Save';
        toast(on ? 'Save हो गया' : 'हटा दिया');
      } else if (act === 'listen') {
        toggleListen(card, p);
      } else if (act === 'lang') {
        cycleLang();
      }
    });
    const sc = $('#feedScroll');
    sc.addEventListener('scroll', () => { if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 700) loadMore(false); });
    $('#feedAddInterest').addEventListener('click', () => openSheet('#interestSheet'));
    $('#langBtn').addEventListener('click', cycleLang);
    $('#interestSheetClose').addEventListener('click', () => closeSheet('#interestSheet'));
    $('#interestSheetAdd').addEventListener('click', () => {
      const vals = $('#sheetAreaInput').value.split(',').map(x => x.trim()).filter(Boolean);
      if (!vals.length) return;
      S.addAreas(vals); $('#sheetAreaInput').value = '';
      closeSheet('#interestSheet'); resetFeed(); loadMore(true);
      toast('नया interest जुड़ गया');
    });
    $('#sheetSuggestions').addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      if (S.areas().map(a => a.toLowerCase()).indexOf(c.dataset.area.toLowerCase()) > -1) return toast('पहले से जुड़ा है');
      S.addAreas([c.dataset.area]); c.classList.add('on'); c.disabled = true;
      resetFeed(); loadMore(true);
      toast('"' + c.dataset.area + '" जुड़ गया');
    });
  }

  /* ---- audio ---- */
  function toggleListen(card, p) {
    if (state.playingId === p.id) { AU.stop(); hideAudioBar(); state.playingId = null; resetListen(); return; }
    AU.stop(); resetListen();
    const btn = card.querySelector('[data-act="listen"]');
    const wave = card.querySelector('[data-wave]');
    AU.speak(p.id, p.audio, {
      onStart: () => { state.playingId = p.id; btn.classList.add('playing'); showAudioBar(p); wave.classList.remove('hidden'); },
      onLevel: lvl => { paintWave(wave, lvl); paintBarWave(lvl); },
      onProgress: pr => { $('#abProgress').style.width = (pr * 100) + '%'; },
      onEnd: () => { hideAudioBar(); resetListen(); state.playingId = null; },
      onError: () => { toast('Audio support नहीं है'); resetListen(); }
    });
  }
  function resetListen() {
    $$('#feedList [data-act="listen"]').forEach(b => b.classList.remove('playing'));
    $$('[data-wave]').forEach(w => { w.classList.add('hidden'); w.innerHTML = ''; });
  }
  function paintWave(el, lvl) {
    if (!el.children.length) el.innerHTML = Array.from({ length: 24 }, () => '<i></i>').join('');
    Array.prototype.forEach.call(el.children, (b, i) => { b.style.height = (5 + Math.abs(Math.sin(i * .7 + performance.now() / 240)) * lvl * 24).toFixed(1) + 'px'; });
  }
  function showAudioBar(p) {
    $('#abTitle').textContent = p.tip.hi;
    $('#abTag').textContent = p.area;
    $('#abProgress').style.width = '0%';
    $('#audioBar').classList.remove('hidden');
  }
  function hideAudioBar() { $('#audioBar').classList.add('hidden'); }
  function paintBarWave(lvl) {
    const w = $('#abWave');
    if (!w.children.length) w.innerHTML = Array.from({ length: 20 }, () => '<i></i>').join('');
    Array.prototype.forEach.call(w.children, (b, i) => { b.style.height = (4 + Math.abs(Math.sin(i * .9 + performance.now() / 200)) * lvl * 16).toFixed(1) + 'px'; });
  }
  function initAudioBar() {
    $('#abClose').addEventListener('click', () => { AU.stop(); hideAudioBar(); resetListen(); state.playingId = null; });
  }

  /* ======================= SAVED ======================= */
  function renderSaved() {
    const host = $('#savedList');
    const cache = S.savedCache(), ids = S.savedList();
    if (!ids.length) {
      host.innerHTML = `<div class="empty"><div class="empty-ic">🔖</div><h3 class="lang-hi">अभी कुछ save नहीं</h3><h3 class="lang-en">Nothing saved yet</h3><p class="lang-hi">किसी भी tip पे <b>Save</b> दबाओ।</p><p class="lang-en">Tap <b>Save</b> on any tip.</p><button class="btn primary" data-jump>Feed खोलो</button></div>`;
      host.querySelector('[data-jump]').addEventListener('click', () => go('feed'));
      return;
    }
    host.innerHTML = ids.slice().reverse().map(id => {
      const it = cache[id] || {};
      return `<div class="saved-card" data-sid="${esc(id)}">
        <div class="sc-emoji">${it.emoji || '💡'}</div>
        <div class="sc-body"><div class="sc-tag">${esc(it.tag || '')}</div><div class="sc-title lang-hi">${esc(it.title || '')}</div><div class="sc-sub lang-en">${esc(it.en || '')}</div></div>
        <button class="sc-del">✕</button></div>`;
    }).join('');
    host.addEventListener('click', e => {
      const del = e.target.closest('.sc-del');
      const card = e.target.closest('.saved-card');
      if (del && card) { S.toggleSave(card.dataset.sid); renderSaved(); toast('हटा दिया'); }
    }, { once: true });
  }

  /* ======================= PROFILE ======================= */
  function renderProfile() {
    const u = S.user; if (!u) { go('auth'); return; }
    $('#pfName').textContent = u.name;
    $('#pfRegion').textContent = u.region ? '📍 ' + u.region : '📍 location set नहीं';
    const st = S.stats();
    $('#pfStat').innerHTML = [['Interests', st.areas], ['Saved', st.saved]].map(x => `<div class="pf-stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
    $('#pfAreas').innerHTML = S.areas().map(a => `<span class="area-pill">${E.resolveTopic(a).emoji} ${esc(a)}<button data-rm="${esc(a)}">✕</button></span>`).join('') || '<span class="muted">कोई interest नहीं</span>';
    $('#pfAreas').onclick = e => { const b = e.target.closest('[data-rm]'); if (!b) return; S.removeArea(b.dataset.rm); resetFeed(); renderProfile(); };
    $('#pfAddBtn').onclick = () => { const v = prompt('नया interest (comma से multiple)', ''); if (v) { S.addAreas(v.split(',').map(x => x.trim()).filter(Boolean)); resetFeed(); renderProfile(); } };
    $('#pfRegionBtn').onclick = () => { const v = prompt('शहर / state', u.region || ''); if (v !== null) { S.setRegion(v); resetFeed(); renderProfile(); } };
    $('#pfLogout').onclick = () => { S.logout(); $('#authForm').reset(); go('auth'); };
    $('#pfVoice').textContent = AU.supported() ? (AU.voiceName() || 'system voice') : 'support नहीं';
  }

  /* ======================= SHEETS / TOAST ======================= */
  function openSheet(sel) { $(sel).classList.add('open'); $('#sheetBackdrop').classList.add('open'); renderSheetSuggestions(); }
  function closeSheet(sel) { $(sel).classList.remove('open'); $('#sheetBackdrop').classList.remove('open'); }
  function renderSheetSuggestions() {
    const have = S.areas().map(a => a.toLowerCase()); const all = [];
    Object.keys(E.SUGGESTIONS).forEach(k => E.SUGGESTIONS[k].forEach(a => all.push(a)));
    $('#sheetSuggestions').innerHTML = all.filter(a => have.indexOf(a.toLowerCase()) === -1).slice(0, 20).map(a => `<button class="chip" data-area="${esc(a)}">${esc(a)}</button>`).join('');
  }
  let toastT = null;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }

  /* ======================= BOOT ======================= */
  function init() {
    initAuth(); initInterests(); initFeed(); initAudioBar();
    applyLang();
    $('#bottomnav').addEventListener('click', e => { const b = e.target.closest('.nav-item'); if (b) go(b.dataset.go); });
    $('#sheetBackdrop').addEventListener('click', () => { $$('.sheet').forEach(s => s.classList.remove('open')); $('#sheetBackdrop').classList.remove('open'); });
    const u = S.user;
    if (u && u.name) { $('#greetName').textContent = u.name; go(S.areas().length ? 'feed' : 'interests'); }
    else go('auth');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
