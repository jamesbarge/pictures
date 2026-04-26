# Bump @vercel/analytics + @vercel/speed-insights to v2

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/vercel-analytics-v2`

## Changes

- `@vercel/analytics` 1.6.1 → 2.0.1
- `@vercel/speed-insights` 1.3.1 → 2.0.0

No source code changes. Both packages still expose the `/next` subpath with the same `Analytics` and `SpeedInsights` named exports. The single import site (`src/app/layout.tsx:5-6`) works without modification:

```tsx
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
```

## Why

Phase 2 item 3 from `tasks/todo.md` — first major-version bump after Phase 1, deliberately chosen as the lowest-risk one to build pattern muscle for the more complex bumps that follow (Clerk v7, Vite v8, TS v6).

## Verification

Confirmed v2's `/next` subpath still exposes the expected named exports by reading `node_modules/@vercel/analytics/dist/next/index.mjs` and `node_modules/@vercel/speed-insights/dist/next/index.mjs`.

- `npm run lint` → 0 errors, 41 warnings
- `npx tsc --noEmit` → clean
- `npm run test:run` → 913/913 pass
- Vercel preview deploys (when this PR opens) — the proof that runtime instrumentation works. Will confirm by checking Vercel dashboard once preview URL is live.

## Impact

- No runtime behavior change expected. v2 is a drop-in for Next.js consumers.
- Monitoring continuity: analytics events should keep flowing without interruption. If they don't, revert is a one-commit rollback to the v1 lockfile entries.
- Phase 2 item 3 of 12 complete.
