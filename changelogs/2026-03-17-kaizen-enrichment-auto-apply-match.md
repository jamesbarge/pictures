# Kaizen — Extract autoApplyMatch in Enrichment Agent

**PR**: #393
**Date**: 2026-03-17

## Changes
- Extracted `autoApplyMatch()` helper from the `enrichUnmatchedFilms()` main loop
- Consolidates ambiguity check, duplicate detection/merging, and direct DB update into one function
- Returns "skip" | "applied" | "not-applied" to control outer loop flow cleanly

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Reduces nesting depth from 5+ to 3 in the match-application path
