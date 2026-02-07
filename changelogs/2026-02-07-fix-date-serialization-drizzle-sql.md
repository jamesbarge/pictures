# Fix Date Serialization in Drizzle SQL Templates

**Date**: 2026-02-07
**PR**: #104
**Type**: Bugfix

## Problem

The `/admin` dashboard was crashing with a Server Components render error. The health API
(`/api/admin/health`) returned:

```
TypeError: The "string" argument must be of type string or an instance of Buffer or ArrayBuffer.
Received an instance of Date
```

## Root Cause

Drizzle ORM's `sql` tagged template literal passes interpolated values directly to the
postgres.js driver as query parameters. Unlike Drizzle's ORM helpers (`gte()`, `eq()`, etc.)
which serialize `Date` objects to ISO strings internally, the `sql` template forwards raw
`Date` instances. The postgres.js `Bind` function calls `Buffer.byteLength()` on parameters,
which requires strings — not Date objects.

The admin dashboard redesign (PR #103) switched from direct DB queries to `runFullHealthCheck()`,
which used `FILTER` clauses with raw Date parameters, surfacing this latent bug.

## Fix

Applied `.toISOString()` to all Date objects used in Drizzle `sql` template literals:

- `src/lib/scraper-health/index.ts`: `in7days.toISOString()` and `in14days.toISOString()` in
  `COUNT(*) FILTER` expressions
- `src/app/api/search/route.ts`: `now.toISOString()` in the screenings join condition

## Files Changed

- `src/lib/scraper-health/index.ts`
- `src/app/api/search/route.ts`
- `RECENT_CHANGES.md`
