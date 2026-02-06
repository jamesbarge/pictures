# Calendar Card Prefetch Interaction Semantics

**PR**: #93
**Date**: 2026-02-06

## Changes
- Removed prefetch hover/touch handlers from non-interactive `<article>` wrappers in `film-card.tsx` and `screening-card.tsx`.
- Applied the same prefetch handlers to both interactive `Link` targets in each card (poster link and content link).
- Kept analytics click tracking and navigation behavior unchanged.

## Impact
- Improves accessibility semantics in two core calendar card components.
- Preserves prefetch performance behavior while associating interaction handlers with true interactive controls.
- Reduces lint noise for non-interactive event handlers in high-traffic UI surfaces.
