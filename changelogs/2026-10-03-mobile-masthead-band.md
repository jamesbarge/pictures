# Mobile masthead: remove the empty band under the wordmark

**PR**: #TBD
**Date**: 2026-10-03

## Changes
- Below 768px, `.brand-bar` in `frontend/src/lib/components/layout/Header.svelte` drops its 180px minimum height.
- That minimum seats the desktop nav column and the house-lights dial beside the logo. Both are hidden on phones, so there it only left a 40px empty band under the 140px wordmark.
- The wordmark keeps its size and desktop is unchanged. The 320px rule still sets its own 40px minimum.

## Impact
- The masthead goes from 205px to 165px on phones and small tablets (measured at 390px and 767px wide), on every page, so content starts 40px higher.
- With the homepage STARTING SOON strip (#762), the first strip time moves from 476px to 436px down an 844px screen.
- Split out of #762 so it can be reviewed and reverted on its own.
