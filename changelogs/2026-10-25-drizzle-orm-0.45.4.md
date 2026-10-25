# drizzle-orm 0.45.4

**PR**: #PRNUM
**Date**: 2026-10-25

## Changes
- `drizzle-orm` ^0.45.3 → ^0.45.4 in `package.json`, lockfile updated with `npm install --package-lock-only`.
- Replaces Dependabot PR #832. It conflicted with main, and Dependabot answered every rebase and recreate request with an error or not at all.

## Impact
- The only upstream change makes postgres-js honour explicit `.prepare(name)`. The codebase has no such call, and both clients in `src/db/index.ts` set `prepare: false`, which the Supabase transaction pooler needs. Query behaviour is unchanged.
