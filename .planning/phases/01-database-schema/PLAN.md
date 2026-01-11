# Plan 01-01: Create Seasons Schema and Migrations

## Goal

Create the database schema for director seasons with Drizzle ORM. The schema should support:
- Season metadata (name, description, dates, poster, etc.)
- Season → Films relationship (many-to-many junction table)
- Director association for director-focused seasons
- Cross-cinema support (seasons can span multiple venues)
- Source tracking for scraped data

## Context

### Existing Patterns to Follow
- **festivals.ts**: Similar entity with dates, description, junction table to screenings
- **films.ts**: UUID text primary keys, array fields for multi-value data
- **screenings.ts**: Already has a `season` text field (denormalized) we can eventually normalize

### Key Design Decisions
1. **Season → Films (not Screenings)**: Unlike festivals which link to screenings directly, seasons group films. The films already link to their screenings.
2. **No cinema FK**: Seasons can span multiple cinemas (a Kurosawa retrospective at BFI + Barbican). Store cinema slugs as array like festivals do.
3. **Director association**: Optional `directorName` field for director-focused seasons. We can enrich with TMDB director data later (Phase 6).

## Tasks

### 1. Create seasons schema file
**File**: `src/db/schema/seasons.ts`

Create the main `seasons` table with:
- `id` (text, UUID primary key)
- `name` (text, not null) — "Kurosawa: Master of Cinema"
- `slug` (text, unique) — "kurosawa-master-of-cinema-2025"
- `description` (text) — Season description/summary
- `directorName` (text) — For director seasons, the director's name
- `directorTmdbId` (integer) — Optional TMDB person ID for enrichment
- `startDate` (date, not null) — When the season begins
- `endDate` (date, not null) — When the season ends
- `posterUrl` (text) — Season poster image
- `websiteUrl` (text) — Link to season page on cinema website
- `sourceUrl` (text) — Where we scraped this from
- `sourceCinemas` (text array) — Cinema slugs where this season runs
- `isActive` (boolean, default true) — For filtering current seasons
- `scrapedAt` (timestamp) — Source tracking
- `createdAt` / `updatedAt` (timestamps)

Indexes:
- Date range index for filtering current/upcoming seasons
- Director name index for director pages
- Active status index

### 2. Create season_films junction table
**File**: `src/db/schema/seasons.ts` (same file)

Create `seasonFilms` junction table with:
- `seasonId` (text, FK → seasons.id, cascade delete)
- `filmId` (text, FK → films.id, cascade delete)
- Composite primary key on (seasonId, filmId)
- `orderIndex` (integer) — Optional ordering within the season
- `createdAt` (timestamp)

Indexes:
- Season lookup index
- Film lookup index (to find what seasons a film is part of)

### 3. Export from schema index
**File**: `src/db/schema/index.ts`

Add export: `export * from "./seasons";`

### 4. Generate and run migration
Run Drizzle commands:
```bash
npm run db:generate
npm run db:push
```

Verify migration applied successfully.

## Verification

- [ ] `seasons` table exists in database with all columns
- [ ] `season_films` junction table exists with foreign keys
- [ ] TypeScript types export correctly (`SeasonInsert`, `SeasonSelect`, etc.)
- [ ] No TypeScript errors in schema files
- [ ] Migration runs without errors

## Notes

- The existing `screenings.season` text field will remain for now — it's a denormalized field that scrapers populate. We can add migration logic later to normalize this into the proper Season entities.
- Director enrichment (bio, photo, filmography) is Phase 6 — this phase just stores the director name and optional TMDB ID.
