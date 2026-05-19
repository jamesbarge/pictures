# cmd+k step 10 — E2E spec + production alias promotion

**PR**: TBD
**Date**: 2026-05-19 (run completed 2026-05-20 UTC)
**Branch**: `feat/cmdk-palette-step10-e2e-tests`

## Changes

### `frontend/tests/command-palette.spec.ts` (new, 5 cases)
1. **⌘K opens the palette and Esc closes it** — verifies the global binding, focus restore to body via combobox focus assertion.
2. **typing a fuzzy query surfaces films + screenings via trigram** — types "amelei" (typo), expects Amélie rows from the SCREENINGS or FILMS section.
3. **Enter on a film row navigates to `/film/[id]`** — types "akira", jumps to last option (FILMS row), Enter → URL matches `/film/[uuid]`.
4. **composite filter-action surfaces for a multi-slice query** — types "horror 70mm tonight", expects the synthesised "Apply filters: …" row to contain `70MM` and `horror`.
5. **Enter on the composite action applies filters to the calendar** — types "horror 70mm", Enter, expects `aria-pressed="true"` on the `70mm` and `Horror` buttons in the filter sidebar.

### `openPalette(page)` helper
- Detects platform once per test (Mac → Meta+k, else Control+k) for cross-OS reliability.
- Up to 3 retries around a bits-ui Dialog mount race in headless: the first synthetic keydown can land before the document-level listener wires up. Two retries with 200ms between fixes the flake at zero cost to happy-path speed.
- `body.click({ position: { x: 1, y: 1 } })` first — ensures focus is on the body so the synthetic keydown reaches the document listener, and dismisses any header popovers that might still be in the DOM.

### `waitForPaletteBinding(page)` helper
- Waits for the Skip-to-content link to be attached (proxy for layout hydration), then one extra rAF tick to flush onMount callbacks.

## Production verification

- `vercel promote filmcal2-elh7az5vn-jamesbarges-projects.vercel.app` — promoted the latest production deployment to `api.pictures.london`. Was previously pinned to a 23-day-old deployment that lacked step 2's RRF API.
- Confirmed live: `curl 'https://api.pictures.london/api/films/search?q=amelei'` now returns 5 keys (`results, cinemas, screenings, festivals, seasons`) instead of just 2.
- Confirmed live: pictures.london ⌘K → "amelei" → 8 Amélie screenings + Amélie 2001 with TMDB ★ 7.9.

## Test run

```
Running 5 tests using 1 worker
  ✓  1 [chromium] › ⌘K opens the palette and Esc closes it (2.6s)
  ✓  2 [chromium] › typing a fuzzy query surfaces films + screenings via trigram (3.3s)
  ✓  3 [chromium] › Enter on a film row navigates to /film/[id] (1.5s)
  ✓  4 [chromium] › composite filter-action surfaces for a multi-slice query (3.2s)
  ✓  5 [chromium] › Enter on the composite action applies filters to the calendar (3.3s)
  5 passed (15.3s)
```

## Impact

- Regression safety net: future cmd+k changes have a 5-case gate before they can merge.
- Documents the cross-platform keyboard shortcut contract (Meta on Mac, Control elsewhere).
- The `openPalette` retry pattern is a reusable helper for any future Dialog-related E2E tests on bits-ui modals.

## Not in scope (deferred to v2)

- Mobile-viewport sheet keyboard handling (visualViewport API)
- 21-item a11y checklist verification (axe-core or manual)
- Screen reader flow recordings (VoiceOver/NVDA/TalkBack)
- Visual regression at 390/1440 viewports

Step 9 (client Orama index) is also deferred — see `2026-05-19-cmdk-step9-deferred.md`.
