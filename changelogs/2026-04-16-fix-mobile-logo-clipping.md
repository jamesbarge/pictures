# Fix: `pictures·london` Wordmark Clipped on Mobile

**PR**: TBD
**Date**: 2026-04-16
**Branch**: `fix/mobile-logo-sign-in-hamburger`

## Problem

The `pictures·london` wordmark in the site header was getting clipped on mobile viewports. Users saw trailing characters of the wordmark cut off — the right-side nav/menu cluster was "eating into" the logo's space.

## Root Cause

The wordmark is rendered by `BreathingGrid.svelte` as 15 individually animated character cells with fixed pixel widths — total intrinsic width ~266px. The parent `.brand-link` has `flex-shrink: 1; overflow: hidden`, so on narrow viewports the link shrinks below the grid width and silently clips the trailing characters.

Available space on common mobile viewports (after 32px header padding, ~74px `SIGN IN` link, 36px hamburger button, 8px gaps):

- 390px (iPhone 12 Pro): ~224px → 42px clipped
- 375px (iPhone SE): ~209px → 57px clipped
- 360px (small Android): ~194px → 72px clipped

The existing mobile Playwright test (`brand wordmark fits without overflow`) only asserted body-level horizontal scroll, which `overflow: hidden` trivially satisfies even when the logo is clipped — so the bug was invisible to CI.

## Fix

Move the `SIGN IN` link out of the mobile header bar into the hamburger menu. This frees ~74px of horizontal space so the BreathingGrid wordmark fits at its full Swiss-brutalist 16px scale on every mobile viewport ≥321px.

## Changes

### `frontend/src/lib/components/layout/Header.svelte`

1. Add a `sign-in-link` class to the brand-bar SIGN IN anchor for a targeted mobile hide.
2. Append a new SIGN IN anchor to the existing `.mobile-nav` list (rendered when the hamburger opens).
3. Add `@media (max-width: 767px) { .sign-in-link { display: none; } }` to hide the brand-bar SIGN IN on mobile while keeping desktop (≥768px) layout unchanged.

### `frontend/tests/mobile.spec.ts`

1. Replace `brand wordmark fits without overflow` with `brand wordmark fits within brand-link without clipping` — adds a proper `brand-link.scrollWidth > clientWidth` assertion that actually detects clipping (the old `bodyWidth ≤ viewportWidth` check passed trivially due to `overflow: hidden`).
2. Replace `SIGN IN does not wrap to two lines` with `SIGN IN link is hidden in brand-bar on mobile (moved into hamburger menu)` — asserts the brand-bar link has `href="/sign-in"` but is hidden via CSS on mobile.

## Verification

- `npm run check` — zero new type errors (no change to pre-existing unrelated errors).
- `npx playwright test tests/mobile.spec.ts -g "Header"` — all 3 Header tests pass on iPhone 12 Pro.
- Visual confirmation at 360px (Galaxy S8), 375px (iPhone SE), 390px (iPhone 12 Pro), and 1440px (desktop): full `pictures·london` wordmark visible with no clipping; desktop layout unchanged.
- Full `tests/mobile.spec.ts` run: 25 passed / 5 pre-existing failures (all in Filter Bar dropdown and Mobile Navigation menu-opening — unrelated to this fix).

## Impact

- Mobile users see the full `pictures·london` wordmark for the first time since the SvelteKit rewrite (#405).
- `SIGN IN` is now discovered via the hamburger menu on mobile, consistent with the other navigation items (ABOUT / MAP / REACHABLE / CINEMAS / TONIGHT / DIRECTORS).
- Desktop is untouched.
