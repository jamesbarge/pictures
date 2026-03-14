# Kaizen — Unexport Dead YieldResult Type

**PR**: #TBD
**Date**: 2026-03-14

## Changes
- Removed `export` keyword from `YieldResult` interface in `src/scrapers/runner-factory.ts`
- Interface is used internally by `evaluateScraperYield()` but never imported by any other module

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
