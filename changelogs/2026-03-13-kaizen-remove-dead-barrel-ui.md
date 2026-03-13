# Kaizen — Remove Dead Barrel Re-exports from ui/index.ts

**PR**: #274
**Date**: 2026-03-13

## Changes
- Removed 11 component re-exports and 8 type re-exports that no consumer imports via the barrel
- All consumers import directly from sub-modules, not the barrel

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
