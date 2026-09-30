# Title decoration and wrapper parity across both title paths

**PR**: #755
**Date**: 2026-09-26

## Changes
- New shared `TERMINAL_DECORATION_SUFFIXES` in `src/lib/title-extraction/patterns.ts` removes `(London|UK|World|European Premiere[ + Q&A])`, `(VHS[ Screening])` and `(B&W)` as complete units. Both `extractFilmTitleSync` and `cleanFilmTitleWithMetadata` run them before the generic `+ Q&A` strip, which used to cut `Casablanca (London Premiere + Q&A)` at the plus sign and leave `Casablanca (London Premiere`.
- New shared `REVIEWED_WRAPPER_PREFIXES` covers `Relaxed Screening:`, `Senior Community Cinema[ x Partner]:`, `Cine-Real presents`, `LAFS presents` and `Funeral Parade presents`. The scraper cleaner's three local copies of the last three are replaced by the shared list.
- `PRESENTS_PATTERN` accepts single and curly quotes, so `Funeral Parade presents 'Paris Is Burning'` no longer yields `Funeral Parade presents 'Paris Is Burning`. The scraper cleaner unwraps one pair of quotes left behind a stripped wrapper.
- The scraper colon heuristic keeps `Mission: Impossible` intact. It previously returned `Impossible`.
- `NON_FILM_PATTERNS` exempts `Quiz Show` and `Official Competition` with lookarounds. Quiz and competition events such as `TCC Film Quiz` and `Satyajit Ray Short Film Competition` still flag as non-films.
- `FESTIVAL_PREFIXES` keeps only `LSFF` (London Short Film Festival, whose brand names a shorts programme). `LFF` and `BFI Flare` screen features, so `BFI Flare: Moonlight` is now one film.
- Regression tests in `pattern-extractor.test.ts`, `film-title-cleaner.test.ts`, `title-patterns.test.ts` and `pipeline.test.ts` cover exact outputs, case-insensitive wrappers, quote forms, HTML entities, idempotence and preservation of `Daisies (Sedmikrásky)`, `A Star Is Born (1954)`, `2001: A Space Odyssey`, `Mission: Impossible` and sequel numbers.

## Impact
- Measured over all 4,637 distinct production film titles (read-only): 28 sync-extractor outputs and 11 scraper-cleaner outputs change, every one a correct strip (for example `Relaxed Screening: Brief Encounter` → `Brief Encounter`, `Funeral Parade presents "The Long Day Closes"` → `The Long Day Closes`). No non-film or compilation flag changes on current data.
- Documented contract difference: the scraper cleaner moves a trailing release year into `extractedYear`; the sync extractor keeps it in the title.
- Informed by the 2026-09-21 TypeSafe title experiment. The change is deterministic parity and regression coverage. It adds no TypeSafe SDK, API key, network call, database write or dependency.
- Known gaps left for follow-up: the scraper cleaner has no `(35mm)` suffix rule; `Member Library Lates: Guillermo del Toro` still strips to a person's name and needs event review; the sync extractor applies suffixes in one ordered pass, so it cannot resolve every stacking order.
