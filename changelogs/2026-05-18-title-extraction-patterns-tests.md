# Add unit tests for src/lib/title-extraction/patterns.ts (regex patterns + escapeRegex)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/title-extraction/patterns.test.ts` (new) — 27 vitest cases covering 4 regex patterns + the `escapeRegex` helper.

## Coverage
### Pattern matchers
- **`PRESENTS_PATTERN`** (6) — matches `X presents "Y"` and `X present "Y"`, smart-quote U+201C, case-insensitivity, plus negative cases (no `presents` keyword, no surrounding quotes)
- **`SINGALONG_PATTERN`** (5) — matches the 3 variants (`Sing-A-Long-A`, `Sing-A-Long`, `SingALongA`), case-insensitivity, negative case
- **`DOUBLE_FEATURE_PATTERN`** (4) — captures first film, **non-greedy** behaviour on triple features (`A + B + C` → `A`), missing whitespace tolerance, negative case
- **`FRANCHISE_PATTERN`** (7) — Star Wars, Harry, Lord, Indiana, Spider — and the **start-anchored** constraint (`The Star Wars Story` does NOT match)

### `escapeRegex(str)` (5)
- Each regex metacharacter from the implementation's character class (`.*+?^${}()|[]\\`)
- Plain alphanumeric unchanged
- Empty string
- **Pinned contract**: hyphens and forward slashes are NOT escaped (not in the metacharacter class)
- Round-trip property: escaped output can be embedded in `new RegExp()` and matches the original input literally

## Why
The 4 patterns are used by `extractFilmTitleSync` (the synchronous title extractor) to identify event-wrapped films, sing-along screenings, double features, and franchise titles. A regression silently changes which films get extracted vs left as-is, with downstream effects on TMDB matching.

`escapeRegex` is a security-relevant helper: it ensures user-supplied title fragments can be safely embedded in dynamic regexes without ReDoS or syntax errors. The round-trip test pins this guarantee.

## Pinned surprising contracts
1. `DOUBLE_FEATURE_PATTERN` is **non-greedy** — `A + B + C` returns `A`, not `A + B`.
2. `FRANCHISE_PATTERN` is **start-anchored** — titles where the franchise word appears mid-string don't match.
3. `escapeRegex` does NOT escape `-` or `/` (not in the metacharacter class).
4. `PRESENTS_PATTERN` requires both the `presents`/`present` keyword AND surrounding curly-or-straight quotes.

## Impact
- Functional: none. Pure test addition.
- Coverage: lifts a 238-line patterns module to test coverage on every exported regex pattern + the escape helper.
- Future-proofing: pins 4 non-obvious behaviours that callers implicitly rely on.

## Verification
`npx vitest run src/lib/title-extraction/patterns.test.ts` — 27 passed, 0 failed, 728ms.

## Changelog deferral note
Per the pattern in #523-#528, this PR omits the `RECENT_CHANGES.md` top-of-file entry to avoid rebase cascade. Batch catchup PR planned for session end.
