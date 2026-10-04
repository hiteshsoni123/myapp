/* =========================================================================
   Dhandha — Local storage / session
   Sab kuch device pe hi rehta hai (localStorage). Koi server nahi.
   Dhyan: har method ek hi `d = read()` object pe mutate karta hai aur wahi
   `write(d)` karta hai — warna nested copy ki wajah se changes kho jaate hain.
   ========================================================================= */
(function (global) {
  'use strict';

  const KEY = 'dhandha.v1';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
  }
  function cur(d) { return (d.users && d.current) ? d.users[d.current] : null; }

  /* Very light obfuscation — ye security nahi hai, sirf plaintext se bachne ke liye */
  function hashPw(pw) {
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    const s = 'dhandha::' + pw;
    for (let i = 0; i < s.length; i++) {
      h1 = (h1 ^ s.charCodeAt(i)) >>> 0; h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (h2 + Math.imul(s.charCodeAt(i) + i, 2246822519)) >>> 0;
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }

  const Store = {
    get user() { const d = read(); return cur(d); },

    signup(name, password, region) {
      const d = read();
      d.users = d.users || {};
      const k = name.trim().toLowerCase();
      if (d.users[k]) return { ok: false, error: 'Ye naam pehle se registered hai. Doosra naam try karo.' };
      d.users[k] = { name: name.trim(), pw: hashPw(password), region: (region || '').trim(), areas: [], saved: [], liked: [], createdAt: Date.now() };
      d.current = k;
      write(d);
      return { ok: true, user: d.users[k] };
    },

    login(name, password) {
      const d = read();
      const k = (name || '').trim().toLowerCase();
      d.users = d.users || {};
      if (!d.users[k]) return { ok: false, error: 'Ye naam register nahi hai. Pehle sign up karo.' };
      if (d.users[k].pw !== hashPw(password)) return { ok: false, error: 'Password galat hai.' };
      d.current = k;
      write(d);
      return { ok: true, user: d.users[k] };
    },

    logout() { const d = read(); delete d.current; write(d); },

    /* ---- areas of interest ---- */
    areas() { const d = read(); const u = cur(d); return u ? (u.areas || []) : []; },

    addAreas(list) {
      const d = read(); const u = cur(d); if (!u) return [];
      u.areas = u.areas || [];
      const have = new Set(u.areas.map(x => x.toLowerCase()));
      list.forEach(a => {
        const v = String(a).trim().replace(/\s+/g, ' ');
        if (v && !have.has(v.toLowerCase())) { u.areas.push(v); have.add(v.toLowerCase()); }
      });
      write(d);
      return u.areas;
    },

    removeArea(a) {
      const d = read(); const u = cur(d); if (!u) return [];
      u.areas = (u.areas || []).filter(x => x.toLowerCase() !== String(a).toLowerCase());
      write(d);
      return u.areas;
    },

    setRegion(region) {
      const d = read(); const u = cur(d); if (!u) return;
      u.region = (region || '').trim();
      write(d);
    },
    region() { const d = read(); const u = cur(d); return u ? (u.region || '') : ''; },

    /* ---- likes & saves ---- */
    liked(id) { const d = read(); const u = cur(d); return u ? (u.liked || []).indexOf(id) > -1 : false; },
    saved(id) { const d = read(); const u = cur(d); return u ? (u.saved || []).indexOf(id) > -1 : false; },
    savedList() { const d = read(); const u = cur(d); return u ? (u.saved || []) : []; },

    toggleLike(id) {
      const d = read(); const u = cur(d); if (!u) return false;
      u.liked = u.liked || [];
      const i = u.liked.indexOf(id);
      if (i > -1) u.liked.splice(i, 1); else u.liked.push(id);
      write(d);
      return i === -1;
    },

    toggleSave(id, payload) {
      const d = read(); const u = cur(d); if (!u) return false;
      u.saved = u.saved || [];
      const i = u.saved.indexOf(id);
      if (i > -1) u.saved.splice(i, 1);
      else { u.saved.push(id); d.savedCache = d.savedCache || {}; d.savedCache[id] = payload; }
      write(d);
      return i === -1;
    },

    savedCache() { const d = read(); return d.savedCache || {}; },

    /* Stable per-user seed so the feed is consistent for a user */
    seed() {
      const d = read(); const u = cur(d); if (!u) return 'guest';
      if (!u.seed) { u.seed = Math.floor(Math.random() * 1e9).toString(36); write(d); }
      return u.seed;
    },

    stats() {
      const d = read(); const u = cur(d); if (!u) return { areas: 0, saved: 0, liked: 0 };
      return { areas: (u.areas || []).length, saved: (u.saved || []).length, liked: (u.liked || []).length };
    }
  };

  global.DhandhaStore = Store;
})(typeof window !== 'undefined' ? window : globalThis);
