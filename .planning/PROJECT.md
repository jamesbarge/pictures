# Project: Director Seasons

## What This Is

A feature for pictures.london that lets users discover and browse director seasons running at London cinemas. Seasons are curated collections of films by a single director (e.g., "Kurosawa at BFI") that cinemas run over a period of time. The feature scrapes season info from cinema websites, displays them in a dedicated browse experience, and integrates with the existing calendar.

## Core Value

Season discovery — helping users find what seasons are currently running so they don't discover them too late and miss films.

## Requirements

### Validated

- ✓ Web scraping from 15+ London cinemas — existing
- ✓ Film data with TMDB enrichment — existing
- ✓ Calendar view of screenings — existing
- ✓ User preferences (cinema selection) — existing
- ✓ Film status tracking (watchlist, seen) — existing
- ✓ Cloud sync with Clerk auth — existing
- ✓ Multi-venue chain support (Curzon, Picturehouse, Everyman) — existing

### Active

- [ ] Season data model (Season → Films → Screenings)
- [ ] Scrape season information from cinema websites (all cinemas equally)
- [ ] Dedicated /seasons page with season cards
- [ ] Director pages to explore a director's work
- [ ] Calendar integration (seasons as filters/tags)
- [ ] Rich season metadata (poster, description, director bio, film synopses, related seasons)

### Out of Scope

- User-created seasons — only scraped/detected seasons in v1
- Historical seasons — only current/upcoming seasons displayed
- User tracking on seasons — no watchlist/seen progress per season (view-only)

## Context

### Motivation

Users often discover seasons too late and miss films. A Kurosawa season at BFI might be half over before you hear about it. This feature surfaces what's running so users can plan ahead.

### Technical Environment

- Next.js 16 with App Router
- Drizzle ORM with PostgreSQL (Supabase)
- Existing scraper infrastructure (Playwright for JS-heavy sites, Cheerio for static)
- TMDB integration for film metadata
- Zustand for client state, TanStack Query for server state

### Data Model Decision

Season → Films → Screenings hierarchy:
- A season groups films by director/theme
- Each film links to its screenings (existing relationship)
- Seasons can span multiple cinemas if the source indicates this

### Key Cinemas for Seasons

BFI and Barbican are the most prolific season runners, but all cinemas with season data should be captured equally.

## Constraints

None specified. All existing tech stack constraints apply.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Season → Films → Screenings model | Matches how seasons work IRL; leverages existing film-screening relationship | — Pending |
| Scrape seasons from cinema sites | BFI, Barbican, etc. explicitly label seasons; more reliable than auto-detection | — Pending |
| View-only (no user tracking) | Keep v1 scope focused on discovery; can add tracking later | — Pending |
| Dedicated /seasons page | Clear entry point for discovery; homepage integration can come later | — Pending |

---
*Last updated: 2026-01-10 after initialization*
