# Kaizen — Unexport 5 Internal-Only Scraper Pipeline Exports

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed `export` from `ValidationSummary` in screening-validator.ts
- Removed `export` from `PipelineResult` in pipeline.ts
- Removed `export` from `VenueResult`, `flushPendingRecords`, `parseVenueArgs` in runner-factory.ts

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Reduces public API surface of scraper pipeline internals
