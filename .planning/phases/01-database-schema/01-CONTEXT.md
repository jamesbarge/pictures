# Phase 1: Database Schema - Context

**Gathered:** 2026-01-10
**Status:** Ready for planning

<vision>
## How This Should Work

The database should support rich season data with full context — dates, descriptions, posters, director links, and cinema sources. Seasons can span multiple cinemas (a Kurosawa retrospective might show at both BFI and Barbican), so the schema needs to support cross-cinema seasons rather than tying each season to a single venue.

The data model follows Season → Films → Screenings, leveraging the existing film-screening relationship. A season groups films together, and those films have their associated screenings at various cinemas.

</vision>

<essential>
## What Must Be Nailed

All three aspects are equally important:
- **Season → Films relationship** — Getting the link right so films properly appear within their seasons
- **Director association** — Connecting seasons to directors to enable director-based browsing
- **Rich metadata** — Having all display info ready (poster, description, date range)

</essential>

<boundaries>
## What's Out of Scope

No specific exclusions defined — open to whatever makes sense for a solid foundation. The schema should be designed to support:
- Future UI needs
- Scraper data ingestion
- Director enrichment

</boundaries>

<specifics>
## Specific Ideas

- Seasons should be able to span multiple cinemas (cross-cinema support)
- Rich context: dates, description, poster, cinema source, director link
- Build on existing film/screening schema patterns

</specifics>

<notes>
## Additional Context

This is foundational work — getting the schema right enables everything else (scraping, UI, filtering). The existing codebase already has Drizzle patterns established for films, screenings, and cinemas that this should follow.

</notes>

---

*Phase: 01-database-schema*
*Context gathered: 2026-01-10*
