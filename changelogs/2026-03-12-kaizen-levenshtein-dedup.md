# Kaizen — Extract shared levenshteinDistance utility

**PR**: #165
**Date**: 2026-03-12

## Changes
- Created `src/lib/levenshtein.ts` with exported `levenshteinDistance` and `levenshteinSimilarity`
- Removed duplicate implementations from `season-linker.ts`, `pipeline.ts`, `confidence.ts`, `match.ts`

## Impact
- Code quality improvement, no behavior changes
- 4 identical function copies → 1 shared utility (single place to test/optimize)
- Kaizen category: duplicate-pattern
