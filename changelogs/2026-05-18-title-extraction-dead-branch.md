# Remove dead if/else branch in batchExtractTitles

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/title-extraction/index.ts` — collapse a redundant `if (isLikelyCleanTitle(title)) { … } else { … }` where both branches did **the exact same thing**. Also removes the now-unused `isLikelyCleanTitle` import.

## Before
```ts
for (const title of uniqueTitles) {
  if (isLikelyCleanTitle(title)) {
    results.set(title, await extractFilmTitle(title));
  } else {
    results.set(title, await extractFilmTitle(title));
  }
}
```

## After
```ts
for (const title of uniqueTitles) {
  results.set(title, await extractFilmTitle(title));
}
```

## Context
The comment above the function explains the history: "previous implementation sequenced 'ambiguous' titles through an LLM with rate limiting; that's gone now, so this is just a deduped fan-out." The if/else stayed behind as fossilised scaffolding after the LLM-extraction path was removed. Both branches resolved to identical code; the `isLikelyCleanTitle` import was no longer load-bearing.

## Impact
- Functional: none. Both branches were identical before; the simplification preserves behaviour exactly.
- Readability: one fewer fake decision point for maintainers to evaluate.
- Lint: removes an unused import (would otherwise have surfaced on the next `noUnusedLocals` audit).

## Verification
- `npx vitest run src/lib/title-extraction` — 108/108 passed in 742ms.
- The pre-existing tsc errors in `.next/types/**` are unrelated (stale Next.js build artefacts referencing deleted `.js` route files; not caused by this change).

## Changelog deferral note
Per the pattern in #523-#530, this PR omits the `RECENT_CHANGES.md` top-of-file entry. Will be batched in the next periodic catch-up.
