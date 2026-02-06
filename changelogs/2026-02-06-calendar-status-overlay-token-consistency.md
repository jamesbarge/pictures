# Calendar Status Overlay Token Consistency

**PR**: #87
**Date**: 2026-02-06

## Changes
- Updated calendar status overlay controls (`want_to_see`, `not_interested`) to use semantic token classes.
- Replaced hardcoded `text-white`/`neutral-*` usages with tokenized equivalents (`text-text-inverse`, `status-not-interested`, accent tokens).
- Kept overlay button behavior and interactions unchanged; only visual token alignment was modified.

## Impact
- Improves consistency of card-level status states across the primary calendar browsing experience.
- Reduces hardcoded color drift in repeated status overlays.
- Keeps these controls aligned with theme token updates and shared status semantics.
