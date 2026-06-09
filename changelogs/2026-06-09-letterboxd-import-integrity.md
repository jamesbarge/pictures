# Letterboxd Import Integrity

**PR**: TBD
**Date**: 2026-06-09

## Changes
- Changed direct Letterboxd watchlist imports to insert missing statuses without overwriting existing user state.
- Changed background Letterboxd imports to preserve existing statuses with `ON CONFLICT DO NOTHING`.
- Moved film create-or-select and user-status insertion into one short database transaction.
- Made concurrent film creation safe by inserting on the unique TMDB ID with `ON CONFLICT DO NOTHING`, then selecting the canonical winner.
- Kept external TMDB API calls outside the database transaction.
- Added regression tests for status preservation, transactional writes, and concurrent film creation.

## Impact
- Re-importing a Letterboxd watchlist cannot reset films marked `seen` or `not_interested`.
- Concurrent imports no longer fail on the unique `films.tmdb_id` constraint.
- A newly created film cannot be committed without its corresponding user status, or vice versa.
