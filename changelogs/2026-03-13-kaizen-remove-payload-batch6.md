# Kaizen — Remove unused _payload params (batch 6)

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Removed unused `_payload: ScraperTaskPayload` parameter from 5 independent scraper task handlers
- Removed `ScraperTaskPayload` from imports in each file
- Files: riverside.ts, rich-mix.ts, regent-street.ts, prince-charles.ts, phoenix.ts

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
- Only 1 independent scraper task file remains with unused `_payload` param (nickel.ts)
