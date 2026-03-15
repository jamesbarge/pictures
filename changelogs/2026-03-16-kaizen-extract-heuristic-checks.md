# Kaizen — Extract applyHeuristicChecks in Scraper Health Agent

**PR**: #371
**Date**: 2026-03-16

## Changes
- Extracted duplicated heuristic check logic (large drop detection + zero screenings detection) from `analyzeScraperHealth` and `runHealthCheckAllCinemas` into shared `applyHeuristicChecks()` helper
- Standardized dedup guards for warning messages across both call sites

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
