# Listings QA: truncated Stalker and unmatched album quotes

**PR**: #867
**Date**: 2026-11-13

## Changes
- The sync title extractor only removes quotes that wrap the whole title. A closing quote around an album name stays after an anniversary suffix is stripped.
- Close-Up restores a title that dropped one to three leading letters in the middle of a word, when at least four characters remain and another showing on the same booking URL has the full title. `alker` (two letters dropped) becomes `Stalker`. A search-page source id built from the short title is rewritten. The repair never deletes a screening.
- `scripts/repair-listings-qa-2026-11-13.ts` moves the stored rows. Dry run unless `--execute`. It was not run against production, and it does not delete film rows.

## Impact
- New scrapes of Riverside, Castle and Close-Up stop writing `My Bloody Valentine 'Loveless`, `Primal Scream 'Screamadelica`, `Joni Mitchell 'Hejira` and `alker`.
- The public calendar keeps showing the broken titles until the repair script is executed.
