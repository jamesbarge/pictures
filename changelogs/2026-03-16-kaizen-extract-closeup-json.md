# Kaizen — Extract extractFromJson in Close-Up scraper

**PR**: #377
**Date**: 2026-03-16

## Changes
- Extracted the inline JSON show-data extraction (36 lines) from `parsePages()` into a dedicated `extractFromJson()` method
- New method mirrors `extractFromHtml()` with the same signature: `(html, now, seenKeys) => RawScreening[]`
- `parsePages` now reads as a symmetric pipeline: "for each page: try JSON (homepage only), then try HTML"

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Reduces max nesting depth from 7 to 4 in `parsePages`
