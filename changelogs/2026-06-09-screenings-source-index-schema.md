# Declare Scraper Source-ID Partial Index in Drizzle

**PR**: #658
**Date**: 2026-06-10

## Changes
- Added `idx_screenings_cinema_source` to the Drizzle `screenings` table definition as a partial unique index on `(cinema_id, source_id)` where `source_id IS NOT NULL`.
- Added a schema-level regression test covering the index name, uniqueness, columns, and partial predicate.
- Kept migration `0011_screenings_cinema_source_unique.sql` unchanged because the index already exists in deployed databases.

## Impact
- `drizzle-kit generate` and `drizzle-kit push` now understand the index required by source-backed scraper upserts.
- Future schema operations cannot silently drop the conflict target and break `onConflictDoUpdate` in the scraper pipeline.
