# Kaizen — Lint-fix BFI PDF Scrapers, Everyman, Pipeline

**PR**: #243
**Date**: 2026-03-13

## Changes
- `src/scrapers/bfi-pdf/fetcher.ts` — removed unused `PDF_BASE_URL` constant
- `src/scrapers/bfi-pdf/pdf-parser.ts` — removed unused `film` parameter from `isDescriptionLine()`
- `src/scrapers/bfi-pdf/programme-changes-parser.ts` — removed unused `day` and `flags` from regex destructuring
- `src/scrapers/chains/everyman.ts` — removed unused `date` from loop destructuring
- `src/scrapers/seasons/pipeline.ts` — converted `catch (error)` to bare `catch` (error was unused)

## Impact
- Code quality improvement, no behavior changes
- Lint warnings reduced from 77 to 71
- Kaizen category: lint-fix
