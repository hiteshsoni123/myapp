/* =========================================================================
   Dhandha — Audio narration (Web Speech API)
   Browser ka built-in text-to-speech use karta hai -> koi file nahi, no network.
   ========================================================================= */
(function (global) {
  'use strict';

  const synth = global.speechSynthesis || null;
  let current = null;      // { id, utter, onProgress, onEnd }
  let rafId = null;
  let voiceCache = null;

  function voices() {
    if (!synth) return [];
    if (voiceCache) return voiceCache;
    try { voiceCache = synth.getVoices() || []; } catch (e) { voiceCache = []; }
    return voiceCache;
  }
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', () => { voiceCache = null; });

  /* Prefer a Hindi voice so Hinglish sounds natural; fall back to any en-IN / en */
  function bestVoice() {
    const vs = voices();
    if (!vs.length) return null;
    const score = v => {
      const l = (v.lang || '').toLowerCase();
      if (l.startsWith('hi')) return 100;
      if (l === 'en-in') return 80;
      if (l.startsWith('en-')) return 50;
      return 10;
    };
    return vs.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }

  /* Hinglish text ko thoda "bolne layak" banate hain */
  function clean(text) {
    return String(text)
      .replace(/[₹]\s?/g, ' rupaye ')
      .replace(/(\d+(?:,\d+)*)\s?%/g, '$1 percent')
      .replace(/(\d+)\s?(km|kg|sq\.ft)/g, '$1 $2')
      .replace(/[""'']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Split into chunks <= ~200 chars so progress + cancel feel responsive */
  function chunk(text, max) {
    max = max || 210;
    const sentences = clean(text).split(/(?<=[\.\!\?।])\s+/);
    const out = [];
    let cur = '';
    for (const s of sentences) {
      if ((cur + ' ' + s).trim().length > max) { if (cur) out.push(cur.trim()); cur = s; }
      else cur = (cur + ' ' + s).trim();
    }
    if (cur) out.push(cur.trim());
    return out;
  }

  const Audio = {
    supported() { return !!synth && typeof SpeechSynthesisUtterance !== 'undefined'; },

    isPlaying(id) { return !!current && current.id === id; },

    voiceName() { const v = bestVoice(); return v ? (v.name + ' (' + v.lang + ')') : null; },

    speak(id, text, cb) {
      cb = cb || {};
      Audio.stop();
      if (!Audio.supported()) { cb.onError && cb.onError('Is browser me speech support nahi hai.'); return; }

      const parts = chunk(text);
      let idx = 0;
      const v = bestVoice();

      const sayNext = () => {
        if (idx >= parts.length) { finish(); return; }
        const u = new SpeechSynthesisUtterance(parts[idx]);
        if (v) u.voice = v;
        u.lang = v ? v.lang : 'hi-IN';
        u.rate = 0.98; u.pitch = 1.0; u.volume = 1;
        u.onend = () => { idx++; cb.onProgress && cb.onProgress(idx / parts.length); sayNext(); };
        u.onerror = () => { idx++; if (idx < parts.length) sayNext(); else finish(); };
        synth.speak(u);
      };

      const finish = () => { stopPulse(); current = null; cb.onEnd && cb.onEnd(); };

      current = { id, cancel: () => { try { synth.cancel(); } catch (e) {} } };
      cb.onStart && cb.onStart({ total: parts.length });
      startPulse(cb.onLevel);
      sayNext();
    },

    stop() {
      if (current) { const c = current; current = null; stopPulse(); try { c.cancel(); } catch (e) {} }
    },

    /* Fake but smooth level meter driven by an oscillator-like curve */
    _pulse: null
  };

  function startPulse(onLevel) {
    if (!onLevel) return;
    stopPulse();
    let t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      // layered sines -> looks like a voice envelope
      const lvl = 0.45
        + 0.28 * Math.sin(t * 9.1)
        + 0.16 * Math.sin(t * 21.7 + 1.3)
        + 0.11 * Math.sin(t * 3.3 + 0.7);
      onLevel(Math.max(0.08, Math.min(1, lvl)));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopPulse() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  global.DhandhaAudio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
