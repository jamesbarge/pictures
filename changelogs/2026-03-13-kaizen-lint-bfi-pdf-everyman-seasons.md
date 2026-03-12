# Kaizen — Fix lint warnings in BFI PDF parsers, Everyman, and seasons

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `PDF_BASE_URL` constant from `bfi-pdf/fetcher.ts`
- Remove unused `film` parameter from `isDescriptionLine()` function and its call site in `pdf-parser.ts`
- Remove unused `day` and `flags` destructured variables from regex match in `programme-changes-parser.ts`
- Remove unused `date` key from `Object.entries()` loop in `everyman.ts`
- Remove unused `cheerio` import from `seasons/close-up.ts`

## Impact
- Code quality improvement, no behavior changes
- 7 ESLint warnings resolved across 5 files
- Kaizen category: lint-fix
