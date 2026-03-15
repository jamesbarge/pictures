# Kaizen — Dedup screening creation in Cine Lumiere scraper

**PR**: #357
**Date**: 2026-03-15

## Changes
- Extracted `addScreeningIfValid()` helper method to encapsulate: time parsing, date+time combination, booking URL construction, source ID generation, festival detection, and screening push
- Replaced 3 identical ~20-line blocks in `parseFilmPerformances`, `parseFilmPerformancesFromSiblings`, and `parseAlternativeStructure` with single-line calls to the shared helper

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
