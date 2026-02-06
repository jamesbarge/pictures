# Admin Modal Scrim Consistency

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Updated admin cinema configuration modal backdrop from `bg-black/50` to `bg-black/60 backdrop-blur-sm`.
- Updated admin screening form modal backdrop to the same scrim treatment.
- Kept all modal logic and close behavior unchanged; this is a visual consistency pass only.

## Impact
- Improves consistency across admin overlays and dialogs.
- Increases perceived visual hierarchy between modal surfaces and background content.
- Reduces style drift by applying one clear scrim treatment in core admin dialogs.
