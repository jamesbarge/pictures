# Fix Broken Accent Hover Tokens

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Updated `/film/[id]/not-found` primary action to use `hover:bg-accent-primary-hover` instead of invalid `hover:bg-accent-hover`.
- Updated date-range picker `Apply` button hover class to the same valid token.
- Kept all interaction logic unchanged; this fix only restores intended hover styling behavior.

## Impact
- Fixes missing hover states in two user-visible controls.
- Improves consistency by using existing design-system token names.
- Reduces silent styling regressions from undefined utility classes.
