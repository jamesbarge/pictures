# User Sync Batching

**PR:** TBD

## Problem

The full user sync route and three festival sync routes accepted unbounded or
very large arrays and issued one database upsert per client item. Festival
bidirectional sync also fetched festival metadata one row at a time and used
repeated linear scans while merging.

## Changes

- Added a shared bounded-array contract: 500 festival items and the existing
  5,000 full film-status sync allowance.
- Collapse duplicate conflict keys by newest `updatedAt` before batch upserts.
- Batch film-status, festival-follow, and festival-schedule upserts into one
  statement per collection.
- Fetch festival metadata in one query.
- Use sets for deletion and server-only membership checks.
- Added focused tests for request bounds, newest-wins duplicate handling, and
  set-based deletion.

## Verification

- `npx vitest run src/lib/sync-batching.test.ts`
- `npm run test:run`
- `npx tsc --noEmit`
- `npm run lint`
