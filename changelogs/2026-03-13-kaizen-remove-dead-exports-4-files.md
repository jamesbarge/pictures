# Kaizen — Remove Dead Exports (4 Files)

**PR**: #268
**Date**: 2026-03-13

## Changes
- Removed `export` from `batchClassifyContent` and `getCacheStats` in content-classifier.ts
- Removed `export` from `FRANCHISE_PREFIXES` in title-patterns.ts
- Removed `export` from `addToFilmCache` in film-matching.ts
- All 4 are only used internally within their own files

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- ESLint warnings reduced from 44 to 43
