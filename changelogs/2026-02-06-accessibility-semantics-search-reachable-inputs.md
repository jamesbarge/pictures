# Accessibility Semantics for Search and Reachable Inputs

**PR**: #77
**Date**: 2026-02-06

## Changes
- Updated both search overlays (`src/components/search/search-dialog.tsx`, `src/components/layout/header-nav.tsx`) so backdrop click targets are semantic buttons instead of non-interactive `div` elements.
- Added dialog accessibility attributes (`role="dialog"`, `aria-modal="true"`, `aria-label`) to the search containers.
- Added explicit `aria-label` values for icon-only header actions (search, filters, settings) and close controls.
- Replaced standalone label wrappers in `src/app/reachable/reachable-page-client.tsx` with `fieldset/legend` groups for location, deadline, and travel mode sections.
- Extended `PostcodeInput` with optional `ariaLabel` prop and applied it in reachable flow for explicit input naming.
- Fixed orphaned mobile date picker labels by wiring `label htmlFor` to `select id` for custom time range controls in `src/components/filters/mobile-date-picker-modal.tsx`.

## Impact
- Improves keyboard and screen-reader semantics in high-traffic discovery/search surfaces without changing product behavior.
- Reduces accessibility lint debt in user-facing flows where interaction affordance was previously implicit.
- Makes form/control relationships explicit for assistive tech in reachable and mobile date filtering paths.
