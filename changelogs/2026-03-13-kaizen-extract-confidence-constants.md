# Kaizen — Extract confidence constants in pattern-extractor

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Extracted 7 magic confidence numbers (1.0, 0.95, 0.9, 0.85, 0.7, 0.3) into named constants
- Constants: FULL_CONFIDENCE, PRESENTS_CONFIDENCE, SINGALONG_CONFIDENCE, PREFIX_MAX_CONFIDENCE, SUFFIX_MAX_CONFIDENCE, DOUBLE_FEATURE_MAX_CONFIDENCE, FESTIVAL_COMPILATION_CONFIDENCE
- Each constant has a JSDoc comment explaining its semantic meaning

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: extract-constant
