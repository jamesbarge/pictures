# Admin Modal and Filter Form Label Accessibility

**PR**: #94
**Date**: 2026-02-06

## Changes
- Replaced admin modal backdrop `<div>` elements with semantic close `button` elements and explicit labels in:
  - `src/app/admin/cinemas/components/cinema-config-modal.tsx`
  - `src/app/admin/screenings/components/screening-form-modal.tsx`
- Added explicit `id`/`htmlFor` associations for form controls in both admin modals, including film search, cinema selector, datetime, booking URL, format, screen, event type, and event description fields.
- Converted non-control section headings that were incorrectly implemented as `<label>` elements into semantic text headings.
- Replaced non-control filter labels on `src/app/admin/screenings/page.tsx` with semantic heading text.

## Impact
- Removes high-frequency accessibility lint issues in core admin create/edit workflows.
- Improves keyboard and screen reader clarity without changing any admin data or submission logic.
- Aligns admin form semantics with consistent, standards-compliant labeling patterns.
