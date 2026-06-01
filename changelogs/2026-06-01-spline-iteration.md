# Spline redesign — polish + responsive fixes

**PR**: TBD
**Date**: 2026-06-01
**Branch**: `feat/figma-spline-redesign`

## Why

Iteration session on top of the 2026-05-17 spline-redesign branch. Caught a real layout bug (4-cards row never rendered due to wrong padding math), tightened the responsive behaviour of the toolbar, restyled the Showings section on the film page, and brought Reachable + Watchlist into the same design language so the system reads cohesively.

## Changes

### Film detail Showings (`frontend/src/routes/film/[id]/+page.svelte`)
- WHERE / WHEN head row above the screening rows, left-aligned, on the page bg colour (`#efe9dc`).
- New **Show all** toggle button in the day strip — when active, all upcoming screenings render grouped by date with dark date dividers (`--color-screening-bg` / `--color-screening-text`).
- Each screening row is now a single `<a>` element so the whole row (cinema cell + time cell) is clickable and shares one hover state (`--color-cream`).
- Cinema column lightened from `--color-cream` to `--color-bg-subtle` (resting) so the cream hover reads as a state change.
- Calendar popover styled to match the toolbar dropdown (white surface, 1px border, brutalist shadow). Container `overflow: hidden` removed so the popover isn't clipped — bottom corners of the last screening row explicitly rounded to keep the panel edges clean.
- Snippet-based row rendering (`{#snippet screeningRow(s) ...}`) to avoid duplicating markup for single-day vs show-all modes.

### Homepage cards (`frontend/src/lib/components/calendar/FigmaFilmCard.svelte`)
- Card stretches to viewport width under 400px — poster sizes via `aspect-ratio: 264 / 396` so proportions are preserved.
- Cinema text in screening rows now ellipsizes when it overflows. The pre-existing `text-overflow: ellipsis` was a no-op because the parent was `display: flex` — switched to `display: block` with `line-height: 22px` for vertical centring inside the 30px row.
- Rail-cell divider line: kept original `border-bottom` (the pseudo-element variant introduced a 1px gap on hover that read as the divider disappearing).

### Card-grid breakpoints (`frontend/src/routes/+page.svelte`)
The big one. The 4-cards row was advertised at `min-width: 1340` with `page-chrome max-width: calc(1309 + 32px)`, but `page-chrome` has 24px horizontal padding (`padding: 28px 24px 80px`) at ≥768, so the actual usable inner width was 48px less than the calc assumed. At a 1340 viewport, inner was 1292, but 4 cards need 1309 inner — so the 4th card always wrapped. Fixed by recomputing all the breakpoints against the real 48px padding:

| Cards | Inner needed | Breakpoint | `page-chrome` `max-width` |
|------:|-------------:|-----------:|--------------------------:|
| 2     |   655        | ≥703       | (no cap)                  |
| 3     |   982        | ≥1030      | `calc(982 + 48px)` = 1030 |
| 4     |  1309        | ≥1357      | `calc(1309 + 48px)` = 1357|

Also dropped the `@media (min-width: 696px) { max-width: 687 }` cap on `.page-chrome` — that caused a jarring ~327px width drop at the 1024 boundary going down. Chrome now shrinks continuously through the tablet range.

### Toolbar (`frontend/src/lib/components/filters/FigmaToolbar.svelte`)
- `col-narrow` regridded from `1fr 1fr 1fr` to `1fr 1fr 200px` with explicit `nth-child` placement, so the segments column (ALL/NEW/REP + POSTERS/TEXT) stays in a dedicated 200px lane on the right while WHERE/GENRE/FORMAT/ERA share the remaining 2 columns at `1fr` each.
- `col-wide` min-width raised 240→316 so the search + date-pills column doesn't collapse uncomfortably.
- Mobile breakpoint moved 767→839 — filter chips collapse into the sheet earlier so the desktop layout doesn't try to render at cramped tablet widths.
- Mobile FILTERS button now sits **next to the search input** via a 2-column grid layout in `col-wide` (search 1fr, FILTERS auto), with date pills on row 2 spanning both columns.
- POSTERS/TEXT view-mode toggle hidden under 480px.
- FILTERS button is now a plain button (no chevron) since it opens a bottom sheet, not a dropdown.
- Filter icon: sliders/tune style with three lines and offset knob dots (not a burger).

### Header burger (`frontend/src/lib/components/layout/Header.svelte`)
Updated SVG to match the search icon's stroke style — `stroke-width: 1.4`, `stroke-linecap: square`, viewBox `0 0 16 16` with `M2 5H16…` line spacing. Now the burger and the search/filter icons all read as the same icon family.

### Reachable (`frontend/src/lib/components/reachable/ReachableResults.svelte`)
- Cards: surface white → `--color-bg-subtle` resting, hover adds `--color-cream` bg in addition to the existing border-darken.
- Urgency group headers (LEAVE SOON / WITHIN HOUR / LATER) restyled as dark bands (`--color-screening-bg` / `--color-screening-text`) with cream text variants for each urgency level — matches the date dividers on the film page.

### Watchlist (`frontend/src/routes/watchlist/+page.svelte`)
- Row hover colour: `--color-bg-subtle` → `--color-cream` (matches Showings / Reachable).
- Bumped text sizes: title `--font-size-sm` (12px) → `--font-size-base` (14px), meta + screening-count + next-time + no-screenings all xs (10px) → sm (12px).
- Poster 36×54 → 48×72 to match the heavier text scale.
- Slightly more breathing room: row gap 12→14px, vertical padding 10→14px.

## Impact

- **Bug fix**: the 4-cards layout now actually renders on screens that should support it (≥1357 viewport). Previously stuck at 3-across on every desktop the team uses.
- **Cohesion**: Showings, Reachable, Watchlist, and the homepage cards now share the same hover colour, resting bg tone, and dark section-divider treatment — feels like one design system rather than three.
- **Responsive**: no more dead-zones during resize where neither desktop chips nor mobile FILTERS button is visible; chrome shrinks smoothly through the tablet range; cards stretch on small phones instead of overflowing fixed 328px.
