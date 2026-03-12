# Kaizen — Group imports in components and trigger files

**PR**: #161
**Date**: 2026-03-12

## Changes
- `src/trigger/verification.ts`: Moved `drizzle-orm` import from between internal `@/db/*` imports to the top external group
- `src/components/calendar/screening-card.tsx`: Grouped 4 scattered external imports (date-fns, next/link, posthog-js/react, react) at top, separated from 7 internal `@/` imports and 1 relative import
- `src/components/calendar/film-card.tsx`: Same pattern — grouped 4 externals at top, 7 internals in middle, 1 relative at bottom

## Impact
- Code quality improvement, no behavior changes
- Consistent 3-tier import grouping: external → internal @/ → relative ./
- Kaizen category: import-organization
