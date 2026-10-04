# Dhandha — AI Business Feed 📱

Apne **area of interest** (hotel, samosa, idli, kirana, gym…) ke hisaab se **AI-generated, scrollable business posts** — Hinglish me. Har post me hota hai:

- 🖼️ **On-device generated poster** (procedural SVG art — koi stock image nahi)
- 🔊 **Audio narration** — post ko bol ke sunao (Web Speech API, Hindi voice)
- 🎬 **Reels mode** — post ka animated, full-screen slideshow (Instagram Reels jaisa)
- ✍️ **Rich text** — investment breakdown, pricing math, checklists, myth-vs-reality, case studies

**100% on-device.** Koi server nahi, koi API key nahi, koi tracking nahi. Internet ke bina bhi chalta hai (PWA + Service Worker).

---

## User flow

1. **Login / Sign-up** — naam + password (+ optional shahar/state).
2. **Area of interest chuno** — ek ya kai saare (samosa, hotel, chai…). Custom bhi type kar sakte ho.
3. **Feed** — infinite scroll, AI posts aapke interests + location ke hisaab se.
4. **Reels / Saved / Profile** — bottom nav se.

Location set karne pe posts me **local market, festivals aur area-specific tips** aa jaate hain (Chhattisgarh, MP, Maharashtra, Delhi, UP, Gujarat, Rajasthan, Karnataka, TN, WB, Bihar, Punjab, Telangana, Kerala + koi bhi custom city).

---

## Features

| Feature | Detail |
|---|---|
| 🔐 Local auth | Naam + password, localStorage me (plaintext nahi). Koi server nahi. |
| ♾️ Infinite AI feed | Seeded deterministic generator — content khatam nahi hota, repeats nahi. |
| 🧠 27 content pillars | Idea, investment, pricing, ops, staff, hygiene, legal, marketing, quality, location, season, mistakes, scaling, digital, finance, competition, waste, customer, sourcing, menu, equipment, risk, story, checklist, local, myth, habits. |
| 🗺️ 30+ business knowledge base | Samosa, idli, dosa, chai, biryani, hotel, restaurant, cafe, gym, salon, kirana, medical, mobile shop, coaching, tailoring, laundry, printing, dairy, nursery, events… + smart fallback for *anything*. |
| 🖼️ Procedural posters | 8 palettes × 6 patterns × 5 styles × fonts — har post ka unique SVG art. |
| 🔊 Text-to-speech | Hinglish narration with live waveform + progress. |
| 🎬 Reels | Auto-advancing slides with progress bars, swipe up/down. |
| 🔖 Like / Save | Saved posts alag tab me. |
| 📲 PWA | Install + offline (Service Worker). |

---

## Run locally

```bash
# koi bhi static server
python3 -m http.server 8080
# ya
npx serve .
```

Phir `http://localhost:8080` kholo. Mobile pe best experience; desktop pe phone-frame me dikhta hai.

> **Note:** Audio narration ke liye browser me `speechSynthesis` hona chahiye (sab modern browsers me hai). Agar Hindi voice na ho to default voice use hoti hai.

---

## Structure

```
myapp/
├── index.html          # saare screens + nav
├── manifest.webmanifest
├── sw.js               # offline service worker
├── css/style.css       # mobile-first dark UI
├── js/
│   ├── engine.js       # AI content generator (knowledge base + pillars + regions)
│   ├── visual.js       # procedural SVG poster generator
│   ├── audio.js        # text-to-speech narration
│   ├── store.js        # localStorage auth/likes/saves
│   └── app.js          # router + screens + feed + reels
└── icons/              # PWA icons (SVG + PNG)
```

---

## Tech

Vanilla JS + HTML + CSS. Koi framework, koi build step, koi dependency nahi. Isliye ye kahin bhi chalta hai — browser, PWA, ya kisi bhi WebView (Capacitor/Cordova se native app bhi bana sakte ho).

---

Banaya gaya India me 🇮🇳 — chhote business, bade sapne.
