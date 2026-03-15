# Kaizen — Extract Ambiguity Check and Match Strategy Helpers

**PR**: #370
**Date**: 2026-03-16

## Changes
- Extracted `shouldSkipAmbiguousMatch()` — ambiguity analysis, confidence threshold check, and needs-review DB marking
- Extracted `resolveMatchStrategy()` — pure function mapping metadata availability to match strategy string
- Reduces nesting in the 322-line `enrichUnmatchedFilms` function by moving 35 lines of auto-apply logic into standalone helpers

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
