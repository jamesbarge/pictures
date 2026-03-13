# Kaizen — Delete Dead Code in Image Processor

**PR**: #280
**Date**: 2026-03-13

## Changes
- Deleted `calculatePosterCrop()` — crop calculation function with zero callers
- Deleted `generateProcessedImageUrl()` — Next.js image URL generator with zero callers
- Deleted `ImageProcessorOptions` interface — only used by removed function
- Deleted `POSTER_ASPECT_RATIO` constant — only used by removed function
- Inlined `POSTER_HEIGHT = 750` (previously derived from removed constant)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
