/* =========================================================================
   Dhandha — App controller
   ========================================================================= */
(function () {
  'use strict';

  const E = window.DhandhaEngine, S = window.DhandhaStore, ART = window.DhandhaArt, AU = window.DhandhaAudio;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    screen: null,
    feed: [],
    feedOffset: 0,
    loading: false,
    reelQueue: [],
    reelIndex: 0,
    reelTimer: null,
    reelSlide: 0,
    playingPostId: null
  };

  /* ======================= ROUTER ======================= */
  function go(name, opts) {
    opts = opts || {};
    $$('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-' + name));
    $('#bottomnav').classList.toggle('hidden', name === 'auth' || name === 'interests' || name === 'reels');
    $$('#bottomnav .nav-item').forEach(b => b.classList.toggle('on', b.dataset.go === name));
    state.screen = name;
    AU.stop(); hideAudioBar();
    if (name === 'feed' && !state.feed.length && !opts.noLoad) loadMore(true);
    if (name === 'saved') renderSaved();
    if (name === 'profile') renderProfile();
    if (name === 'reels') openReels(opts.reels, opts.index);
    window.scrollTo(0, 0);
    if (opts.scrollTop) { const sc = $('#feedScroll'); if (sc) sc.scrollTop = 0; }
  }

  /* ======================= AUTH ======================= */
  function initAuth() {
    const form = $('#authForm');
    let mode = 'signup';
    const setMode = m => {
      mode = m;
      $('#authTitle').textContent = m === 'signup' ? 'Dhandha me aapka swagat hai' : 'Wapas aa gaye!';
      $('#authSub').textContent = m === 'signup'
        ? 'Naam aur password daalo — bas, shuru kar dete hain.'
        : 'Apna naam aur password daal ke login karo.';
      $('#authBtn').textContent = m === 'signup' ? 'Account banao' : 'Login';
      $('#authSwap').innerHTML = m === 'signup'
        ? 'Pehle se account hai? <b>Login karo</b>'
        : 'Naya account chahiye? <b>Sign up karo</b>';
      $('#regionWrap').style.display = m === 'signup' ? '' : 'none';
      $('#authError').classList.add('hidden');
    };
    $('#authSwap').addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));

    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const name = $('#authName').value.trim();
      const pw = $('#authPw').value;
      const region = $('#authRegion').value.trim();
      const err = $('#authError');

      if (name.length < 2) return show(err, 'Naam kam se kam 2 akshar ka ho.');
      if (pw.length < 4) return show(err, 'Password kam se kam 4 character ka ho.');

      const res = mode === 'signup' ? S.signup(name, pw, region) : S.login(name, pw);
      if (!res.ok) return show(err, res.error);

      $('#greetName').textContent = res.user.name;
      go(S.areas().length ? 'feed' : 'interests');
    });

    function show(el, msg) { el.textContent = msg; el.classList.remove('hidden'); el.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 }); }
  }

  /* ======================= INTERESTS ======================= */
  function renderSuggestions() {
    const box = $('#sugBox');
    box.innerHTML = Object.keys(E.SUGGESTIONS).map(cat => `
      <div class="sug-group">
        <div class="sug-cat">${esc(cat)}</div>
        <div class="chips">${E.SUGGESTIONS[cat].map(a => `<button class="chip" data-area="${esc(a)}">${esc(a)}</button>`).join('')}</div>
      </div>`).join('');
    box.addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      if (c.disabled) return;
      toggleChip(c);
    });
  }
  function toggleChip(c) {
    const on = c.classList.toggle('on');
    const list = selectedChips();
    $('#interestCount').textContent = list.length;
    $('#startFeedBtn').disabled = list.length === 0;
    return on;
  }
  function selectedChips() {
    return $$('#sugBox .chip.on').map(c => c.dataset.area);
  }

  function renderExistingInterests() {
    const wrap = $('#existingInterests');
    const areas = S.areas();
    if (!areas.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<div class="mini-label">Pehle se selected</div><div class="chips">${areas.map(a =>
      `<button class="chip on done" data-area="${esc(a)}">${esc(a)}</button>`).join('')}</div>`;
  }

  function initInterests() {
    renderSuggestions();
    renderExistingInterests();
    $('#startFeedBtn').disabled = S.areas().length === 0 && selectedChips().length === 0;

    $('#customAdd').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
    });
    $('#customAddBtn').addEventListener('click', addCustom);

    function addCustom() {
      const inp = $('#customAdd');
      const v = inp.value.trim();
      if (!v) return;
      v.split(',').map(x => x.trim()).filter(Boolean).forEach(area => {
        if (!$(`#sugBox .chip[data-area="${area}"]`)) {
          const b = document.createElement('button');
          b.className = 'chip on';
          b.dataset.area = area;
          b.textContent = area;
          b.addEventListener('click', () => toggleChip(b));
          let g = $('#customGroup');
          if (!g) {
            g = document.createElement('div');
            g.className = 'sug-group'; g.id = 'customGroup';
            g.innerHTML = `<div class="sug-cat">Aapke apne</div><div class="chips"></div>`;
            $('#sugBox').prepend(g);
          }
          g.querySelector('.chips').appendChild(b);
        } else {
          $(`#sugBox .chip[data-area="${area}"]`).classList.add('on');
        }
      });
      inp.value = '';
      $('#interestCount').textContent = selectedChips().length;
      $('#startFeedBtn').disabled = selectedChips().length === 0 && S.areas().length === 0;
    }

    $('#startFeedBtn').addEventListener('click', () => {
      const list = selectedChips().filter(a => S.areas().indexOf(a) === -1);
      if (list.length) S.addAreas(list);
      state.feed = []; state.feedOffset = 0;
      go('feed', { scrollTop: true });
    });
    $('#skipInterests').addEventListener('click', () => {
      if (!S.areas().length) S.addAreas(['Samosa', 'Hotel']);
      state.feed = []; state.feedOffset = 0;
      go('feed', { scrollTop: true });
    });
  }

  /* ======================= FEED ======================= */
  function loadMore(reset) {
    if (state.loading) return;
    state.loading = true;
    const sk = $('#feedSkeleton'); if (sk) sk.classList.remove('hidden');

    // simulate a tiny "generating" beat so it feels like AI is working
    setTimeout(() => {
      const areas = S.areas();
      if (!areas.length) { state.loading = false; if (sk) sk.classList.add('hidden'); return; }
      if (reset) { $('#feedList').innerHTML = ''; state.feed = []; state.feedOffset = 0; }
      const batch = E.generateFeed(areas, S.region(), 6, S.seed(), state.feedOffset);
      state.feedOffset += batch.length;
      state.feed = state.feed.concat(batch);
      const frag = document.createDocumentFragment();
      batch.forEach(p => frag.appendChild(buildPostCard(p)));
      $('#feedList').appendChild(frag);
      observeCards();
      state.loading = false;
      if (sk) sk.classList.add('hidden');
    }, reset ? 260 : 420);
  }

  /* --- post card DOM --- */
  function buildPostCard(p) {
    const el = document.createElement('article');
    el.className = 'post';
    el.dataset.id = p.id;

    const svg = ART.buildSvg(p);
    const liked = S.liked(p.id), saved = S.saved(p.id);

    el.innerHTML = `
      <header class="post-head">
        <div class="avatar" aria-hidden="true">${ART.thumb(p)}</div>
        <div class="post-meta">
          <div class="post-author">${esc(p.topic.name)} <span class="badge">${esc(p.tag)}</span></div>
          <div class="post-sub">AI generated • ${esc(p.postedAgo)} • ${p.readMin} min read${p.region ? ' • ' + esc(p.region.label) : ''}</div>
        </div>
        <button class="icon-btn more" title="Share">↗</button>
      </header>

      <div class="post-body">
        <h2 class="post-title">${esc(p.title)}</h2>
        ${blocksHtml(p.blocks)}
      </div>

      <div class="post-art">
        <img alt="${esc(p.title)}" src="${ART.toDataUri(svg)}" loading="lazy" decoding="async"/>
        <button class="art-play" data-act="artplay" title="Poster dekho">⤢</button>
      </div>

      <div class="post-actions">
        <button class="act ${liked ? 'on' : ''}" data-act="like"><span class="ic">♥</span><span class="ct">${p.likes + (liked ? 1 : 0)}</span></button>
        <button class="act" data-act="listen"><span class="ic">▶</span><span>Suno</span></button>
        <button class="act" data-act="reel"><span class="ic">▷</span><span>Reel</span></button>
        <button class="act ${saved ? 'on' : ''}" data-act="save"><span class="ic">🔖</span><span>${saved ? 'Saved' : 'Save'}</span></button>
      </div>

      <div class="waveform hidden" data-wave></div>
    `;
    return el;
  }

  function blocksHtml(blocks) {
    return blocks.map(b => {
      switch (b.t) {
        case 'p':    return `<p class="blk-p">${esc(b.v)}</p>`;
        case 'hl':   return `<div class="blk-hl"><span class="hl-bar"></span><span>${esc(b.v)}</span></div>`;
        case 'quote':return `<blockquote class="blk-q">${esc(b.v)}</blockquote>`;
        case 'li':   return `<ul class="blk-ul">${b.v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
        case 'steps':return `<ol class="blk-steps">${b.v.map(x => `<li>${esc(String(x).replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol>`;
        case 'kv':   return `<div class="blk-kv">${b.v.map(r => `<div class="kv-row"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`;
        case 'math': return `<div class="blk-math">${b.v.map((r, i) => `<div class="kv-row${i === b.sum ? ' total' : ''}"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`;
        case 'myth': return `<div class="blk-myth"><div class="m"><span>MYTH</span>${esc(b.m)}</div><div class="r"><span>REALITY</span>${esc(b.r)}</div></div>`;
        default:     return '';
      }
    }).join('');
  }

  /* ---- feed interactions ---- */
  function findPost(id) { return state.feed.filter(p => p.id === id)[0]; }

  function observeCards() {
    const cards = $$('#feedList .post');
    cards.forEach(c => {
      if (c._seen) return; c._seen = true;
      io.observe(c);
    });
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && en.intersectionRatio > 0.4) {
        const c = en.target; c.classList.add('in');
      }
    });
  }, { threshold: [0.4] });

  function initFeed() {
    const list = $('#feedList');
    list.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      const card = e.target.closest('.post');
      if (!card) return;
      const id = card.dataset.id;
      const p = findPost(id);
      if (!p) return;
      const act = btn && btn.dataset.act;

      if (act === 'like') {
        const on = S.toggleLike(id);
        btn.classList.toggle('on', on);
        btn.querySelector('.ct').textContent = p.likes + (on ? 1 : 0);
        if (on) pop(btn);
      } else if (act === 'save') {
        const on = S.toggleSave(id, { id: id, title: p.title, tag: p.tag, area: p.area, artSeed: p.artSeed });
        btn.classList.toggle('on', on);
        btn.querySelector('span:last-child').textContent = on ? 'Saved' : 'Save';
        toast(on ? 'Save ho gaya — Saved tab me milega' : 'Saved se hata diya');
      } else if (act === 'listen') {
        toggleListen(card, p);
      } else if (act === 'reel') {
        // reel from this post onwards, filtered to the same area context
        const startIdx = state.feed.findIndex(x => x.id === id);
        go('reels', { reels: state.feed, index: Math.max(0, startIdx) });
      } else if (act === 'artplay') {
        openArt(p);
      }
    });

    // infinite scroll
    const sc = $('#feedScroll');
    sc.addEventListener('scroll', () => {
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 900) loadMore(false);
    });

    $('#feedRefresh').addEventListener('click', () => {
      state.feed = []; state.feedOffset = 0;
      $('#feedList').innerHTML = '';
      loadMore(true);
      sc.scrollTop = 0;
    });

    $('#feedAddInterest').addEventListener('click', () => openSheet('#interestSheet'));
    $('#interestSheetClose').addEventListener('click', () => closeSheet('#interestSheet'));
    $('#interestSheetAdd').addEventListener('click', () => {
      const inp = $('#sheetAreaInput');
      const vals = inp.value.split(',').map(x => x.trim()).filter(Boolean);
      if (!vals.length) return;
      S.addAreas(vals);
      inp.value = '';
      closeSheet('#interestSheet');
      toast('Naya interest add ho gaya — feed update ho raha hai');
      state.feed = []; state.feedOffset = 0; $('#feedList').innerHTML = '';
      loadMore(true);
    });
    $('#sheetSuggestions').addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      const have = S.areas().map(a => a.toLowerCase());
      if (have.indexOf(c.dataset.area.toLowerCase()) > -1) { toast('Ye pehle se aapke interests me hai'); return; }
      S.addAreas([c.dataset.area]);
      c.classList.add('on'); c.disabled = true;
      state.feed = []; state.feedOffset = 0; $('#feedList').innerHTML = '';
      loadMore(true);
      toast('"' + c.dataset.area + '" add ho gaya');
    });
  }

  function pop(el) {
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }

  /* ---- audio playback ---- */
  function toggleListen(card, p) {
    if (state.playingPostId === p.id) { AU.stop(); hideAudioBar(); state.playingPostId = null; resetListenBtns(); return; }
    AU.stop(); resetListenBtns();
    const btn = card.querySelector('[data-act="listen"]');
    const wave = card.querySelector('[data-wave]');

    AU.speak(p.id, p.audio, {
      onStart: () => {
        state.playingPostId = p.id;
        btn.classList.add('playing');
        btn.querySelector('.ic').textContent = '❚❚';
        btn.querySelector('span:last-child').textContent = 'Rok do';
        wave.classList.remove('hidden');
        showAudioBar(p);
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      onLevel: lvl => { paintWave(wave, lvl); paintBarWave(lvl); },
      onProgress: pr => { $('#abProgress').style.width = (pr * 100) + '%'; },
      onEnd: () => { hideAudioBar(); resetListenBtns(); state.playingPostId = null; },
      onError: msg => { toast(msg || 'Audio play nahi ho paya'); resetListenBtns(); }
    });
  }
  function resetListenBtns() {
    $$('#feedList .act[data-act="listen"]').forEach(b => {
      b.classList.remove('playing');
      b.querySelector('.ic').textContent = '▶';
      b.querySelector('span:last-child').textContent = 'Suno';
    });
    $$('[data-wave]').forEach(w => { w.classList.add('hidden'); w.innerHTML = ''; });
  }
  function paintWave(el, lvl) {
    if (!el.children.length) {
      el.innerHTML = Array.from({ length: 28 }, () => '<i></i>').join('');
    }
    Array.prototype.forEach.call(el.children, (bar, i) => {
      const off = Math.sin(i * 0.7 + performance.now() / 240);
      const h = 6 + Math.abs(off) * lvl * 26;
      bar.style.height = h.toFixed(1) + 'px';
    });
  }

  function showAudioBar(p) {
    const bar = $('#audioBar');
    $('#abTitle').textContent = p.title;
    $('#abTag').textContent = p.tag + ' • ' + p.area;
    $('#abProgress').style.width = '0%';
    bar.classList.remove('hidden');
    bar.querySelector('#abPlay').textContent = '❚❚';
  }
  function hideAudioBar() { $('#audioBar').classList.add('hidden'); }
  function paintBarWave(lvl) {
    const w = $('#abWave');
    if (!w.children.length) w.innerHTML = Array.from({ length: 22 }, () => '<i></i>').join('');
    Array.prototype.forEach.call(w.children, (b, i) => {
      b.style.height = (4 + Math.abs(Math.sin(i * 0.9 + performance.now() / 200)) * lvl * 18).toFixed(1) + 'px';
    });
  }

  function initAudioBar() {
    $('#abPlay').addEventListener('click', () => {
      AU.stop(); hideAudioBar(); resetListenBtns(); state.playingPostId = null;
    });
    $('#abClose').addEventListener('click', () => {
      AU.stop(); hideAudioBar(); resetListenBtns(); state.playingPostId = null;
    });
  }

  /* ---- full screen poster ---- */
  function openArt(p) {
    const ov = $('#artOverlay');
    $('#artOverlayImg').src = ART.toDataUri(ART.buildSvg(p));
    ov.classList.add('open');
  }

  /* ======================= REELS ======================= */
  function openReels(posts, index) {
    if (!posts || !posts.length) posts = state.feed.length ? state.feed : E.generateFeed(S.areas(), S.region(), 6, S.seed(), 0);
    state.reelQueue = posts;
    state.reelIndex = Math.max(0, index || 0);
    renderReel();
  }

  function renderReel() {
    const host = $('#reelHost');
    const p = state.reelQueue[state.reelIndex];
    if (!p) { go('feed'); return; }
    const pal = ART.PALETTES[p.artSeed % ART.PALETTES.length];
    host.style.setProperty('--acc', pal.acc);
    host.innerHTML = `
      <div class="reel-stage" style="background:
        radial-gradient(120% 90% at 20% 0%, ${pal.bg2} 0%, ${pal.bg1} 60%, #05060a 100%)">
        <div class="reel-progress">${p.slides.map(() => '<i></i>').join('')}</div>
        <div class="reel-slide">
          <div class="reel-emoji">${p.topic.emoji}</div>
          <div class="reel-kicker">${esc(p.slides[state.reelSlide] ? p.slides[state.reelSlide].s : p.tag)}</div>
          <div class="reel-text"></div>
        </div>
        <div class="reel-side">
          <button class="rs" data-r="like"><span>♥</span><b>${p.likes}</b></button>
          <button class="rs" data-r="listen"><span>▶</span><b>Suno</b></button>
          <button class="rs" data-r="save"><span>🔖</span><b>Save</b></button>
          <button class="rs" data-r="more"><span>⋯</span><b></b></button>
        </div>
        <div class="reel-bottom">
          <div class="reel-tag">${esc(p.tag)} <em>• ${esc(p.area)}</em></div>
          <div class="reel-cta">Neeche swipe karo — agla idea ↓</div>
        </div>
        <button class="reel-close" id="reelClose">✕</button>
        <div class="reel-tapzone" id="tapNext"></div>
        <div class="reel-tapzone left" id="tapPrev"></div>
      </div>`;

    $('#reelClose').addEventListener('click', () => { stopReel(); go('feed'); });
    $('#tapNext').addEventListener('click', () => nextSlide());
    $('#tapPrev').addEventListener('click', () => prevSlide());
    host.querySelector('[data-r="like"]').addEventListener('click', e => {
      const on = S.toggleLike(p.id);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.querySelector('b').textContent = p.likes + (on ? 1 : 0);
    });
    host.querySelector('[data-r="save"]').addEventListener('click', e => {
      const on = S.toggleSave(p.id, { id: p.id, title: p.title, tag: p.tag, area: p.area, artSeed: p.artSeed });
      e.currentTarget.classList.toggle('on', on);
      toast(on ? 'Save ho gaya' : 'Removed');
    });
    host.querySelector('[data-r="listen"]').addEventListener('click', () => {
      if (state.playingPostId === p.id) { AU.stop(); state.playingPostId = null; return; }
      AU.stop();
      AU.speak(p.id, p.audio, {
        onStart: () => { state.playingPostId = p.id; },
        onEnd: () => { state.playingPostId = null; },
        onError: () => toast('Audio support nahi hai')
      });
      toast('Narration shuru — swipe karne pe band ho jayega');
    });

    showSlide(0);
    startReelTimer();
    bindReelSwipe(host);
  }

  function showSlide(i) {
    const p = state.reelQueue[state.reelIndex];
    if (!p) return;
    i = Math.max(0, Math.min(i, p.slides.length - 1));
    state.reelSlide = i;
    const sl = p.slides[i];
    const txt = $('.reel-text');
    if (!txt) return;
    txt.innerHTML = sl.kind === 'bullet' ? `<span class="dot">•</span> ${esc(sl.h)}` : esc(sl.h);
    const kick = $('.reel-kicker'); if (kick) kick.textContent = sl.s;
    const bars = $$('.reel-progress i');
    bars.forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('on', k === i); });
    restartBar(bars[i]);
  }
  function restartBar(bar) {
    if (!bar) return;
    bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  }
  function nextSlide() {
    const p = state.reelQueue[state.reelIndex];
    if (!p) return;
    if (state.reelSlide < p.slides.length - 1) { showSlide(state.reelSlide + 1); startReelTimer(); }
    else nextReel();
  }
  function prevSlide() {
    if (state.reelSlide > 0) { showSlide(state.reelSlide - 1); startReelTimer(); }
    else prevReel();
  }
  function nextReel() {
    AU.stop(); state.playingPostId = null;
    if (state.reelIndex >= state.reelQueue.length - 1) {
      // generate more on the fly
      state.reelQueue = state.reelQueue.concat(E.generateFeed(S.areas(), S.region(), 6, S.seed(), state.reelQueue.length));
    }
    state.reelIndex++;
    renderReel();
  }
  function prevReel() {
    AU.stop(); state.playingPostId = null;
    if (state.reelIndex > 0) { state.reelIndex--; renderReel(); }
  }
  function startReelTimer() {
    stopReel();
    state.reelTimer = setTimeout(nextSlide, 4200);
  }
  function stopReel() { if (state.reelTimer) { clearTimeout(state.reelTimer); state.reelTimer = null; } }

  function bindReelSwipe(host) {
    let y0 = null;
    host.ontouchstart = e => { y0 = e.touches[0].clientY; };
    host.ontouchend = e => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      if (dy < -45) nextReel(); else if (dy > 45) prevReel();
      y0 = null;
    };
  }

  /* ======================= SAVED ======================= */
  function renderSaved() {
    const host = $('#savedList');
    const cache = S.savedCache();
    const ids = S.savedList();
    if (!ids.length) {
      host.innerHTML = `<div class="empty"><div class="empty-ic">🔖</div><h3>Abhi kuch save nahi kiya</h3><p>Feed me kisi bhi post pe <b>Save</b> dabao — wo yahan jama hota jayega.</p><button class="btn primary" data-jump="feed">Feed pe jao</button></div>`;
      host.querySelector('[data-jump]').addEventListener('click', () => go('feed'));
      return;
    }
    host.innerHTML = ids.slice().reverse().map(id => {
      const it = cache[id] || { title: 'Saved post', tag: '', area: '', artSeed: 1 };
      const fake = { artSeed: it.artSeed, tag: it.tag, area: it.area, title: it.title,
        blocks: [{ t: 'kv', v: [['Topic', it.area], ['Category', it.tag]] }], topic: E.resolveTopic(it.area), region: null };
      return `<div class="saved-card" data-sid="${esc(id)}">
        <img src="${ART.toDataUri(ART.buildSvg(fake))}" alt=""/>
        <div class="sc-body"><div class="sc-tag">${esc(it.tag)}</div><div class="sc-title">${esc(it.title)}</div><div class="sc-area">${esc(it.area)}</div></div>
        <button class="sc-del" title="Hatao">✕</button>
      </div>`;
    }).join('');

  }

  function initSaved() {
    $('#savedList').addEventListener('click', e => {
      const del = e.target.closest('.sc-del');
      const card = e.target.closest('.saved-card');
      if (del && card) { S.toggleSave(card.dataset.sid); renderSaved(); toast('Hata diya'); return; }
      if (card) {
        const id = card.dataset.sid;
        const hit = state.feed.filter(x => x.id === id)[0];
        if (hit) go('reels', { reels: state.feed, index: state.feed.findIndex(x => x.id === id) });
        else toast('Ye post feed me nahi mili — feed kholke Reel button se dekhein');
      }
    });
  }

  /* ======================= PROFILE ======================= */
  function renderProfile() {
    const u = S.user; if (!u) { go('auth'); return; }
    $('#pfName').textContent = u.name;
    $('#pfRegion').textContent = u.region ? '📍 ' + u.region : '📍 Location set nahi ki';
    const st = S.stats();
    $('#pfStat').innerHTML = [
      ['Interests', st.areas], ['Saved', st.saved], ['Liked', st.liked]
    ].map(x => `<div class="pf-stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');

    $('#pfAreas').innerHTML = S.areas().map(a => {
      const t = E.resolveTopic(a);
      return `<span class="area-pill">${t.emoji} ${esc(a)}<button data-rm="${esc(a)}" title="Hatao">✕</button></span>`;
    }).join('') || '<span class="muted">Koi interest nahi — neeche se add karo</span>';

    $('#pfAreas').onclick = e => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      S.removeArea(b.dataset.rm);
      toast('"' + b.dataset.rm + '" hata diya');
      state.feed = []; state.feedOffset = 0; $('#feedList').innerHTML = '';
      renderProfile();
    };

    $('#pfRegionBtn').onclick = () => {
      const v = prompt('Apna shahar / state likho (jaise: Raipur, Chhattisgarh)', u.region || '');
      if (v === null) return;
      S.setRegion(v);
      state.feed = []; state.feedOffset = 0; $('#feedList').innerHTML = '';
      renderProfile();
      toast('Location update — feed ab ' + (v || 'generic') + ' ke hisaab se banega');
    };

    $('#pfAddBtn').onclick = () => {
      const v = prompt('Naya area of interest (comma se alag karke multiple likh sakte ho)', '');
      if (!v) return;
      S.addAreas(v.split(',').map(x => x.trim()).filter(Boolean));
      state.feed = []; state.feedOffset = 0; $('#feedList').innerHTML = '';
      renderProfile();
      toast('Interest add ho gaya');
    };

    $('#pfLogout').onclick = () => {
      S.logout();
      $('#authForm').reset();
      go('auth');
    };

    $('#pfVoice').textContent = AU.supported()
      ? (AU.voiceName() ? 'Voice: ' + AU.voiceName() : 'Voice: system default')
      : 'Voice: is browser me support nahi';
  }

  /* ======================= SHEETS / TOAST ======================= */
  function openSheet(sel) {
    $(sel).classList.add('open');
    $('#sheetBackdrop').classList.add('open');
    renderSheetSuggestions();
  }
  function closeSheet(sel) {
    $(sel).classList.remove('open');
    $('#sheetBackdrop').classList.remove('open');
  }
  function renderSheetSuggestions() {
    const have = S.areas().map(a => a.toLowerCase());
    const all = [];
    Object.keys(E.SUGGESTIONS).forEach(k => E.SUGGESTIONS[k].forEach(a => all.push(a)));
    $('#sheetSuggestions').innerHTML = all.filter(a => have.indexOf(a.toLowerCase()) === -1)
      .slice(0, 22).map(a => `<button class="chip" data-area="${esc(a)}">${esc(a)}</button>`).join('');
  }
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ======================= BOOT ======================= */
  function init() {
    initAuth();
    initInterests();
    initFeed();
    initSaved();
    initAudioBar();

    $('#bottomnav').addEventListener('click', e => {
      const b = e.target.closest('.nav-item'); if (!b) return;
      const g = b.dataset.go;
      if (g === 'reels') { go('reels', { reels: state.feed, index: 0 }); }
      else go(g);
    });

    $('#artOverlay').addEventListener('click', () => $('#artOverlay').classList.remove('open'));
    $('#sheetBackdrop').addEventListener('click', () => {
      $$('.sheet').forEach(s => s.classList.remove('open'));
      $('#sheetBackdrop').classList.remove('open');
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $('#artOverlay').classList.remove('open');
        closeSheet('#interestSheet');
        if (state.screen === 'reels') { stopReel(); go('feed'); }
      }
    });

    // restore session
    const u = S.user;
    if (u && u.name) { $('#greetName').textContent = u.name; go(S.areas().length ? 'feed' : 'interests'); }
    else go('auth');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
