# Kaizen — Extract enrichment status update helper

**PR**: #360
**Date**: 2026-03-15

## Changes
- Extracted `updateEnrichmentStatus()` helper from 6 inline enrichment-status-update blocks in `daily-sweep.ts`
- Each phase (TMDB match, TMDB backfill, poster sourcing) had duplicated patterns: computing `prevAttempts`, spreading `EnrichmentStatus`, calling `makeAttempt()`, and writing to DB
- New helper consolidates all 6 into a single function accepting `field`, `success`, `reason`, and optional `extraFields`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Net reduction of 24 lines
