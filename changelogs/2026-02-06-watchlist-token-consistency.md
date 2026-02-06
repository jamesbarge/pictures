# Watchlist Token Consistency

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Updated watchlist section indicator, action icon hovers, and sync banner CTA styles to semantic token classes.
- Replaced invalid classes (`hover:text-accent-hover`, `to-accent-secondary/10`) with valid design-system token variants.
- Switched remaining `text-white` usage in watchlist CTA to `text-text-inverse` for token consistency.
- Preserved all watchlist behavior (sorting, expand/collapse, actions, sign-in flow); visual-system changes only.

## Impact
- Prevents style drift and fixes non-resolving utility classes in a core user-facing page.
- Improves consistency of positive/danger states across watchlist interactions.
- Makes watchlist visuals more resilient to future theme/token updates.
