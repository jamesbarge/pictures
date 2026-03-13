# Kaizen — Remove Unused year Parameter from titleToSlug

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed unused `year` parameter from `titleToSlug()` in `src/db/enrich-letterboxd.ts`
- Updated call site in `fetchLetterboxdRating()` to match new signature
- The `year` variable was passed to `titleToSlug` but never used inside it; year disambiguation is handled separately in `fetchLetterboxdRating`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
