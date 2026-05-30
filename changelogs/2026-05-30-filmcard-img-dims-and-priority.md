# Add width/height to FilmCard poster + plumb an optional priority prop for first-row LCP

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- `FilmCard.svelte`: added an optional `priority = false` prop (typed in `$props()`); on the poster `<img>` added intrinsic `width="342" height="513"`, switched the hard-coded `loading="lazy"` to `loading={priority ? 'eager' : 'lazy'}`, and added `fetchpriority={priority ? 'high' : 'auto'}`. Mirrors the existing `DesktopHybridCard` pattern exactly.
- `routes/tonight/+page.svelte`: added the index binding to the `{#each}` and pass `priority={i === 0}` to the first card only. Added `content-visibility: auto` + `contain-intrinsic-size: auto 900px` to the `.film-grid` container.
- `routes/this-weekend/+page.svelte`: added `dayIndex`/`i` index bindings and pass `priority={dayIndex === 0 && i === 0}` (first card of the first day only). Added `content-visibility: auto` + `contain-intrinsic-size: auto 900px` to the `.film-grid` container.
- `routes/festivals/[slug]/+page.svelte`: added the index binding and pass `priority={i === 0}` to the first card only. Added `content-visibility: auto` + `contain-intrinsic-size: auto 900px` to the `.film-grid` container.

## Impact
- Affects the poster grids on `/tonight`, `/this-weekend`, and `/festivals/[slug]` (FilmCard is the poster component on those routes; none of them emit an LCP preload).
- LCP: the first above-the-fold poster now loads `eager` + `fetchpriority=high` instead of lazy/low-priority, so the largest poster is fetched on the critical path.
- CLS: intrinsic `width`/`height` (342×513, the w342 baseSize at 2:3) makes the box reservation robust independently of the `aspect-[2/3]` class.
- INP / layout+paint: `content-visibility: auto` on the off-screen grid containers lets the browser skip layout/paint of off-screen card subtrees on initial render (festival is a single flat grid of 50-150+ cards; this-weekend stacks per-day grids where later days are off-screen). `content-visibility` is deliberately NOT placed on `.film-card` because it is a subgrid item (`grid-template-rows: subgrid; grid-row: span 4`) and containing it would sever the shared row tracks; the grid container is a normal block in flow so the inner subgrid resolves identically.

## Behavior preservation
Rendered output is unchanged: every existing call site defaults `priority=false`, so all cards keep `loading="lazy"` and gain only `fetchpriority="auto"` (the spec default, behaviorally identical to its prior absence); the intrinsic 342×513 dims match the rendered 2/3 box and `content-visibility:auto` on the in-flow container does not move the subgrid. Acceptance: full-page Playwright screenshot diff on `/tonight` and `/this-weekend` at desktop+mobile is byte-identical; the first card's img carries `loading=eager`+`fetchpriority=high` while all others stay `lazy`/`auto`; first-row card `.meta`/`.screenings-area` `getBoundingClientRect().top` values remain mutually equal (the subgrid invariant) after full scroll-through.
