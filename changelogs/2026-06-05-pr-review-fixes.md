# PR Review Fixes — Five-Agent Review of #646

**PR**: #646
**Date**: 2026-06-05

## Context

Ran five specialized review agents over the full PR diff (general code, comment accuracy, silent failures, type design, test coverage). Every critical/important finding was independently verified against the code before fixing. Notable: the comment-accuracy agent found **zero inaccurate comments** across the entire diff.

## Fixed

1. **Dimmer boot/runtime incoherence** (critical — `app.html`, `DimmerDial.svelte`)
   - The pre-paint boot script wrote dimmer colors to `document.documentElement` using the *old V2a palette* (oxblood accent, warmth bias); the redesigned runtime writes the *new Spline palette* to `<main>` only. After a reload-while-dimmed the header (which reads tokens off `<html>`) rendered dimmed — the opposite of the design intent — and nothing ever cleared it.
   - The dial's own `L` (light) palette was also stale V2a, so on mount at rest it nudged the homepage off the Spline tokens.
   - Fix: the boot script now injects a `<main>`-scoped `<style id="dimmer-boot-style">` with the new palette (pre-paint safe — `<main>` doesn't exist yet, but the stylesheet applies as it parses; header untouched). `applyTheme` removes the boot style on mount and takes over with inline styles; at `t < 0.01` it **removes** the overrides so app.css tokens are the single source of truth at rest. Persistence happens before the DOM guard and is try/caught (Safari private mode throws on `setItem`). Verified end-to-end: dim → reload on `/` and `/film/[id]` → main dimmed with identical values, html untouched, header light; reset → inline overrides removed.

2. **Silently-dead FILTERS button** (critical — `+page.svelte`)
   - The lazy `import('MobileFilterSheet.svelte')` had no `.catch()`, and `mobileFilterOpen = true` was set outside the `.then()`. On chunk-load failure (deploy skew, offline) the button did nothing, silently.
   - Fix: open-state set inside the success path; `.catch()` logs and reloads (the standard deploy-skew remedy — the fresh HTML references the current chunk manifest).

3. **Broken tablet text-mode table** (important — `FigmaTextDay.svelte`)
   - At 640–1023px, 5 visible cells (TIME/TITLE/YEAR/FORMAT/CINEMA) rendered into a 4-column template; CINEMA wrapped onto an implicit grid row. Now a 5-column template mirroring the desktop sizing. Verified at 800px: 5 cells, 5 columns, one row.

4. **`API_PROXY_TARGET=""` misconfiguration** (medium — `server/api.ts`)
   - `??` only catches null/undefined; a present-but-empty env var made `API_BASE = ''`, resolving fetches against the SvelteKit origin and surfacing as misleading per-route 404s. Now `?.trim() ||`.

5. **Type + dead-code hygiene**
   - `DisplayMode` was declared twice (`+page.svelte` + `FigmaToolbar.svelte`) — now imported from the component that owns it.
   - Removed PR-introduced dead code: `mastheadDate` derived + `.masthead`/`.m-*` CSS, `screeningsByCinema` derived, `trackCalendarExport` import, `.dimmer-wrap` selector, `.cta.pressed`/`.cta.secondary.active` selectors, `warmLerp`. svelte-check warnings 13 → 3.

## Flagged for decision (not unilaterally changed)

- **iCal "Add to calendar" per-screening button** was dropped from the film page by the Showings restyle — restore or confirm intentional.
- **House-lights control is homepage-only** while the dim persists site-wide — product call on whether other routes need the control.
- **Card components re-declare inline `Film`/`Screening`** instead of importing `card-shapes.ts` (`CardFilm`/`CardScreening`) — the drift that module was created to prevent; recommended follow-up.
- **Stale E2E selectors**: ~58 desktop + 18 mobile spec lines reference pre-redesign homepage selectors (passing vacuously); 1 command-palette assertion targets controls that moved into dropdowns. Recommended follow-up PR to re-point the suite at the new roles (`role="toolbar"`, tablists, `.card`/`.film-row`), plus the four high-value missing tests (resize ratchet, header selector-uniqueness, `--header-height` contract, banner z-order).

## Verification

- svelte-check: 0 errors, 3 warnings (was 13)
- Browser: full dimmer lifecycle on `/` + `/film/[id]` (dim, reload, restore, reset), text-mode grid at 800px
