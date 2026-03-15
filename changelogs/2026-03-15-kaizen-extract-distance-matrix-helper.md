# Kaizen — Extract parseDistanceMatrixElements helper

**PR**: #TBD
**Date**: 2026-03-15

## Changes
- Extracted duplicate Distance Matrix API element-parsing loop into a shared `parseDistanceMatrixElements()` helper function
- Primary results parsing and transit-walking fallback now both call the same helper
- Replaced imperative `failedIndices` accumulation with declarative `.map().filter()` pattern

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Net line change: 0 (29 added, 29 removed)
