# Add unit tests for src/scrapers/task-registry.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/task-registry.test.ts` (new) — 10 vitest cases for `getTriggerTaskId` + `getAllTriggerTaskIds`.

## Coverage
- Independent → task mapping (rio-dalston, ica, barbican)
- Chain cinema → chain task (curzon-soho → scraper-chain-curzon)
- Unknown cinema ID → null
- **Pinned precedence**: independent-map is checked FIRST (bfi-southbank is in INDEPENDENT_TASK_MAP and has chain=null; resolves via independent, not chain)
- Shared-task cases: both BFI venues → "scraper-bfi"; both Electric venues → "scraper-electric"
- Deduplication of the full task ID set
- Chain task IDs all present
- Naming-convention invariant: every task ID starts with "scraper-"

## Why
This module routes admin-triggered scrapes from cinema ID to the cloud-orchestrator task. A regression in the lookup silently mis-routes a cinema (admin clicks "Run BFI" but the wrong scraper fires) or returns null (admin button does nothing).

The precedence test is particularly load-bearing — the independent-vs-chain lookup ordering decides what runs when both could match.

## Changelog deferral note
Per #523-#530.
