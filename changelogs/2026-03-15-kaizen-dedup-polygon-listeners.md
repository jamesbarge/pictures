# Kaizen — Dedup polygon edit listeners in cinema map

**PR**: #354
**Date**: 2026-03-15

## Changes
- Extracted `attachPolygonEditListeners()` from two identical blocks in DrawingManager
- First block: restoring an existing polygon from saved area state
- Second block: after user finishes drawing a new polygon via overlaycomplete
- Both registered the same three Google Maps events (`set_at`, `insert_at`, `dragend`)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
