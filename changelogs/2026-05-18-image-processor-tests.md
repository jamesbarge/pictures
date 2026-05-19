# Add unit tests for src/lib/image-processor.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/image-processor.test.ts` (new) — 8 vitest cases mocking `globalThis.fetch`.

## Coverage
- 200 + `image/jpeg` → true
- 200 + `image/png` → true
- 200 + `text/html` → false (the common 404-as-HTML-200 case)
- 4xx + image content-type → false
- 5xx + image content-type → false
- Network error (fetch throws) → false
- Missing content-type header → false (the `|| ""` + `.startsWith("image/")` chain)
- HEAD method + Mozilla-prefixed User-Agent

## Why
`isImageAccessible` is the gating check for poster URLs across the enrichment pipeline. Two non-obvious behaviours are now pinned:

1. **`response.ok` alone is not enough** — the function ALSO requires `content-type` to start with `image/`. This catches the "page returns 200 with HTML error page instead of the poster" case that's common with TMDB-mediated poster URLs hitting expired CDN paths.
2. **Missing content-type → false** — the `headers.get(...) || ""` coalescing prevents `undefined.startsWith` crashes but also means a legitimately-image response without the header is rejected.

## Impact
- Functional: none. Pure test addition.
- Coverage: 24-line untested HTTP probe → 100% line coverage.

## Verification
`npx vitest run src/lib/image-processor.test.ts` — 8 passed, 0 failed.

## Side note
First version of the User-Agent test asserted `Mozilla.*Chrome` — turns out the `CHROME_USER_AGENT` constant doesn't contain the literal word "Chrome" (it ends at `AppleWebKit/537.36`). Switched to a simpler `^Mozilla\/5\.0` check.

## Changelog deferral note
Per #523-#530, omits the `RECENT_CHANGES.md` top-of-file entry.
