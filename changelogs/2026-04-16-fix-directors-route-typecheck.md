# Fix directors API TypeScript error blocking CI

**PR**: #425
**Date**: 2026-04-16

## Changes
- Replaced `result.rows.map()` with `result.map()` in the directors API route
- Drizzle ORM's `db.execute()` with postgres.js returns a `RowList<T[]>` which is directly iterable — there is no `.rows` property (that's a node-postgres pattern)

## Impact
- Unblocks CI on main — TypeScript type check (`tsc --noEmit`) now passes
- The API endpoint was working at runtime (postgres.js is lenient), but the type error prevented CI from going green
