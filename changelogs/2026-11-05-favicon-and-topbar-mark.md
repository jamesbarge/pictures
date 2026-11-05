# Favicon and P mark in the collapsed top bar

**PR**: #862
**Date**: 2026-11-05

## Changes
- **New favicon.** It is the hand-drawn P from the logo with a red dot inside its loop (the dot of the "i"), black on cream. It was picked from five options made in ChatGPT.
  - `static/favicon.ico` (16/32/48), `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png` (180), with `icon-512.png` as the high-res master.
  - The 16, 32 and 48 px sizes are tighter crops with boosted contrast. A straight downscale turned the stroke grey and the dot pink at 16 px.
  - The four links are in `src/app.html`. The site had no favicon before.
- **Collapsed top bar on desktop** (`TopBar.svelte`):
  - The P is now the bar's first cell, before the burger, and links home.
  - On the homepage the bar sits in the same centred column as the day sections, using `.page-chrome`'s padding and width ladder, so its left edge lines up with the TODAY box. It was measured equal at 1100, 1366, 1440 and 1600 px.
  - Phones are unchanged: burger, then the handwritten mark. Each width keeps exactly one home link, as the redesign regression spec requires.

## Impact
- Browser tabs, bookmarks and iOS home-screen icons show the Pictures P.
- With the sidebar collapsed on desktop, the homepage's top bar and day sections share one left edge, and the brand mark is visible.
