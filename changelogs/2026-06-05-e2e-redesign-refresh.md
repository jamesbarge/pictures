# E2E Suite Refresh — Redesigned DOM + Regression Locks

**PR**: TBD
**Date**: 2026-06-05

## Context

The Spline redesign (#646) rewrote the homepage and header but shipped no test updates, leaving ~76 spec lines pointing at removed selectors — passing vacuously (conditional skips / never-matched locators) and masking real regressions. This is the follow-up flagged by the five-agent review (test-coverage lens).

## Changes

- **`test-all.spec.ts`** (desktop) — re-pointed homepage/navigation/cross-page tests from pre-redesign selectors (`.film-card`, `.masthead-title`, `.day-strip`/`.strip-btn`, `.desktop-toolbar`, `aside.sidebar`, `.desktop-film-grid`, `.breathing-grid`, `Repertory` label) to the redesigned DOM via role-based locators (`role="toolbar"`, the Date-range/Film-type/Display-mode tablists, `.card`/`.film-row`/`.day-header`). Tests targeting `/tonight`, `/this-weekend`, `/festivals` (which still use the old card components) left untouched.
- **`tests/mobile.spec.ts`** — replaced the `.breathing-grid` wordmark-geometry tests with the new `<img class="brand-logo">` masthead; replaced the `.sign-in-link` test with the new contract (burger menu has no SIGN IN entry, `/sign-in` 307-redirects home); re-pointed `.mobile-day`/`.mobile-type-tabs`/`.mobile-search`/`.mobile-list` homepage tests to the unified `section.day`/`.film-row`/`article.card` shell + the FigmaToolbar FILTERS → lazy MobileFilterSheet flow.
- **`tests/command-palette.spec.ts`** — the one behaviorally-broken assertion (composite filter-action asserted `aria-pressed` on the removed sidebar's `70mm`/`Horror` buttons) rewritten for the toolbar: after Enter, the FORMAT chip label collapses to `70MM` and GENRE to `HORROR`, and opening the FORMAT panel shows the `70MM` checkbox checked — proving `filters.applyIntent` propagated. The other four role-based palette tests verified intact.
- **`tests/redesign-regression.spec.ts`** (new) — 4 tests locking in this week's hand-fixed bugs:
  1. **Resize ratchet** — `fitToFirstRow` width pin must grow back, not only shrink (1440 → 400 → 1440 re-expands; verified 1309 → 368 → 1309).
  2. **Header selector uniqueness** — exactly one `nav[aria-label="Main"]` / home link / `.mobile-menu-btn` at top AND when stuck.
  3. **`--header-height` contract** — finite ≥40px at rest, ~56px stuck, burger panel anchors at the var (verified 205 → 56 → menu.y===56). Hardened against the post-hydration `$effect` race with `waitForFunction` guards.
  4. **Banner z-order** — with the consent banner up, `elementFromPoint` on the filter sheet's "Show N films" CTA hits the button, not `.consent-banner` (locks the z-9999→70 fix).
- **Deleted `BreathingGrid.svelte`** — orphaned since the redesign (zero imports, verified).

## Verification

- svelte-check 0 errors (fixed the new spec's `addInitScript` helper type)
- test-all 106 ✓ · mobile 52 ✓ (4 skipped) · command-palette 10 ✓ · redesign-regression 8 ✓ — **176 passed, 0 failed**
- regression spec stability: 24/24 with `--repeat-each=3 --retries=0` across both projects

## Open judgment calls (recorded by the spec authors)

- Command-palette confirmation asserts toolbar state (chip label + panel checkbox) rather than the filtered card-set delta — the card delta is flaky against live data (horror+70mm can legitimately be empty on a given day). Pinned to 1440px because the chips collapse to a bottom sheet below 840px.
- Resize-ratchet test inspects the first `section.day` and skips if it has <2 cards (production currently renders one rolling section).
- `--header-height` stuck assertion uses a tolerant 40–72px band, not exact 56, for sub-pixel/border rounding.
