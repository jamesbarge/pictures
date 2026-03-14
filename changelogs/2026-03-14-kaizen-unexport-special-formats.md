# Kaizen — Unexport Dead SPECIAL_FORMATS Constant

**PR**: #TBD
**Date**: 2026-03-14

## Changes
- Removed `export` keyword from `SPECIAL_FORMATS` constant in `src/lib/constants.ts`
- Constant is used internally by `getSpecialFormat()` but never imported by any other module

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
