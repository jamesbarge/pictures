# Split Header — Buttery-Smooth Compaction

**PR**: #646
**Date**: 2026-06-04

## Context

The compact-on-scroll header animated layout properties (`min-height` 180→56, logo 140→40, padding) over a 280ms timer. Two structural smoothness problems: (1) layout-property animation reflows the header subtree *and the whole document below it* every frame; (2) time-based, threshold-triggered motion plays at a speed unrelated to scroll velocity — content moves under the user's finger.

A 10-agent pipeline (4 researchers → 3 competing designers → 3 judges) settled the approach. Key research findings:
- CSS scroll-driven animations (`animation-timeline: scroll()`) only run off-main-thread for transform/opacity — scrubbing layout properties would still reflow per frame. Firefox stable still ships SDA disabled (June 2026).
- A sticky header whose height follows `max(H − y, H_compact)` scrubbed 1:1 with scroll is visually identical to a static masthead scrolling away with a compact bar pinning — i.e. the smoothest compaction is **no animation at all**.

All three judges picked the **split header** (98 pts vs 90 scrub-shell vs 85 optimized-discrete).

## Changes

- `Header.svelte` rearchitected into:
  - **`.masthead`** — in-flow, never sticky, never resizes: big centred 140px logo + vertical nav + burger, exactly the redesign's at-top composition. It scrolls away like any content. Compaction *is* scrolling.
  - **`.bar`** — `position: fixed`, constant 56px, occupies no flow space: small logo + horizontal nav + burger. Transparent and empty until the masthead scrolls past its bottom edge, then its contents mount and it crossfades in (opacity-only, ~160ms, zeroed by the global reduced-motion rule).
- **`stuck` detection**: one IntersectionObserver on the masthead with `rootMargin: -barHeight` — fires once per crossing (and once on observe, making mid-page loads/BFCache restores correct for free). The rAF scroll listener and the COMPACT_AT/EXPAND_AT hysteresis are deleted: document height is now constant in every state, so the scroll-anchoring feedback loop that demanded them is structurally impossible.
- **Selector/a11y contract** — exactly one of each at any scroll position: bar contents render only `{#if stuck}`; the masthead goes `inert`/`aria-hidden` and hands over its `aria-label="Main"` and home-link label when stuck. Playwright strict-mode locators (`nav[aria-label="Main"]`, `[aria-label="pictures london — home"]`, `.mobile-menu-btn`) resolve to exactly 1 element always.
- **`--header-height`**: masthead height at rest, 56px when stuck (ResizeObserver on both pieces). Mobile burger menu becomes a fixed panel anchored at `var(--header-height)` — below the masthead at rest, below the bar when stuck — and no longer shifts page content when opening. `Dropdown.svelte` fallback bumped 49→56px.
- **`data-header-compact`** boolean on `<html>` unchanged — the homepage house-lights fade works verbatim.
- Both logos render at native size (140px / 40px) and only ever crossfade — the `mix-blend-mode: multiply` treatment is never transform-scaled.

## Measurements (4× CPU throttle, 50 wheel steps crossing the boundary twice)

| Metric | Old transition | Split header |
|---|---|---|
| Dropped frames (>33.4ms) | 3 | **0** |
| Worst frame | 35.2ms | **17.7ms** |
| LayoutCount | 26 (home) / 35 (film) | **3-5 / 0** |
| LayoutDuration | 8.4ms / 5.3ms | **0.3-2.2ms / 0.0ms** |
| RecalcStyleDuration | 216ms / 98ms | **27-30ms / 10ms** |

## Verification

- svelte-check 0 errors; 7/7 header-coupled E2E specs pass (desktop nav, wordmark, hamburger ×4, day header)
- Browser invariants at top/mid/stuck/back-top on desktop + mobile: stuck state, bar opacity, inert swap, label handover, `--header-height` 213↔56 (205 mobile), `data-header-compact`, dial fade, menu anchoring 205→56, document height constant (13149px in all states)

## Impact

- Scrolling through the header costs the browser nothing beyond normal scroll compositing — smooth on low-power devices by construction, not by optimization.
- ~30 lines of threshold/hysteresis logic replaced by one IntersectionObserver.
