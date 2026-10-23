# Listings QA 18 Oct 2026

**PR**: #830
**Date**: 2026-10-18

## Changes
- Prince Charles Se7en / Seven: lookup aliases the two titles when the director is David Fincher (or the title is the stylized Se7en) and prefers the TMDB row. A unique-index collision on `(film, cinema, datetime)` deletes the occupying screening and retries, so one showing stays.
- Cinema Museum: the strand `Horror for a Cause - Save the Cinema Museum -` is stripped. A specific booking URL that contains the incoming film's title updates the other row at that time. After a Cinema Museum write, other rows on the same URL and time are removed. The stored Evil Dead title is an exact repair to The Return of the Living Dead (1985).
- Possessive credits stay in `cleanFilmTitle` (existing tests). Matching uses the stripped title when the credit equals the cached film's director, or when the credit is an initialled author (`J.G.Ballard`) and the scraper's director is the film's director. `• Director's Cut` is stripped the same way as `: Director's Cut`, which also releases the `(2009)` year.
- Audience and festival wrappers stripped: `Carers & Babies:`, `Parent and Baby:`, `Hard of Hearing:`, `Name presents Title`, `(Film Africa)`. `Amy Winehouse 'Back To Black` unwraps to Back to Black. The stripped strand is stored as `eventDescription` when the scraper didn't set one.
- Rio director `ype Williams`: a one-letter tag `<H>ype` is restored, and the HTML `Director:` line is used when it is the JSON value plus 1–3 letters.
- Rio ALL CAPS titles are title-cased when a film is created without TMDB, and again when the public screenings API reads them. A TMDB match already stores the TMDB title.
- `RETURN TO THE TATLER + VARIETY` becomes one Rio screening titled Variety with event note "Return to the Tatler". The repair maps a Bette Gordon "RETURN TO THE TATLER" row to Variety and a 1985 Variety row with that director to 1983.
- `scripts/repair-listings-qa-2026-10-18.ts` plans these rewrites and repoints screenings onto the stronger film (TMDB id, poster, year). Dry-run unless `--execute`. It does not delete film rows and was not run against production.

## Impact
- New scrapes of Prince Charles, the Cinema Museum, Rio, Picturehouse, BFI, Curzon, Everyman, Riverside, Electric and Castle stop creating the duplicate and junk titles from the 18 Oct QA.
- Pictures already in the database keep their bad titles until the repair script is run with `--execute`. ALL CAPS titles display in title case on the public API immediately, because that mapping is at read time.
- Overlaps draft PR #829 only in `cleanFilmTitleWithMetadata`, in regions that PR does not edit (audience prefixes, a no-colon "presents", the director's-cut bullet, the Film Africa suffix, and the quoted-title unwrap). It does not touch `parseFilmMetadata`, the colon handler, the prefix-loop rewrite, or `scripts/repair-fragment-film-titles.ts`.
