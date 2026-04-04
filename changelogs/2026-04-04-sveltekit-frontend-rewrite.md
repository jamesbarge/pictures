# SvelteKit Frontend Rewrite

**PR**: #405
**Date**: 2026-04-04

## Changes

### Core Frontend
- Complete SvelteKit 5 + Svelte 5 runes + Tailwind CSS 4 frontend
- Swiss International Typographic Style — zero border-radius, high contrast, Inter + Space Grotesk + JetBrains Mono
- 15+ routes with real-time API data via Vite proxy (dev) / Vercel rewrites (prod)
- @chenglou/pretext for BreathingGrid brand wordmark and FittedTitleCanvas hover effect

### Pages
- Home: Calendar grid with film cards, screening pills, full filter system
- Film detail: Poster, metadata, synopsis, screenings with iCal export + Letterboxd ratings
- Cinemas: 57 venues grouped by chain with feature badges + search
- Cinema detail: Venue info with screenings
- Festivals: List + detail with follow button (auth-gated)
- Directors: Aggregated from screenings with search
- Tonight / This Weekend: London timezone-aware date filtering
- Watchlist: localStorage-backed with server sync when signed in
- Search: Full results page + Enter-to-search from autocomplete
- Letterboxd Import: Username-based import via POST /api/letterboxd/preview
- Reachable: "What can I catch?" with postcode input, deadline picker, travel mode, urgency groups
- Map: MapLibre GL with CARTO Positron tiles, 47 cinema markers with popups
- Settings, About, Privacy, Terms

### Integrations
- PostHog analytics: init, pageview tracking, film view events, search tracking
- Clerk auth: conditional ClerkProvider, SignIn/SignUp pages, graceful degradation
- User data sync: pull on sign-in, push on status change, debounced preferences

### SEO
- JSON-LD schemas: Organization, WebSite, FAQ, Movie, Breadcrumb
- Full OG tags + Twitter Card meta on all pages
- Film-specific meta tags with poster images

### Mobile
- Responsive layout with search bar on top, FILTERS toggle button
- Full-width dropdowns on mobile (position: fixed)
- 19 mobile-specific Playwright tests at iPhone 12 Pro (390x844)
- Touch targets ≥44px on all interactive elements

### Testing
- 82 Playwright tests (63 desktop + 19 mobile)
- Covers: all pages, filters, search, letterboxd, map, festivals, iCal, error handling

## Impact
- New `frontend/` directory — does not modify existing Next.js app
- Deployed to Vercel as separate project
- Consumes existing API endpoints via proxy
