# Kaizen — Remove Unused _payload Params (Batch 2)

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_payload: ScraperTaskPayload` param from 5 independent scraper task handlers
- Remove unused `ScraperTaskPayload` import from those files
- Files: david-lean.ts, genesis.ts, rio.ts, ica.ts, peckhamplex.ts

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
