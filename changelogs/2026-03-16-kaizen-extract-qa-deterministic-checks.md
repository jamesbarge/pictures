# Kaizen — Extract B1/B2 Deterministic Check Helpers

**PR**: #368
**Date**: 2026-03-16

## Changes
- Extracted `detectStaleScreenings()` and `detectMissingLetterboxd()` from the 330-line `qaAnalyzeAndFix.run()` function
- Both are pure data transformation functions (filter → map → ClassifiedIssue[])
- Follows the same pattern as the existing `classifyBookingChecks()` helper in the same file

## Impact
- Code quality improvement, no behavior changes
- run() function reduced by ~30 lines, each check is now independently readable
- Kaizen category: readability
