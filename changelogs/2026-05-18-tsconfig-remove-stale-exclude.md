# Remove stale `scripts/check-screen-green.ts` from tsconfig exclude

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `tsconfig.json` — remove `"scripts/check-screen-green.ts"` from the `exclude` array. One-line deletion.

## Context
The `tsconfig.json` exclude array contains per-file entries for scripts whose TypeScript surface caused problems (typically OOM in CI from heavy type-defs). One such entry, `scripts/lib/booking-verifier.ts`, is documented in the file itself ("Stagehand's type definitions cause OOM in CI's tsc") and is still valid.

The other per-file entry, `scripts/check-screen-green.ts`, is stale:

```
$ ls scripts/check-screen-green.ts
ls: scripts/check-screen-green.ts: No such file or directory

$ git log --oneline -- scripts/check-screen-green.ts
(no output — file was never committed)
```

It was added defensively but never had a corresponding file. Pure dead config.

## Impact
- Functional: none. Excluding a non-existent file is a no-op for `tsc --noEmit`.
- Readability: one fewer line of unexplained config noise.
- Future-proofing: if a developer ever creates `scripts/check-screen-green.ts` they should make a deliberate choice about whether to exclude it, not inherit a vestigial bypass.

## Verification
`npx tsc --noEmit` produces identical output before and after the change.
