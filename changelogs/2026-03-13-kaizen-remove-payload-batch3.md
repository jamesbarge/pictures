# Kaizen — Remove unused _payload params (batch 3)

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Removed unused `_payload: ScraperTaskPayload` parameter from 5 independent scraper task handlers
- Removed `ScraperTaskPayload` from imports in each file
- Files: coldharbour-blue, cine-lumiere, romford-lumiere, garden, olympic

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
- 13 independent scraper task files remain with unused `_payload` params
