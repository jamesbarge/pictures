# Add unit tests for src/scrapers/utils/url.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/utils/url.test.ts` (new) — 17 vitest cases covering both `normalizeUrl` and `slugify`.

## Coverage
### `normalizeUrl(url, baseUrl)`
- Absolute `http://` URL — returned unchanged
- Absolute `https://` URL — returned unchanged
- Root-relative path (`/films/123`) — prepended with `baseUrl`
- Bare path (`films/123`) — prepended with `baseUrl` + `/`
- Trailing-slash preservation in root-relative paths
- **Pinned contract**: `httpd-cache/x` is treated as absolute because the implementation uses `startsWith("http")` — any string starting with literal `http` matches, not just `http://` / `https://`
- **Pinned contract**: `baseUrl` ending in `/` + root-relative path produces a double-slash (`https://base.com//films`); no smart joining

### `slugify(title)`
- Lowercase pass (`Saint Maud` → `saint-maud`)
- Space-to-hyphen substitution (`the godfather part ii` → `the-godfather-part-ii`)
- Character stripping (`Amélie / Le Fabuleux Destin` → `amlie-le-fabuleux-destin`) — note both `é` (stripped because JS `\w` is ASCII-only) and `/` are removed, then `\s+` collapse produces single hyphens
- Existing hyphens preserved (`snow-white` → `snow-white`)
- Underscores preserved as part of `\w` (`dr_strangelove` → `dr_strangelove`)
- Multi-space collapse (`a  b   c` → `a-b-c`)
- 50-char truncation
- Empty input → empty string
- All-stripped input (`!?@#$%`) → empty string
- All-whitespace input (`   `) → single hyphen

## Context
The module had no test file despite both functions being used across many scrapers:

- `normalizeUrl` — called in scrapers that turn relative `href` attributes into absolute booking-link URLs
- `slugify` — called in scrapers that generate stable `sourceId` strings from film titles. A regression silently corrupts the identifier used for de-duplication in the screenings table.

A regression in either function silently degrades scraper output. Tests pin the current contract so future refactors (e.g. switching to the WHATWG `URL` constructor for normalizeUrl, or adopting a Unicode-aware slug library for slugify) can be verified safe.

## Impact
- Functional: none. Pure test addition; no source-file changes.
- Coverage: lifts a 33-line untested utility module to 100% line coverage.
- Future-proofing: documents 2 surprising behaviours (the `startsWith("http")` over-match and the ASCII-only `\w`) that are easy to "fix" by accident and would break existing scrapers.

## Verification
`npx vitest run src/scrapers/utils/url.test.ts` — 17 passed, 0 failed, 583ms.

## Side discovery
One test assertion was wrong on first attempt — I expected `slugify` to keep double hyphens where the strip pass produced two consecutive spaces. The test failure revealed that the trailing `\s+` collapse normalises whitespace to single hyphens, which is better behaviour. Comment in the test now explains the full pipeline so future readers don't make the same mistake.
