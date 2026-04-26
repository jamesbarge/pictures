# Bump tailwind-merge to v3 (frontend)

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/tailwind-merge-v3`

## Changes

- `tailwind-merge` 2.6.1 → 3.5.0 in `frontend/package.json`
- No source code changes

## Why

Phase 2 item 5 from `tasks/todo.md`. Frontend-only change — backend doesn't use this package.

## Audit

Single usage in the entire frontend, at `frontend/src/lib/utils.ts:5`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

This is the canonical `cn()` helper pattern. v3's breaking changes are around custom-config shapes (extending the class-group merge map), which we don't use — vanilla `twMerge(string)` is unchanged across v2 and v3.

## Verification

- `npm run check` (svelte-check) → 13 errors, 2 warnings (matches origin/main exactly — all pre-existing, none related to tailwind-merge)
- `npm run dev` boots cleanly. Smoke tested 3 routes:
  - `/` → HTTP 200
  - `/cinemas` → HTTP 200
  - `/map` → HTTP 200

## Impact

- No runtime behavior change. The `cn()` helper produces the same merged class string.
- No bundle-size regression expected.
- Phase 2 item 5 of 12 complete.
