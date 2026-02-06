# Mobile Menu Scrim and Backdrop Accessibility

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Updated the mobile menu backdrop in `header-nav-buttons.tsx` from `bg-black/50` to `bg-black/60 backdrop-blur-sm`.
- Replaced the backdrop from a clickable `<div>` to a semantic `button` with an explicit `aria-label`.
- Kept drawer open/close behavior and transition timing unchanged.

## Impact
- Aligns mobile navigation overlay depth with the existing header/search overlay visual system.
- Improves accessibility semantics for a high-traffic navigation interaction.
- Reduces visual drift by using one consistent scrim treatment across overlay entry points.
