# Kaizen — Remove unused _payload params (batch 3)

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_payload: ScraperTaskPayload` parameter from 5 independent scraper trigger task handlers
- Remove unused `ScraperTaskPayload` import from each file
- Files: arthouse.ts, barbican.ts, castle-sidcup.ts, castle.ts, cine-lumiere.ts
- Continues cleanup from PRs #226 (chains) and #227 (batch 2)

## Impact
- Code quality improvement, no behavior changes
- Eliminates 5 more `no-unused-vars` lint warnings in src/trigger/
- Kaizen category: lint-fix
