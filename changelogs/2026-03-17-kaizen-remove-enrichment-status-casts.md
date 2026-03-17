# Kaizen — Remove redundant enrichmentStatus casts

**PR**: #384
**Date**: 2026-03-17

## Changes
- Removed 4 redundant `as EnrichmentStatus | null` casts across enrichment pipeline files
- The `enrichmentStatus` column already uses Drizzle's `.$type<EnrichmentStatus>()`, so selects return the correct type without casting
- 3 casts in `daily-sweep.ts` (Phases 1, 2, 4) and 1 cast in `post-scrape.ts`

## Impact
- Code quality improvement, no behavior changes
- Lets the type system do its job instead of manual overrides
- Kaizen category: type-narrowing
