# CR-03 — Unify Title Extraction

**Branch**: `cr03-unify-title-extraction`
**Date**: 2026-02-28

## Changes

- Created `src/lib/title-extraction/` module with unified exports
- `patterns.ts`: Merged EVENT_PREFIXES (47 string entries + regex patterns), TITLE_SUFFIXES (21 patterns), VERSION_SUFFIX_PATTERNS (13 patterns), NON_FILM_PATTERNS (16 patterns), and special patterns (PRESENTS, SINGALONG, DOUBLE_FEATURE, FRANCHISE) from both extractors
- `pattern-extractor.ts`: Sync regex-based extraction (`extractFilmTitleSync`) — moved from `src/agents/enrichment/title-extractor.ts`, now imports shared patterns
- `ai-extractor.ts`: Async Gemini-powered extraction (`extractFilmTitleAI`) — moved from `src/lib/title-extractor.ts`, now imports shared patterns
- `search-variants.ts`: TMDB search variation generator (`generateSearchVariations`) — moved from agents version
- `index.ts`: Unified entry point re-exporting both paths plus caching (`extractFilmTitleCached`), batch (`batchExtractTitles`), and hybrid (`extractFilmTitle`)
- `pattern-extractor.test.ts`: 17 new Vitest tests converted from inline `testExtractor()` console function
- `ai-extractor.test.ts`: Moved from `src/lib/title-extractor.test.ts` with updated imports (all 131 existing tests preserved)

### Import site updates (4 files)
- `src/scrapers/pipeline.ts` → `@/lib/title-extraction`
- `src/agents/enrichment/index.ts` → `@/lib/title-extraction` (uses `extractFilmTitleSync` + `generateSearchVariations`)
- `src/scripts/enrich-upcoming-films.ts` → `@/lib/title-extraction`
- `src/scripts/cleanup-upcoming-films.ts` → `@/lib/title-extraction`

### Deleted files (3)
- `src/lib/title-extractor.ts` (332 lines)
- `src/lib/title-extractor.test.ts` (747 lines)
- `src/agents/enrichment/title-extractor.ts` (390 lines)

## Impact

- Eliminates maintenance risk from two diverging title extraction implementations
- Shared pattern constants mean bug fixes apply to both extraction paths
- Unblocks CR-01 (Pipeline Decomposition) which needs clean imports from `@/lib/title-extraction`
- No behavioral changes for any caller — all existing tests pass
