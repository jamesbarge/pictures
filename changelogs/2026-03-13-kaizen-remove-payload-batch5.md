# Kaizen — Remove unused _payload params (batch 5)

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_payload: ScraperTaskPayload` parameter from 2 independent scraper trigger task handlers
- Remove unused `ScraperTaskPayload` import from each file
- Files: electric.ts, lexi.ts
- Continues cleanup — 20 of 23 now done, 3 remaining (nickel, phoenix, regent-street)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
