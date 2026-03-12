# Kaizen — Extract Ambiguity Scoring Constants

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Extracted 15 magic numbers from `analyzeTitleAmbiguity()` and `hasSufficientMetadata()` into named constants
- Score weights: SINGLE_WORD_SCORE, TWO_WORD_SCORE, VERY_SHORT_TITLE_SCORE, SHORT_TITLE_SCORE, etc.
- Thresholds: VERY_SHORT_CHAR_LIMIT, SHORT_CHAR_LIMIT, REVIEW_THRESHOLD, HIGH_AMBIGUITY_THRESHOLD

## Impact
- Code quality improvement, no behavior changes
- Follows same pattern as match.ts constants (PR #240)
- Kaizen category: extract-constant
