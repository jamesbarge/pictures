# Extend scraper sanitization to all text fields

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Extended `sanitizeScreening()` to strip HTML from `eventDescription`, `screen`, `format`, and `director`
- Previously only `filmTitle` was sanitized; other text fields passed through raw
- Optional fields are handled safely — only sanitized when present
- Added test coverage for all new sanitized fields and the undefined-field case

## Impact
- Defense-in-depth security improvement: React already escapes text on render, but stripping HTML at the data layer prevents stray tags from appearing to users and eliminates the risk of stored HTML in the database
- No functional changes to scraper behavior — all existing data without HTML tags is unaffected
