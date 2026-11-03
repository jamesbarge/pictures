# Listings QA — director credits, Garden Cosmopolis, London Preview

**PR**: #859
**Date**: 2026-11-03

## Changes
- A leading "First Last's " credit resolves to the remainder when that film is known and the name is its director. `Ken Russell's The Devils` uses The Devils (1971, Ken Russell). `Schindler's List`, `Ferris Bueller's Day Off`, `Rosemary's Baby`, `My Brother's Wedding`, `Bram Stoker's Dracula`, `Lee Cronin's The Mummy` and `Hell on Earth: The Desecration and Resurrection of The Devils` are unchanged.
- `Don DeLillo at 90:` is a season. `(YYYY) with Guest` is a release year plus a guest. Both Garden Cosmopolis listings store Cosmopolis (2012), with `with Ben Rivers` as the note. The same Savoy performance id at the same instant keeps one screening.
- `"Terrorists" - London Preview` stores Terrorists. The preview is the note when the screening has none.
- `My Political Biography - Trans Awareness Programme 2026` already cleaned to My Political Biography. The repair renames the stored film and copies the strand onto an empty note.
- `scripts/repair-listings-qa-2026-11-03.ts` rewrites upcoming rows. Dry-run unless `--execute`. It was not run against production, and it does not delete film rows.

## Impact
- New scrapes of these listings stop creating a second film for The Devils, a second Cosmopolis screening, and a quoted Terrorists preview.
- Screenings already stored keep the bad titles until the repair script is run with `--execute`.
