# Kaizen — Consolidate UA Strings in Image Processor

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Replaced 2 hardcoded User-Agent strings in `src/lib/image-processor.ts` with `CHROME_USER_AGENT` from `@/scrapers/constants`
- Both fetch calls for image downloading now use the shared constant

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: extract-constant
