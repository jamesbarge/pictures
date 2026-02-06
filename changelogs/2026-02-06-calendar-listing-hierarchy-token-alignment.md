# Calendar Listing Hierarchy and Token Alignment

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Updated `src/components/calendar/screening-card.tsx` to align availability, repertory, and special-format styling with design-system tokens.
- Refined screening card visual rhythm with consistent rounded corners and slightly increased content padding.
- Replaced hardcoded Letterboxd star colors in `src/components/calendar/table-view.tsx` with `accent-highlight` tokens.
- Improved table listing rhythm in `src/app/globals.css` by slightly increasing header/cell padding and expanded-detail spacing.
- Reworked `src/components/film/status-toggle.tsx` action colors from hardcoded pink/gray to semantic token classes for `want_to_see` and `not_interested`.
- Updated `src/components/error-boundary.tsx` fallback colors to tokenized danger surfaces and text for consistency with global theming.

## Impact
- Improves scanability and readability in the app’s highest-traffic listing surface (calendar grid + table view) without changing behavior.
- Reduces visual drift caused by hardcoded utility colors that did not match the editorial design system.
- Makes state semantics (availability, watchlist actions, and errors) more consistent across components and themes.
