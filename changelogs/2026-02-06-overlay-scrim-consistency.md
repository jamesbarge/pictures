# Overlay Scrim Consistency

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Added a shared `.overlay-scrim` utility class in global styles for full-screen overlay backdrops.
- Updated header search overlay, mobile menu drawer backdrop, and search dialog backdrop to use the same scrim class.
- Preserved existing open/close behavior and z-index handling; this is a visual consistency pass only.

## Impact
- Makes major overlays feel more cohesive and premium across key navigation/search flows.
- Reduces repeated backdrop styling and future drift between modal/drawer scrim implementations.
- Keeps scrim treatment aligned as one shared visual primitive.
