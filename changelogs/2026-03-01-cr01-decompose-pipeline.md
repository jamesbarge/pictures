# CR-01: Decompose pipeline.ts — 3 Giant Methods

**Branch**: `cr01-decompose-pipeline`
**Date**: 2026-03-01

## Changes

Three methods in `src/scrapers/pipeline.ts` accounted for 564 lines (49.7% of the file), each mixing 3-4 distinct concerns. This refactoring extracts them into focused utility modules.

### New files

- **`src/scrapers/utils/film-title-cleaner.ts`** (191 lines)
  - `EVENT_PREFIXES` array (95 regex patterns for event prefix stripping)
  - `cleanFilmTitle()` function (regex-based title cleaning fallback)
  - Note: These are separate from `src/lib/title-extraction/patterns.ts` which serves the AI extractor

- **`src/scrapers/utils/film-matching.ts`** (421 lines)
  - Film cache: `initFilmCache()`, `lookupFilmInCache()`, `addToFilmCache()`, `logCacheStats()`, `resetFilmCache()`
  - Similarity search: `findFilmBySimilarity()`
  - TMDB matching: `matchAndCreateFromTMDB()`, `createFilmWithoutTMDB()`
  - Poster resolution: `tryUpdatePoster()`, `findPosterFromService()`

- **`src/scrapers/utils/screening-classification.ts`** (188 lines)
  - `classifyScreening()`: AI event classification with fallback
  - `checkForDuplicate()`: Two-layer dedup (exact key + normalized title guard)
  - `ScreeningMetadata` and `DuplicateCheckResult` interfaces

### Method size reductions

| Method | Before | After | Target |
|--------|--------|-------|--------|
| `getOrCreateFilm()` | 276 lines | 70 lines | ~120 lines |
| `insertScreening()` | 217 lines | 93 lines | ~100 lines |
| `cleanFilmTitle()` | 71 lines | 0 (re-export) | ~15 lines |
| `pipeline.ts` total | 1,134 lines | 570 lines | ~700 lines |

### External API preserved

- `cleanFilmTitle` re-exported from `pipeline.ts` for backward compatibility
- `normalizeTitle`, `processScreenings`, `saveScreenings`, `ensureCinemaExists` unchanged
- All imports from `@/scrapers/pipeline` continue to work

## Impact

- **Developer experience**: Each utility module has a single, clear responsibility
- **Maintainability**: Modifying event prefixes, TMDB matching, or dedup logic no longer requires navigating a 1,134-line file
- **Testability**: Extracted modules can be unit tested independently in the future
- **Zero behavioral changes**: Pure refactoring, all 683 existing tests pass
