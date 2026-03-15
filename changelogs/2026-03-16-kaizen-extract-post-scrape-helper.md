# Kaizen — Extract saveEnrichmentResult Helper

**PR**: #369
**Date**: 2026-03-16

## Changes
- Extracted `saveEnrichmentResult()` from duplicate success/failure enrichment persistence blocks in `post-scrape.ts`
- Both paths shared: compute prevAttempts, build updatedStatus via makeAttempt(), call db.update(). Now a single helper with optional tmdbId/reason params

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
