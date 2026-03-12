# Make Cinema Names Clickable on Film Detail Pages

**PR**: #238
**Date**: 2026-03-13

## Changes
- Made cinema name a clickable `<Link>` inside the `<h3>`, pointing to `/cinemas/{cinema.id}`
- Added `hover:text-accent-primary transition-colors` for visual affordance
- Added `next/link` import to `film-screenings.tsx`

## Impact
- Film detail page UX improvement: users can now navigate directly to a cinema's page from any film's screening list
- Hover styling matches the `this-weekend` page's cinema links (accent color + transition)
