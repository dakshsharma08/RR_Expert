# Handshake submission checklist

Generated 2026-11-23T04:52:13.440Z by `npm run submission` · mode: **manual-no-key**

| Form field | What to do | Status |
|---|---|---|
| **Project title** | paste `title.txt` → "LOCKSTEP — Gemini-Planned Countdown Lock Screen" | ✅ |
| **Your project** (upload your custom countdown lock screen) | upload `lockscreen.png` (1206×2622) · Android alt: `lockscreen-android.png` (1080×2400) | ⚠️ re-generate with a real Gemini plan first (see below) |
| **Preview image** (3:2, ≥1200 px wide) | upload `cover.png` (2400×1600) | ⚠️ re-generate after the real run |
| **Description** (≤500 chars) | paste `description.txt` (338 chars) after replacing `[DEVELOPER: write your own lesson]` and the PENDING sentence | ✏️ needs your lesson |

## Verified dimensions
- ✅ lockscreen.png: 1206×2622 (expected 1206×2622)
- ✅ lockscreen-android.png: 1080×2400 (expected 1080×2400)
- ✅ cover.png: 2400×1600 (expected 2400×1600)

## Privacy
Only the goal title appears. No name, email, phone, school ID, address or face.

## ⚠️ Before you submit
This environment had **no GEMINI_API_KEY**, so this run used the app's manual-plan path. Nothing here claims to be Gemini output. To make the assets from a real Gemini plan:

```bash
cd lockstep && echo "GEMINI_API_KEY=…" >> .env
npm run submission -- --url https://<your-live-url>
```

## Before you paste the description
1. Replace `[DEVELOPER: write your own lesson]` with one true sentence about what *you* learned.
2. Re-count: `node -e "console.log([...require('fs').readFileSync('submission/description.txt','utf8').trim()].length)"`. It must stay ≤ 500.
