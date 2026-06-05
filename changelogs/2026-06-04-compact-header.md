# Scroll-Compacting Sticky Header

**PR**: #646
**Date**: 2026-06-04

## Changes

- **Compact-on-scroll**: the sticky header shrinks once the user scrolls into the page and expands again at the top.
  - Desktop: 213px → 65px. Mobile (390px): 205px → 63px.
  - Brand bar `min-height` 180 → 56px, logo 140×140 → 40×40, `header-inner` top padding 32 → 8px (desktop) / 24 → 6px (mobile).
  - Nav links flip from the vertical right-aligned stack to a horizontal row (≥768px only; mobile keeps the burger).
  - Transition uses the design tokens `--duration-slow` (280ms) + `--ease-snap`; the global `prefers-reduced-motion` override in `app.css` neutralises it for reduced-motion users.
- **Hysteresis**: compact at `scrollY > 180`, expand at `scrollY < 4`. Compacting shrinks the document by ~148px and browser scroll-anchoring pulls `scrollY` down by that amount (measured: scroll to 600 settles at 452); the 176px threshold gap exceeds the delta so the state can never oscillate.
- **ResizeObserver replaces the rAF measuring effect** for `--header-height`. The old effect only re-measured when `mobileMenuOpen` changed; the observer fires for any box change — compact transition frames, menu toggling, and viewport resizes (previously missed). Consumers (`Dropdown.svelte` fixed-position mobile panels, `DimmerDial.svelte` vignette) track the animated height continuously.
- **`data-header-compact` attribute on `<html>`** (same broadcast pattern as `--header-height`). The homepage `.dimmer-anchor` (house-lights dial, `fixed; top: 32px; right: 24px`) shares the header's top-right corner; in compact mode the nav row moves up into that space, so the dial fades out (`opacity` fade, then delayed `visibility: hidden` so the slider also leaves the accessibility/tab order). It returns when the user scrolls back to the top.
- **≤320px guard**: the existing tiny-viewport rule sets the brand bar to 40px; the compact rule (higher specificity) would have *raised* it to 56px on scroll. Compact is pinned to 40px inside that media query — verified 165px → 47px at 320px.

## Verification

- Playwright against the local dev server: full compact/expand cycle on `/` and `/film/[id]` at 1440px, 390px, and 320px; mobile burger menu opens while compact with `--header-height` tracking 63 → 388px; DimmerDial fades (`opacity: 0`, `visibility: hidden`) with no nav overlap.
- `npm run check`: identical error/warning counts to the branch baseline (12/17, all pre-existing).
- 20-agent adversarial review (3 lenses × verify): zero defects confirmed; findings were verified non-issues (reduced-motion, tab order, breakpoint interplay, logo crop, ResizeObserver coverage).

## Impact

- Every page (header is in the root layout). Frees ~150px of pinned chrome — about a third of a phone screen — while keeping nav reachable at all scroll positions.
- The previous `--header-height` consumers behave identically at rest and now track correctly during animation.
