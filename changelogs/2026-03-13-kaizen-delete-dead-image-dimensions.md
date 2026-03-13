# Kaizen — Delete Dead Image Dimension Functions

**PR**: #286
**Date**: 2026-03-13

## Changes
- Deleted `getImageDimensions` (exported, zero consumers) and `extractDimensions` (internal helper for PNG/JPEG/GIF/WebP dimension parsing)
- Updated module JSDoc to reflect reduced scope — only `isImageAccessible` remains

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- ~116 lines of dead code removed; image-processor.ts now 24 lines
