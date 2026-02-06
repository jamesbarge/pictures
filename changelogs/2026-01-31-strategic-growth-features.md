# Strategic Growth Features — Share, Tonight, SEO Pages, Calendar, NPS, Filter UX

**Date**: 2026-01-31

## Changes

### P0: Share a Screening (Word-of-Mouth Loop)
- Created `src/components/film/share-screening-button.tsx` with Web Share API (mobile-native) and clipboard fallback (desktop)
- Share text includes film title, cinema, date/time, format, event type, and link to pictures.london
- Integrated into `film-screenings.tsx` (next to Book button) and `screening-card.tsx` (compact overlay on poster hover)
- PostHog event: `screening_shared` with method (native/clipboard)

### P1: "What's on Tonight" Page
- Created `src/app/tonight/page.tsx` — server component with cached DB query (60s revalidation)
- Created `src/app/tonight/tonight-view.tsx` — client component with live countdown timers (30s interval)
- Groups screenings into "Starting Soon" (< 2 hours) and "Later Tonight"
- Urgency labels: red (< 15 min), amber (< 30 min), highlight (< 60 min)
- SEO-optimized with daily-changing metadata, FAQ schema, breadcrumb schema
- Added "Tonight" nav item to header with Sparkles icon

### P1: In-App NPS Survey
- Created `src/components/feedback/nps-survey.tsx`
- Shows after 5+ sessions with 15-second delay, 90-day cooldown between prompts
- 0-10 score buttons with optional comment, score-aware placeholder text
- Tracks `nps_score_submitted` in PostHog with category (promoter/passive/detractor)
- Added to `src/app/layout.tsx` for site-wide display

### P1: Programmatic SEO Pages
- `src/app/cinemas/[slug]/tonight/page.tsx` — Per-cinema tonight page with MovieTheater + FAQ schemas
- `src/app/this-weekend/page.tsx` — Weekend screenings grouped by day then cinema
- Smart date detection: shows current weekend if Sat/Sun, next weekend otherwise
- Both pages have proper canonical URLs, OpenGraph, and Twitter metadata

### P2: Calendar Integration (.ics Export)
- Created `src/app/api/calendar/route.ts` — generates iCal files for single screenings (`?screening=<id>`) or all upcoming for a film (`?film=<id>`)
- Created `src/components/film/add-to-calendar-button.tsx` — compact and full button modes
- Integrated into film-screenings.tsx and tonight-view.tsx alongside Share and Book buttons
- iCal includes: title, location (cinema address), description with booking URL, runtime-based duration

### P2: Filter Bar Progressive Disclosure
- Modified `src/components/filters/filter-bar.tsx` to collapse secondary filters
- **Always visible**: Date range picker, Festival filter
- **Behind "More filters" toggle**: Format, Type, Decade, Genre, Time of Day, Single Showing
- Badge on toggle shows count of active secondary filters
- Auto-expands if user has secondary filters already active

### Sitemap Updates
- Added `/tonight` (hourly change frequency, priority 0.9)
- Added `/this-weekend` (daily change frequency, priority 0.9)
- Added `/cinemas/[id]/tonight` for each active cinema (hourly, priority 0.8)

## Impact
- **Growth**: Share button enables word-of-mouth loop — the #1 growth driver for consumer products
- **SEO**: Programmatic pages target high-intent searches ("BFI tonight", "cinema this weekend London")
- **Retention**: Calendar export puts Pictures into users' daily workflow; NPS measures satisfaction
- **UX**: Progressive disclosure reduces visual complexity for casual users while keeping power features accessible
