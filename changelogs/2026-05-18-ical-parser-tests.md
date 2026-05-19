# Add unit tests for src/scrapers/utils/ical-parser.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/scrapers/utils/ical-parser.test.ts` (new) — 13 vitest cases for `parseVEvents`.

## Why
Generic iCal parser used by the Cinema Museum scraper (and prepped for future iCal-based London venues — see RECENT_CHANGES.md PR #510). The cinema-museum scraper already has integration tests against a fixture iCal, but the parser primitive had no dedicated unit coverage at the module boundary.

## Coverage
- Minimal valid VEVENT → all required fields parsed
- URL + CATEGORIES capture with comma-split + whitespace-trim
- TEXT-escape unescaping (`\,`, `\;`, `\\`, `\n` → space per impl)
- RFC 5545 line folding (continuation lines starting with space joined directly)
- Empty feed / no-VEVENT input → empty array
- VEVENT missing required fields (UID/SUMMARY/DTSTART) → dropped
- DTSTART with TZID param (ignored value — implementation assumes Europe/London)
- DTSTART regex mismatch → event silently dropped
- **Pinned 0-indexed month** in output (January = 0, matching Date constructor convention)
- Multiple VEVENTs in one feed
- Unknown properties (X-FOO etc.) silently skipped
- Properties outside BEGIN/END VEVENT window ignored

## Pinned surprising contracts
1. `\n` in TEXT escapes → " " (single space) per implementation, NOT a literal newline.
2. DTSTART TZID param value is **not validated** — implementation assumes Europe/London and any other TZ produces a wrong UTC.
3. Missing seconds (`20260516T1930`) → event dropped (regex strictly requires HHmmss).

## Verification
`npx vitest run src/scrapers/utils/ical-parser.test.ts` — 13 passed, 0 failed, 798ms.

## Changelog deferral note
Per #523-#530.
