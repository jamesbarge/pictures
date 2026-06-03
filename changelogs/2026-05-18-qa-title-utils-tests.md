# Add unit tests for src/lib/qa/utils/title-utils.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/qa/utils/title-utils.test.ts` (new) — 21 vitest cases for `normalizeTitle` + `parseRelativeDatetime`.

## Coverage of normalizeTitle (11 cases)
- Lowercase, trim, leading-The strip, trailing-paren strip, colon strip, smart-quote normalisation, en/em dash → ASCII hyphen, punctuation strip, space collapse
- **Pinned surprising contracts**:
  - Smart double-quote → ASCII `"` → THEN stripped by `[^\w\s'-]` pass (2-step sequence)
  - Year-strip and colon-strip are NOT chained: `"The Lord of the Rings (2001): Fellowship!"` produces `"lord of the rings 2001"` (NOT `"lord of the rings"`) because colon-strip runs AFTER year-strip fails to anchor

## Coverage of parseRelativeDatetime (10 cases)
- "Today HH:MM" / "Tomorrow HH:MM" with proper date arithmetic
- "Sat 17 May 21:45" — named-day variant
- **Pinned year-roll**: only when target month < ref.getMonth() - 1
- Null returns: no time component, unrecognised prefix, unknown month, empty string

## Why
`normalizeTitle` is the QA comparison key for the pictures.london title-vs-database fuzzy match. A regression silently produces false-positives or false-negatives in the QA dashboard. The two pinned surprising contracts (smart-quote 2-step + year-strip-then-colon non-chain) are exactly the kind of behaviour a casual "let me make the chain more robust" PR could break.

## Changelog deferral note
Per #523-#530.
