---
phase: 01-database-schema
plan: 01
subsystem: database
tags: [drizzle, postgres, seasons, junction-table]

# Dependency graph
requires: []
provides:
  - seasons table for director season collections
  - season_films junction table for season → film relationships
  - TypeScript types (SeasonInsert, SeasonSelect, SeasonFilmInsert, SeasonFilmSelect)
affects: [season-scrapers, seasons-page, director-pages, calendar-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cross-cinema entity pattern (sourceCinemas array like festivals.venues)
    - Season → Films junction (not Season → Screenings like festivals)

key-files:
  created:
    - src/db/schema/seasons.ts
    - src/db/migrations/0002_aberrant_black_widow.sql
  modified:
    - src/db/schema/index.ts

key-decisions:
  - "Season → Films (not Screenings): seasons group films which already link to screenings"
  - "Cross-cinema via array: sourceCinemas array enables seasons spanning multiple venues"
  - "Director fields for enrichment: directorName + directorTmdbId for Phase 6 TMDB integration"

patterns-established:
  - "Junction table with orderIndex for curated ordering within collections"

issues-created: []

# Metrics
duration: 4min
completed: 2026-01-10
---

# Phase 1 Plan 01: Create Seasons Schema Summary

**Drizzle schema with seasons table and season_films junction table for cross-cinema director season collections**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-10T17:44:31Z
- **Completed:** 2026-01-10T17:48:15Z
- **Tasks:** 4 (tasks 1-2 combined in single file)
- **Files modified:** 3

## Accomplishments

- Created `seasons` table with full metadata support (name, description, dates, poster, director association)
- Created `season_films` junction table with composite primary key and optional ordering
- Added cross-cinema support via `sourceCinemas` text array (no cinema FK)
- Created indexes for date range queries, director lookups, and active status filtering
- Applied migration successfully to Supabase database

## Task Commits

Each task was committed atomically:

1. **Tasks 1-2: Create seasons schema file with tables** - `af5df3d` (feat)
2. **Task 3: Export from schema index** - `0060b4f` (chore)
3. **Task 4: Generate and apply migration** - `d30aaf4` (chore)

## Files Created/Modified

- `src/db/schema/seasons.ts` - Seasons and SeasonFilms tables with indexes
- `src/db/schema/index.ts` - Added seasons export
- `src/db/migrations/0002_aberrant_black_widow.sql` - Generated migration SQL

## Decisions Made

1. **Season → Films (not Screenings)** — Unlike festivals which link directly to screenings, seasons group films. The films already have screening relationships, so this avoids duplication.

2. **No cinema FK, use array** — Seasons can span multiple cinemas (a Kurosawa retrospective at BFI + Barbican). The `sourceCinemas` text array follows the same pattern as `festivals.venues`.

3. **Director fields for later enrichment** — Store `directorName` for display now, `directorTmdbId` for Phase 6 TMDB integration.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **drizzle-kit push bug** — The `db:push` command failed with a TypeError in Drizzle-Kit's introspection. Worked around by creating a custom migration script to apply the seasons-specific SQL directly.
- **db:migrate replay issue** — The migrate command tried to replay all migrations from scratch, failing on existing tables. The workaround avoided this by applying only the new tables.

## Next Phase Readiness

- Schema foundation complete with all tables, indexes, and types
- Ready for Phase 2: Season Scraper Research
- The existing `screenings.season` text field remains for now — normalization can happen after scrapers populate season entities

---
*Phase: 01-database-schema*
*Completed: 2026-01-10*
