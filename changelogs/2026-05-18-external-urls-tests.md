# Add unit tests for src/lib/external-urls.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/external-urls.test.ts` (new) — 18 vitest cases covering `getTmdbUrl`, `getImdbUrl`, and the non-trivial `generateLetterboxdUrl`.

## Coverage
### `getTmdbUrl(tmdbId)` and `getImdbUrl(imdbId)`
- Canonical URL generation
- **Pinned contracts** (no validation, no normalisation): zero/negative ids accepted, trailing slash in id input is duplicated, non-`tt`-prefixed IMDb id accepted

### `generateLetterboxdUrl(title)`
The interesting one — a 7-step regex chain:

1. Lowercase
2. Strip apostrophes (matches 5 variants: `'`, `'`, `‘`, `´`, `` ` ``)
3. Replace `:`/`-`/`–`/`—` with space
4. `&` → `and`
5. Strip everything that isn't `[a-z0-9\s]`
6. Trim
7. Collapse `\s+` to single `-`

Test cases cover each transform individually plus combinations:

- Simple title (`Fight Club` → `fight-club`)
- ASCII apostrophe (`Ocean's Eleven` → `oceans-eleven`)
- All 5 apostrophe variants (`’`, `‘`, `´`, `` ` ``, `'`)
- Colon (`Blade Runner: 2049` → `blade-runner-2049`)
- Hyphen + en/em dash (`Spider-Man`, `Spider–Man`, `Spider—Man` → `spider-man`)
- Ampersand (`Bonnie & Clyde` → `bonnie-and-clyde`)
- Accented chars stripped (`Amélie` → `amlie`) — pins the ASCII-only contract
- Parens and `?` stripped (`Who Framed Roger Rabbit?`, `Mad Max (2015)`)
- Consecutive whitespace collapsed
- Leading/trailing whitespace trimmed
- Empty title produces a slug-less URL (caller responsibility to validate)

## Why
`generateLetterboxdUrl` is used to construct external links to Letterboxd for every film card displayed in the app. A regression in any transform (especially the apostrophe strip — there are 5 unicode variants) silently breaks links for thousands of films. A reader changing the regex chain without these tests is one stray edit away from producing `oceans-eleven` vs `ocean-s-eleven` (which Letterboxd would 404 on).

## Impact
- Functional: none. Pure test addition.
- Coverage: lifts a 35-line untested URL-helper module to 100% line coverage.
- Future-proofing: pins each transform's behaviour, including the implicit "ASCII-only" contract (accented chars stripped) that callers may have grown to rely on.

## Verification
`npx vitest run src/lib/external-urls.test.ts` — 18 passed, 0 failed, 780ms.

## Changelog deferral note
Per the workflow pattern adopted in PR #523 (admin-emails tests), this PR also omits the `RECENT_CHANGES.md` top-of-file entry to avoid the rebase-conflict cascade caused by multiple in-flight PRs each editing line 1. The dedicated `changelogs/2026-05-18-*.md` archive is created. A follow-up batch PR will catch up `RECENT_CHANGES.md` for this and other session PRs.
