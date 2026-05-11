# Picturehouse BST fix + 478 ghost row cleanup + /spot-check loop

**PR**: TBD
**Date**: 2026-05-11

## Changes

### `src/scrapers/chains/picturehouse.ts` — fix BST +1h ghost bug

`new Date(showTime.Showtime)` interprets the API's TZ-less ISO string (e.g. `"2026-05-17T15:30:00"`) in the runtime TZ. Under `TZ=UTC` it silently adds 1h during BST. Direct API probe confirmed the no-TZ format. Replaced with `parseUKLocalDateTime(showTime.Showtime)`.

Same bug class and same fix as Everyman in PR #484. Confirmed by checking the DB for same-`(cinema_id, source_id)` pairs whose datetimes differ by exactly 3600s: **129 BST-signature dupe groups** at Picturehouse, totalling 370 rows. Curzon was independently checked and is clean (0 BST-signature dupes — its Vista OCAPI returns Z-suffixed timestamps).

### Data cleanup — 478 +1h ghost screenings deleted

Ran `scripts/_cleanup-bst-ghost-screenings.ts --apply`. For each `(cinema_id, source_id)` group at Everyman or Picturehouse venues where multiple rows exist with `MAX(datetime) - MIN(datetime) = INTERVAL '1 hour'` exactly, deleted all rows except the one with the minimum datetime (= the BST-correct UTC). Safety guard: the 1-hour-exact constraint prevents touching screenings legitimately rescheduled by the cinema. Post-cleanup verification: 0 remaining BST-signature dupe groups.

By cinema: picturehouse-finsbury-park 49, everyman-barnet 41, picturehouse-crouch-end 41, picturehouse-ealing 32, picturehouse-west-norwood 32, picturehouse-hackney 28, … (full breakdown in commit body).

### `scripts/spot-check-and-fix.ts` + `/spot-check` slash command — iterative data quality loop

New self-contained tool. Each iteration: sample the 100 films with the soonest upcoming screenings, find every HIGH/MEDIUM/LOW data-quality issue, apply every safe auto-fix, repeat until 0 fixes in an iteration (converged) or 10 iterations elapsed.

Safe auto-fixes:
- Strip programme-strand title prefixes: `DocHouse:`, `LONDON PREMIERE`, `UK PREMIERE`, `Funeral Parade presents`, `Funday:`, `LOCO presents:`, `Lost Reels:`, `LAFS PRESENTS:`, `Crafty Movie Night -`, `Journey Through Irish Cinema:`, `Film Club: X:`.
- Flip `is_repertory=true` for films with `year < currentYear - 1`.
- Year UPDATE from TMDB when stored year disagrees (with substring-overlap guard to prevent compounding a wrong-TMDB-linkage bug).
- Runtime / posterUrl / synopsis / directors / genres re-enrich from TMDB.

Skipped (manual-review surfaced in the final report):
- Wrong-TMDB linkage (DB title diverges from TMDB title) — auto-swapping IDs is too risky.
- `year = currentYear` with no TMDB ID — needs TMDB search + confidence guards (the rolling patrol handles this).

First run after PR #483/#484: **10 fixes applied across 3 iterations**, converged. 5 prefix strips (Dracula, Phantoms of July, The Last Spy, Our Land, Ultras, Coup 53), 2 is_repertory flips (Burning Ambition 1989, Pacific Rim 3D 2013), Pacific Rim (3D) year=2026→2013, Wizard of the Kremlin runtime=156→136. Remaining 10 issues are all `year=2026 no TMDB` (opera broadcasts / events) — manual-review by the rolling patrol.

### Slash command

`/spot-check` — invokes the above loop. Lives at `.claude/commands/spot-check.md` (gitignored, local-only by repo convention). Runs in `--apply` mode by default; `report` arg switches to read-only.

### Diagnostic / one-off scripts (committed for traceability)

- `scripts/_spot-check-100.ts` — single-pass version of the loop (the original spot-check).
- `scripts/_check-everyman-dupes.ts` — booking-URL dedup query that surfaced the original bug.
- `scripts/_check-hokum.ts` — investigation of a specific film's screenings.
- `scripts/_diagnose-chain-dupes.ts` — chain-wide dupe-group counter (Everyman, Picturehouse, Curzon).
- `scripts/_diagnose-everyman-dupes.ts` — inspect a single dupe set's sourceIds.
- `scripts/_fix-boy-and-the-world.ts` — one-off corrective fix for film `960847a6` (TMDB 302430 "Rumblestrips" → TMDB 223706 *O Menino e o Mundo*).
- `scripts/_search-boy-and-the-world.ts` — TMDB search used to find the correct ID.
- `scripts/_inspect-boy-and-world-row.ts` — diagnostic: dump a single film row + its upcoming screenings.

### Boy and the World — TMDB link corrected

Film row `960847a6-d5ec-4ab7-bed5-4b54e93e0464` had `tmdbId=302430` ("Rumblestrips", a 2012 US drama) but the actual film at BFI Southbank is the 2013 Brazilian animation (IMDB `tt2151783`, original title *O Menino e o Mundo*). Correct TMDB ID 223706. Fields refreshed: year 2026→2014, runtime 85→80, directors ["John Adams","Toby Poser"]→["Alê Abreu"], poster URL, synopsis, is_repertory=true.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npm run test:run src/scrapers/chains` → 4/4 pass.
- Post-cleanup dupe-group count: 0 BST-signature dupes remain.
- Spot-check loop output: 10 fixes applied across 3 iterations; converged with 10 manual-review items remaining.

## Open follow-ups

- Probe the rolling patrol output for any other chain scrapers using `new Date(api.field)`. The pattern is now well-understood; if Vista OCAPI ever changes to TZ-less strings, Curzon would need the same fix.
- The 10 remaining `year=2026 no TMDB` items are typically opera broadcasts and festival events. Could add an `is_special_event` heuristic when title matches `Met Opera Encore`, `BalletAndOpera`, etc.
