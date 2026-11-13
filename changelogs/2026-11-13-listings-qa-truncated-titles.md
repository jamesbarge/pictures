# Listings QA: truncated Stalker and unmatched album quotes

**PR**: #867
**Date**: 2026-11-13

## Changes
- The sync title extractor only removes quotes that wrap the whole title. A closing quote around an album name stays after an anniversary suffix is stripped.
- Close-Up restores a title that is a one-to-three-letter mid-word tail of another showing on the same booking URL, and rewrites a search-page source id built from the short title.
- `scripts/repair-listings-qa-2026-11-13.ts` moves the stored rows. Dry run unless `--execute`. It was not run against production, and it does not delete film rows.

## Impact
- New scrapes of Riverside, Castle and Close-Up stop writing `My Bloody Valentine 'Loveless`, `Primal Scream 'Screamadelica`, `Joni Mitchell 'Hejira` and `alker`.
- The public calendar keeps showing the broken titles until the repair script is executed.
