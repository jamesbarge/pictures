# Add unit tests for src/lib/posters/placeholder.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/posters/placeholder.test.ts` (new) — 14 vitest cases for `generatePosterPlaceholder`, `getPosterPlaceholderDataUrl`, `getPosterPlaceholderUrl`.

## Coverage
- generatePosterPlaceholder: valid SVG, title embedded, year embedded when present, year omitted when null, XML-special-char escaping (`&` → `&amp;`), determinism (cacheable), distinct outputs for distinct titles
- getPosterPlaceholderDataUrl: base64 mime type, decode roundtrip preserves SVG + title + year
- getPosterPlaceholderUrl: canonical `/api/poster-placeholder?title=…` format, URLSearchParams encoding (e.g. `Salt & Pepper` → `Salt+%26+Pepper`), year omitted when null/undefined

## Why
Placeholder posters are shown for every film without a real poster — a regression that produces invalid SVG silently breaks card rendering across the entire app. The determinism contract is important too: it's why we can cache the `/api/poster-placeholder` route for a year.

The XML-escape test catches an easy-to-introduce regression: if the title insertion drops the `&amp;` escape, films like "Salt & Pepper" produce malformed SVGs that browsers either reject or render as `&`.

## Changelog deferral note
Per #523-#530.
