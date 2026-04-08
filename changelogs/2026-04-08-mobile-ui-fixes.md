# Comprehensive Mobile UI Fixes

**PR**: #409
**Date**: 2026-04-08

## Changes

### Critical Fixes
- Fix CinemaPicker dropdown using `calc(100vw - 2rem)` which caused horizontal overflow on mobile (includes scrollbar width). Changed to `width: 100%; max-width: 280px`
- Fix DateTimePicker dropdown missing `max-width: 100%` guard
- Fix cinemas page search input hardcoded at `width: 200px` — now responsive with mobile stacking
- Fix Dropdown.svelte missing `max-height` and `overflow-y: auto` on mobile — dropdowns could extend beyond viewport with no scroll

### High Priority Fixes
- Add hamburger menu button and slide-down nav panel for mobile (nav links were hidden via `display: none` at <768px with no replacement)
- Increase cinema card touch targets to min 48px height with more padding on mobile
- Increase screening pill touch targets from ~19px to 28px desktop / 32px mobile
- Increase reachable page calculate button padding and font size on mobile

### Medium/Low Fixes
- Add responsive typography scaling (reduce 3xl-7xl font sizes at 767px breakpoint)
- Increase MobilePanel max-height from 80vh to 85dvh
- Add TableView intermediate breakpoint at 480px (hides YEAR column on very small screens)
- Increase skip link padding and font size for better accessibility
- Add header flex-wrap and auto-height at <320px
- Add single-column film grid at <320px

### Testing
- New mobile audit script (`scripts/audit/mobile-audit.ts`) testing 13 routes at 3 viewports
- 12 new Playwright regression tests for hamburger menu, touch targets, dropdown containment, and 360px overflow
- Added Galaxy S5 (360px) as a test project in playwright.config.ts

## Impact
- All mobile users get a working hamburger navigation menu
- No more horizontal overflow from dropdowns
- Touch targets meet WCAG 2.5.8 minimum (24px) across all interactive elements
- Very small screens (<320px) get single-column layout instead of cramped 2-column grid
