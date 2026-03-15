# Kaizen — Extract director and accessibility helpers from Curzon scraper

**PR**: #351
**Date**: 2026-03-15

## Changes
- Extracted `extractDirector()` — resolves director name from cross-referenced Vista cast data
- Extracted `classifyAccessibilityFeatures()` — maps Vista attribute IDs to human-readable labels (Subtitled, Audio Described, Baby Friendly, Q&A)
- Both functions extracted from `convertToRawScreenings`, reducing max nesting from 4 levels to 1 function call each

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
