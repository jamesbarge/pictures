# Listings QA, 19 Oct 2026

**PR**: #835
**Date**: 2026-10-19

## Changes
- Strand prefixes and screening extras are removed from the film title. The removed text is stored as `eventDescription` when the screening does not already have one.
- Garden stats that are only a runtime (`180m.`, `90m.`, `120m.`) are no longer saved as a director. The minutes stay on `runtime`. An all-lowercase credit is title-cased. A ` / ` double-bill credit is split into two directors.
- Sold-out Electric showings use `/tickets/<screening id>` and `availabilityStatus: sold_out`. The API sets `link` to false for those rows; the id is the same ticket path the bookable rows use.
- `scripts/repair-listings-qa-2026-10-19.ts` rewrites rows already stored. It is a dry run unless `--execute`. It does not delete film rows and was not run against production.

## Impact
- New scrapes of Garden, Olympic, the Nickel, Rio, Riverside, BFI IMAX, Phoenix, ICA and BFI Southbank stop creating the 19 Oct bad titles and credits.
- Electric White City sold-out showings no longer point at the programme index.
- Shouted Nickel titles `CHAMPAGNE AND BULLETS` and `THE MAD BOMBER` are left to the 18 Oct QA title-casing. The Barbican ellipsis card is left to the fragment-title PR's event-page h1 fetch; this repair only rewrites the stored fragment.
