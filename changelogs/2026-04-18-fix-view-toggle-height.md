# Fix grid/list ViewToggle overheight on desktop filter bar

**PR**: TBD
**Date**: 2026-04-18

## Changes
- `ViewToggle` buttons: `min-height: 2.75rem` (44px) → `height: 2rem` (32px) on desktop
- Added `@media (max-width: 767px)` override to restore the 44px touch target on mobile
- Swapped `min-width: 2.75rem` for `min-width: 2rem` with `padding: 0 0.5rem` to keep icons centered

## Why
The ViewToggle sat in the same row as `WHEN / ALL CINEMAS / FORMAT` dropdown triggers, which render ~32px tall from `padding: 0.375rem 0.625rem` + `font-size-xs`. The 44px toggle button — most visible when its active state fills with solid black — stuck out above and below the row, breaking the Swiss-brutalist alignment of the filter bar.

## Impact
- Desktop filter bar now has consistent 32px control height across all filter zones
- Mobile unchanged — touch targets remain WCAG 2.5.5-compliant at 44px
