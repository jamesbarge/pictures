# Add unit tests for src/lib/title-patterns.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/title-patterns.test.ts` (new) — 38 vitest cases covering `isLikelyCleanTitle`, `cleanBasicCruft`, and `decodeHtmlEntities`.

## Coverage
### `isLikelyCleanTitle(title)` — 16 cases
- Plain titles pass
- Each major `EVENT_PREFIX_PATTERNS` family triggers: Saturday Morning Club, UK Premiere, 35mm/4K format, Kids/Family club, etc.
- Suffix indicators trigger: `+ Q&A`, `with Shadow Cast`, `+ Discussion`
- Short prefix before colon (`<= 2 words`) is flagged as suspicious
- Known franchise prefixes (`Star Wars`, `Harry Potter`, `Lord of the Rings`) PASS the colon check
- > 2 words before colon passes (assumed real subtitle)
- Case-insensitivity

### `cleanBasicCruft(title)` — 15 cases
- Whitespace trimming and collapsing
- Q&A suffix variants (`+ Q&A`, `+ Q&amp;A`, `with Q&A`)
- Intro/Discussion/Panel suffixes
- 4K Restoration / Director's Cut tags
- BBFC rating in parentheses (U/PG/12/15/18)
- Format suffix with leading dash (`- 35mm`, `- IMAX`)
- Bracketed notes ([SOLD OUT])
- Anniversary, Encore, Pajama Party, TBC suffixes
- Idempotence on already-clean titles

### `decodeHtmlEntities(title)` — 7 cases
- Five explicit entities (`&amp;`, `&quot;`, `&#39;`, `&lt;`, `&gt;`) decoded
- Multiple entities in one string
- Non-encoded text unchanged
- **Pinned contract**: only those 5 entities decoded — `&nbsp;` and named entities like `&eacute;` are NOT decoded. Callers needing full HTML entity decoding must use a real decoder.

## Why
`title-patterns.ts` is the **canonical regex layer** for film title cleanup, used by both AI-powered and regex-based extractors throughout the enrichment pipeline. Each of its three functions has many code paths driven by the constant arrays in the same file — a single broken regex silently corrupts thousands of cleaned titles, with downstream effects on TMDB matching and dedup.

The `decodeHtmlEntities` "only 5 entities" contract is particularly important to pin — it's the kind of thing a future maintainer might "improve" by switching to a generic decoder, which would change behaviour for titles containing entities the current function leaves alone.

## Impact
- Functional: none. Pure test addition.
- Coverage: lifts a 298-line untested utility (3 exported functions + 5 exported constants) to comprehensive line coverage of the function layer.
- Future-proofing: pins the franchise-allowlist behaviour, the `<= 2 words before colon` heuristic, and the explicit (not generic) HTML entity decoder.

## Verification
`npx vitest run src/lib/title-patterns.test.ts` — 38 passed, 0 failed, 688ms.

## Changelog deferral note
Per the workflow pattern from #523-#527, this PR omits the `RECENT_CHANGES.md` top-of-file entry to avoid rebase cascade. Batch catchup PR planned for session end.
