# User Sync Batching

**PR:** #665

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
- Wrapped each festival route's delete + upsert sequence in a transaction —
  the full-replace semantics meant a dropped connection between the two
  statements could permanently wipe a user's follows or schedule.
- Added focused tests for request bounds, newest-wins duplicate handling, and
  set-based deletion.

## Reviewed and deliberately unchanged (pre-existing behavior)

- Conflict updates stamp `updatedAt` with the server clock rather than the
  client-supplied timestamp — identical to the previous per-row writes.
  Changing sync timestamp semantics is out of scope for this batching refactor.
- Oversized payloads are rejected with a generic 400 (no
  `PAYLOAD_TOO_LARGE` discriminator), and `followedAt` from the client is
  not persisted — both match the prior contract.

## Verification

- `npx vitest run src/lib/sync-batching.test.ts`
- `npm run test:run`
- `npx tsc --noEmit`
- `npm run lint`
