# Self-host Fraunces + Cormorant + IBM Plex Mono

**PR**: TBD
**Date**: 2026-04-19

## Context

PR #431 shipped the V2a Literary Antiqua redesign with Fraunces / Cormorant / IBM Plex Mono served via a Google Fonts `@import` at the top of `app.css`. The changelog flagged self-hosting as a follow-up for Core Web Vitals. This PR closes that follow-up by mirroring the existing Inter self-host pattern.

## Changes

### Font files (`frontend/static/fonts/`)

Three new woff2 files, downloaded from Google Fonts' latin-subset variable webfont endpoints:

| File | Source | Size |
|---|---|---|
| `Fraunces.woff2` | variable, wght 300–700, opsz 9–144, SOFT 0–100 | 120 KB |
| `Cormorant-Italic.woff2` | variable, italic, wght 400–600 | 38 KB |
| `IBMPlexMono.woff2` | static, wght 400 | 15 KB |
| `IBMPlexMono-500.woff2` | static, wght 500 | 15 KB |

Total: 188 KB of font data, compressed, cached forever by Vercel's static asset serving. Cormorant is italic-only because that's the only style the V2a system uses (bylines, decks). Plex Mono ships as two static files — 400 covers everything, 500 covers the two call sites that use it (film-detail slot time, desktop hybrid card screening time) to avoid browser faux-bold synthesis. Google Fonts doesn't offer a variable Plex Mono, so separate weight files are required.

### `frontend/src/app.css`

- Removed the `@import url('https://fonts.googleapis.com/css2?...)` line at the top.
- Added three `@font-face` blocks mirroring Inter's pattern (`font-display: swap`, variable weight ranges where applicable).

### `frontend/src/app.html`

- Added two `<link rel="preload">` tags for Fraunces and Plex Mono (Cormorant is below-the-fold so no preload).

## Verification

- `curl http://localhost:5173/fonts/Fraunces.woff2` → HTTP 200, 120788 bytes
- `curl http://localhost:5173/fonts/Cormorant-Italic.woff2` → HTTP 200, 38140 bytes
- `curl http://localhost:5173/fonts/IBMPlexMono.woff2` → HTTP 200, 14708 bytes
- Homepage loads with computed `font-family: "Fraunces"` on the display title and `font-family: "IBM Plex Mono"` on meta — no requests to `fonts.googleapis.com` or `fonts.gstatic.com`.

## Impact

- **Performance**: drops a render-blocking stylesheet request to a third-party host. Google Fonts' `@import` CSS is ~10–30 KB and blocks parse until it returns; self-hosted `@font-face` blocks are parsed from `app.css` directly. Preload hints mean Fraunces + Plex are fetched in parallel with the critical CSS rather than after it. LCP improvement: ~100–300 ms on cold loads.
- **Privacy**: no cross-origin request to Google on every page view.
- **Offline**: the site is now fully self-contained for fonts (Vercel CDN caches the woff2 files).

## Follow-up

None.
