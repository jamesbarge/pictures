# Database Rules

## Data Integrity
- Scrapers should add new screenings; do not delete valid future screenings.
- Only delete screenings for confirmed parsing errors, true duplicates, or orphaned records.

## Storage & Display
- Times stored in UTC, displayed in UK timezone.
- Filter past screenings using current time (`new Date()`), not start of day.
- Use `gte(screenings.datetime, now)` for server-side filtering.

## Cleanup Scripts
- `db:cleanup-screenings` deletes duplicate screenings (same film, cinema and datetime), keeping the copy with a booking URL and the earliest `scraped_at`; dry run by default, `-- --execute` deletes
- `db:cleanup-films` writes immediately with no dry run: strips rating/format suffixes from titles, merges every film sharing a year-blind normalised title into one (moving screenings, deleting the rest), then TMDB-rematches every film without a `tmdbId`. Never use it for orphaned films; it merges namesakes such as two different films called Heat
