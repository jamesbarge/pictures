# Bump TypeScript to v6 (both halves)

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/typescript-v6`

## Changes

- `typescript` 5.9.3 → 6.0.3 in **both** `package.json` and `frontend/package.json`. Single PR per the plan, keeping the two halves in lock-step so a regression is bisectable.
- New file `types/globals.d.ts` with a single line:
  ```ts
  /// <reference types="google.maps" />
  ```

## Why

Phase 2 item 9 from `tasks/todo.md`. v5 → v6 was queued as a "stricter type checks may surface latent issues" risk; in practice the codebase passed tsc + svelte-check with one fix.

## The `google.maps` fix

TS v5.9 auto-loaded `@types/google.maps` via the transitive resolution from `@vis.gl/react-google-maps` (which depends on it). TS v6 is stricter — only directly-declared `@types/*` packages are auto-included. `src/components/map/cinema-map.tsx` references the `google.maps.*` namespace ~14 times, all of which started failing with:

```
TS2503: Cannot find namespace 'google'.
TS2304: Cannot find name 'google'.
```

Tried adding `@types/google.maps` as a direct devDep — didn't help (TS v6 still wouldn't auto-load it). The clean fix is a triple-slash directive in a project-level types file:

```ts
// types/globals.d.ts
/// <reference types="google.maps" />
```

This is matched by the existing `tsconfig.json` `"include": ["**/*.ts", ...]` glob, so TS picks it up automatically. The reference is project-wide, not file-local, so any future Google Maps usage gets the same types.

## Verification

### Backend
- `npm run lint` → 0 errors, 41 warnings
- `npx tsc --noEmit` → clean
- `npm run test:run` → 913/913 pass

### Frontend
- `npm run check` (svelte-check) → 13 errors, 2 warnings (matches origin/main exactly — all pre-existing, none introduced by TS v6)
- `npm run dev` boots cleanly. Smoke tested:
  - `/` → HTTP 200
  - `/cinemas` → HTTP 200
  - `/map` → HTTP 200 (the route most likely to break given the cinema-map fix)

## Impact

- No runtime behavior change.
- Slightly stricter type checks across both halves.
- The `types/globals.d.ts` file is the canonical home for any future global type references the codebase needs.
- Phase 2 item 9 of 12 complete. **Note item 8 (eslint v10) is blocked on upstream `eslint-plugin-react` not yet supporting eslint v10 — see `tasks/todo.md`.**
