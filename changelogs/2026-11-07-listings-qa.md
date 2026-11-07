# Listings QA, 7 Nov 2026

**PR**: pending
**Date**: 2026-11-07

## Changes
- Prince Charles reads the release year and the runtime from `.running-time` and the director from `.film-info`. Tenet is sent as 2020, Christopher Nolan, 150 minutes. Blue Velvet is sent as 1986, David Lynch, 121 minutes.
- A Barbican listing card that ends in `...` is replaced with the event page's h1. The source id stays derived from the card title.
- `(Block N)` counts as an instalment number, so British Shorts Block 1 and Block 2 do not similarity-match.
- Bertha DocHouse forwards Directed by, Runtime and Year. A cached short is refused when the listing is a feature, the directors share no surname, and the years are more than 20 apart.
- `LDNDOCS` and `LDNDOCS 2026` peel like the other festival acronyms. A peeled title will not match a film released more than three years ago.
- `Narrow Margin Presents`, `Nolan in 35mm:` and `Parents & Baby Screening -` peel. The strand is kept as the screening note. Two full names joined by "and" are stored as two directors.
- `scripts/repair-listings-qa-2026-11-07.ts` rewrites rows already stored. It is a dry run unless `--execute`. It was not run against production, and it does not delete film rows.

## Impact
- The next scrape of Prince Charles, Barbican, Lexi, DocHouse, Curzon, ICA and Phoenix stores the corrected titles and stops attaching the listed screenings to the wrong films.
- Already-stored rows change only when the repair script is run with `--execute`, or when the next scrape updates a screening whose source id does not include the title.
