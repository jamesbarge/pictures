# Kaizen — Remove Unused _payload and _error Params

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_payload: ScraperTaskPayload` from 3 chain scraper task handlers (curzon, everyman, picturehouse)
- Remove unused `ScraperTaskPayload` import from those files
- Remove unused `_error?: string` parameter from `classifyAlert()` in alert-tiers.ts
- Remove second argument from `classifyAlert(task, message)` call in on-failure.ts

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
