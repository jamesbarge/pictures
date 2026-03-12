# Kaizen — Remove unused imports from scraper runners

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Removed unused `runScraper` import from 4 scraper runner scripts (run-bfi-v2, run-genesis-v2, run-genesis-v2-basescraper, run-rio-v2)
- Removed unused `desc` import from local-runner.ts
- All 4 runner scripts use `createMain` from runner-factory, not `runScraper`

## Impact
- Code quality improvement, no behavior changes
- Eliminates 5 `no-unused-vars` lint warnings in src/scrapers/
- Kaizen category: lint-fix
