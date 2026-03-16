# Kaizen — Extract saveByVenue in BFI PDF Importer

**PR**: #373
**Date**: 2026-03-16

## Changes
- Extracted duplicated venue-grouping + save logic from `runBFIImport` and `runProgrammeChangesImport` into shared `saveByVenue()` helper
- Both functions had nearly identical blocks filtering screenings by venue, then saving with try/catch per venue
- Net -28 lines (41 added, 69 removed)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability (cross-cutting dedup exception)
