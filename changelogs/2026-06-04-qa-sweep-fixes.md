# Post-Merge QA Sweep — Three Fixes

**PR**: #646
**Date**: 2026-06-04

## Context

After merging 113 commits of main into the Spline redesign branch, a 12-agent QA sweep tested every page (desktop 1440 + mobile 390) against live database data, with each finding adversarially re-verified by reproduction and git forensics. **Zero regressions** were attributable to the redesign or the merge. Three genuine pre-existing defects surfaced and are fixed here.

## Changes

1. **Cookie consent banner stole taps from the mobile filter sheet** (`CookieConsentBanner.svelte`)
   - The banner's `z-index: 9999` sat above the MobileFilterSheet (`z-index: 80`); on a first visit the bottom-anchored "Show N films" CTA was a dead click — `document.elementFromPoint` returned the consent Accept button. Pre-existing since PR #422.
   - Banner now sits at `z-index: 70`: above page chrome (header 40, dimmer-anchor 60), below modal layers (sheet 80, palette 90+).
   - Also stacks the banner vertically ≤600px: the row layout's min-content was 543px at a 390px viewport (153px hidden overflow).

2. **Mobile calendar popover overflowed the viewport** (`film/[id]/+page.svelte`)
   - The ≤767px override anchored the 362px popover `left: 0` to `.picker-wrap`, which floats mid-row (~39px in) → right edge at 401px → 11px of real horizontal page scroll. Pre-existing since PR #431.
   - Now a viewport-centred `position: fixed` overlay with `max-width: calc(100vw - 16px)` under 768px. Verified 14–376px box, no horizontal scroll.

3. **"Title ()" in SEO/social metas for year-less films** (`film/[id]/+page.svelte`)
   - `description` and `og:description` interpolated `({film.year})` unguarded; 266 films in the DB have `year: null`, rendering a dangling `()`. Pre-existing since April.
   - Year segment now conditional. Verified on `/film/371fd199…` (": Saul Bass - The Art of The Title").

## QA Sweep Results (for the record)

- **Letterboxd reveal** ✓ hidden by default behind SHOW RATING, reveals on click, sessionStorage-persisted per film
- **Default sort** ✓ UI order matches `compareFilmsByCalendarPriority` (rated first → rating desc → popularity → earliest screening)
- Homepage filters (ALL/NEW/REP, WHERE, search, POSTERS/TEXT), film detail, watchlist flow, reachable (real travel-times), map (50 pins) + cinemas, people/directors pages, ⌘K palette surfaces, 7 static routes (incl. sign-in 307 redirects), mobile shell (lazy filter sheet, burger nav), dimmer restore-on-reload, data edge cases (no-poster/no-year/long-title films): **all pass**
- Console/network sweep across 14 routes × 2 viewports: only known dev-env noise (Clerk domain lock, PostHog ingest)
- Full Playwright E2E suite: **93 passed, 6 skipped, 0 failed**
- Notes (no action, data-quality not UI): directors named `?`, pipe-joined multi-director strings in DB

## Impact

- First-visit mobile users can now actually apply filters before answering the cookie banner.
- No horizontal scroll anywhere on mobile, matching the frontend rules.
- Cleaner share cards/snippets for year-less (mostly repertory/event) films.
