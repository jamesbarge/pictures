# Admin Anomaly List Hydration-Safe Dismiss Filtering

**PR**: TBD
**Date**: 2026-02-06

## Changes
- Replaced effect-initialized anomaly filtering in:
  - `src/app/admin/anomalies/components/anomaly-list.tsx`
- Added hydration-aware derived filtering:
  - show all anomalies until hydration completes
  - apply localStorage dismissal checks only after hydration
- Added local dismissed cinema tracking state so dismiss actions update the list immediately without re-running initialization.

## Impact
- Eliminates `setState`-in-effect in the admin anomaly list.
- Avoids server/client render mismatch risks around localStorage-dependent dismissal filtering.
- Preserves current anomaly list behavior while making dismiss filtering deterministic.
