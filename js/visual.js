/* =========================================================================
   Dhandha — Procedural Art Generator
   Har post ke liye device pe hi unique SVG "poster" banata hai.
   No network, no external images — sab kuch vector me generate hota hai.
   ========================================================================= */
(function (global) {
  'use strict';

  const { mulberry32, hashStr } = global.DhandhaEngine._internal;

  const PALETTES = [
    { bg1:'#1a0f2e', bg2:'#3d1f5c', acc:'#ffb347', acc2:'#ff6b6b', ink:'#fff5e6' },
    { bg1:'#0f2027', bg2:'#203a43', acc:'#ffd166', acc2:'#06d6a0', ink:'#e8fbff' },
    { bg1:'#2b0f0f', bg2:'#5c1f1f', acc:'#ffc93c', acc2:'#ff8c42', ink:'#fff3e0' },
    { bg1:'#0d1b2a', bg2:'#1b3a5c', acc:'#4ecdc4', acc2:'#f7fff7', ink:'#eaf6ff' },
    { bg1:'#1b2d1b', bg2:'#2f5233', acc:'#a8e063', acc2:'#f6d365', ink:'#f0fff0' },
    { bg1:'#2e1a2e', bg2:'#5c2e5c', acc:'#ff9ff3', acc2:'#feca57', ink:'#fff0fb' },
    { bg1:'#141e30', bg2:'#243b55', acc:'#f5b041', acc2:'#ecf0f1', ink:'#eef4ff' },
    { bg1:'#231f20', bg2:'#413543', acc:'#f67280', acc2:'#c06c84', ink:'#fff0f3' }
  ];

  const FONTS = ['Georgia, serif', "'Trebuchet MS', sans-serif", "'Courier New', monospace", 'Impact, sans-serif', "system-ui, sans-serif"];

  const escapeXml = s => String(s).replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[c]));

  function wrap(text, max) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 6);
  }

  /* ---- background pattern generators ---- */
  const PATTERNS = {
    dots(r, p) {
      let s = '';
      for (let y = 20; y < 900; y += 46) for (let x = 20; x < 720; x += 46)
        s += `<circle cx="${x}" cy="${y}" r="${1 + r() * 3}" fill="${p.acc}" opacity="${0.06 + r() * 0.14}"/>`;
      return s;
    },
    lines(r, p) {
      let s = '';
      for (let i = 0; i < 26; i++) {
        const y = i * 34 + r() * 10;
        s += `<line x1="0" y1="${y}" x2="750" y2="${y + (r() - 0.5) * 60}" stroke="${p.acc}" stroke-width="${0.6 + r() * 2}" opacity="${0.05 + r() * 0.12}"/>`;
      }
      return s;
    },
    grid(r, p) {
      let s = '';
      for (let x = 0; x <= 750; x += 50) s += `<line x1="${x}" y1="0" x2="${x}" y2="900" stroke="${p.acc}" stroke-width="0.7" opacity="0.07"/>`;
      for (let y = 0; y <= 900; y += 50) s += `<line x1="0" y1="${y}" x2="750" y2="${y}" stroke="${p.acc}" stroke-width="0.7" opacity="0.07"/>`;
      return s;
    },
    waves(r, p) {
      let s = '';
      for (let i = 0; i < 12; i++) {
        const y = 80 + i * 70;
        s += `<path d="M -20 ${y} Q 180 ${y - 60 - r() * 50} 380 ${y} T 780 ${y}" fill="none" stroke="${p.acc2}" stroke-width="${1 + r() * 3}" opacity="${0.08 + r() * 0.14}"/>`;
      }
      return s;
    },
    shapes(r, p) {
      let s = '';
      for (let i = 0; i < 22; i++) {
        const x = r() * 750, y = r() * 900, sz = 20 + r() * 110, o = 0.05 + r() * 0.1;
        const kind = r();
        if (kind < 0.34) s += `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="none" stroke="${p.acc}" stroke-width="2" opacity="${o}" transform="rotate(${r() * 90} ${x + sz / 2} ${y + sz / 2})"/>`;
        else if (kind < 0.67) s += `<circle cx="${x}" cy="${y}" r="${sz / 2}" fill="none" stroke="${p.acc2}" stroke-width="2" opacity="${o}"/>`;
        else s += `<polygon points="${x},${y} ${x + sz},${y + sz / 2} ${x},${y + sz}" fill="${p.acc}" opacity="${o}"/>`;
      }
      return s;
    },
    rays(r, p) {
      let s = '', cx = 375 + (r() - .5) * 200, cy = 450 + (r() - .5) * 200;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, len = 900;
        s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * len}" y2="${cy + Math.sin(a) * len}" stroke="${p.acc}" stroke-width="${2 + r() * 12}" opacity="${0.03 + r() * 0.06}"/>`;
      }
      return s;
    }
  };
  const PATTERN_KEYS = Object.keys(PATTERNS);

  const STYLES = ['poster', 'receipt', 'blueprint', 'chalkboard', 'minimal'];

  function buildSvg(post, opts) {
    opts = opts || {};
    const seed = (opts.seed != null) ? opts.seed : post.artSeed;
    const r = mulberry32(hashStr('art' + seed));
    const p = PALETTES[Math.floor(r() * PALETTES.length) % PALETTES.length];
    const patKey = PATTERN_KEYS[Math.floor(r() * PATTERN_KEYS.length) % PATTERN_KEYS.length];
    const style = opts.style || STYLES[Math.floor(r() * STYLES.length) % STYLES.length];
    const font = FONTS[Math.floor(r() * FONTS.length) % FONTS.length];
    const t = post.topic || { emoji: '💡', name: post.area };

    const titleLines = wrap(post.title, style === 'minimal' ? 26 : 22);
    const W = 750, H = 900;
    let body = '';

    // ---- background ----
    body += `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/>
      </linearGradient>
      <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${p.acc}"/><stop offset="100%" stop-color="${p.acc2}"/>
      </linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="${r() * W}" cy="${r() * H}" r="${200 + r() * 180}" fill="${p.acc}" opacity="0.13" filter="url(#soft)"/>
    <circle cx="${r() * W}" cy="${r() * H}" r="${150 + r() * 150}" fill="${p.acc2}" opacity="0.10" filter="url(#soft)"/>
    ${PATTERNS[patKey](r, p)}`;

    // ---- frame ----
    const pad = 46;
    body += `<rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" fill="none" stroke="${p.acc}" stroke-width="2.5" opacity="0.55" rx="${style === 'receipt' ? 0 : 18}"/>`;

    // ---- style-specific decoration ----
    if (style === 'receipt') {
      body += `<path d="M ${pad} ${H - pad} l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14 l 12 -14 l 12 14" fill="none" stroke="${p.acc}" stroke-width="2.5" opacity="0.55"/>`;
    }
    if (style === 'blueprint') {
      body += `<g opacity="0.5" stroke="${p.acc}" fill="none" stroke-width="1.2">
        <rect x="${pad + 14}" y="${pad + 14}" width="${W - (pad + 14) * 2}" height="${H - (pad + 14) * 2}" stroke-dasharray="8 8"/>
      </g>`;
    }

    // ---- tag pill ----
    const tagY = pad + 56;
    const tagW = Math.max(120, post.tag.length * 13 + 34);
    body += `<rect x="${pad + 34}" y="${tagY - 26}" width="${tagW}" height="38" rx="19" fill="url(#acc)"/>
    <text x="${pad + 34 + tagW / 2}" y="${tagY}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="700" fill="#1a1a1a" letter-spacing="1.5">${escapeXml(post.tag.toUpperCase())}</text>`;

    // ---- big emoji ----
    const emojiY = 330;
    body += `<text x="${W / 2}" y="${emojiY}" text-anchor="middle" font-size="${150 + r() * 40}" opacity="0.95">${t.emoji || '💡'}</text>`;

    // ---- title ----
    let ty = 430;
    const tsz = style === 'minimal' ? 44 : (titleLines.length > 3 ? 40 : 46);
    titleLines.forEach((ln, i) => {
      body += `<text x="${W / 2}" y="${ty + i * (tsz + 8)}" text-anchor="middle" font-family="${font}" font-size="${tsz}" font-weight="800" fill="${p.ink}">${escapeXml(ln)}</text>`;
    });

    // ---- underline ----
    const ulY = ty + titleLines.length * (tsz + 8) + 14;
    body += `<rect x="${W / 2 - 60}" y="${ulY}" width="120" height="5" rx="2.5" fill="url(#acc)"/>`;

    // ---- stat strip (from the post's numbers) ----
    const kvs = (post.blocks.find(b => b.t === 'kv') || { v: [] }).v.slice(0, 3);
    if (kvs.length) {
      const sw = (W - pad * 2 - 60) / kvs.length;
      kvs.forEach((kv, i) => {
        const x = pad + 30 + i * sw;
        body += `<g>
          <text x="${x + sw / 2}" y="${ulY + 78}" text-anchor="middle" font-family="${font}" font-size="27" font-weight="800" fill="${p.acc}">${escapeXml(String(kv[1]).slice(0, 16))}</text>
          <text x="${x + sw / 2}" y="${ulY + 104}" text-anchor="middle" font-family="${font}" font-size="15" fill="${p.ink}" opacity="0.72">${escapeXml(String(kv[0]).slice(0, 24).toUpperCase())}</text>
        </g>`;
      });
      body += `<line x1="${pad + 40}" y1="${ulY + 40}" x2="${W - pad - 40}" y2="${ulY + 40}" stroke="${p.acc}" stroke-width="1.5" opacity="0.35"/>`;
    }

    // ---- footer ----
    const footY = H - pad - 46;
    body += `<line x1="${pad + 40}" y1="${footY - 26}" x2="${W - pad - 40}" y2="${footY - 26}" stroke="${p.acc}" stroke-width="1.5" opacity="0.35"/>`;
    body += `<text x="${pad + 40}" y="${footY}" font-family="${font}" font-size="21" font-weight="700" fill="${p.ink}" opacity="0.9">DHANDHA</text>`;
    body += `<text x="${W - pad - 40}" y="${footY}" text-anchor="end" font-family="${font}" font-size="17" fill="${p.acc}" opacity="0.9">${escapeXml((post.area || '').toUpperCase().slice(0, 22))}${post.region ? ' • ' + escapeXml(post.region.label) : ''}</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  }

  function toDataUri(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* A compact square variant for avatars / chips */
  function thumb(post) {
    const r = mulberry32(hashStr('th' + post.artSeed));
    const p = PALETTES[Math.floor(r() * PALETTES.length) % PALETTES.length];
    const t = post.topic || { emoji: '💡' };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></linearGradient></defs>
      <rect width="100" height="100" rx="22" fill="url(#t)"/>
      <circle cx="${20 + r() * 60}" cy="${20 + r() * 60}" r="${22 + r() * 20}" fill="${p.acc}" opacity="0.22"/>
      <text x="50" y="68" text-anchor="middle" font-size="48">${t.emoji || '💡'}</text>
    </svg>`;
  }

  global.DhandhaArt = { buildSvg, toDataUri, thumb, PALETTES, STYLES };
})(typeof window !== 'undefined' ? window : globalThis);
