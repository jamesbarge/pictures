# seed-cli sources cinemas from the registry (fixes Garden map pin, kills zombie cinemas)

**PR**: #730
**Date**: 2026-07-14

## Problem (found during a coverage audit)

`db:seed:cinemas` seeded from a hand-maintained 16-entry `LONDON_CINEMAS` array in
`src/db/seed-cli.ts`, which had drifted from the cinema registry:

- It used **deprecated ids** `garden-cinema` and `genesis-mile-end` (canonical: `garden`,
  `genesis`), so seeding created empty **zombie cinemas** (active, 0 screenings) that render
  as empty venues on the site.
- The `garden-cinema` entry even had the **wrong address** (Golders Green NW11) — The Garden
  Cinema is in Covent Garden (WC2B).
- Because coordinates were written to the zombie id, canonical **`garden`** (200 screenings)
  was left with **NULL coordinates → missing from the map entirely**. (The scraper path's
  `ensureCinemaExists` writes address/name but not coordinates, so nothing else filled them.)

The registry already exposed `getCinemasSeedData()` (all 71 cinemas, correct coords) and its
own header comment said seed-cli *should* use it — a stale local array was just left in place.

## Change

- `seedCinemas()` now iterates `getCinemasSeedData()` (registry — single source of truth).
  The stale 261-line `LONDON_CINEMAS` array is deleted. Kills the drift permanently.
- The upsert **COALESCEs** the NULLABLE columns (`coordinates`/`screens`/`description`) against
  the existing DB row: the registry has null coordinates for 18 of 71 cinemas, and 11 of those
  are currently live-pinned (lexi, several Picturehouse/Everyman branches). COALESCE means the
  registry value wins when present and the existing DB value is preserved when the registry is
  null — so the fix can't blank a live pin. (`programmingFocus`/`features` are NOT NULL, so they
  stay honest overwrites from the registry.)
- **`active` flag carried through** (`getCinemasSeedData()`): `isActive` is set from the
  registry on INSERT only (so a deliberately-inactive venue like `everyman-walthamstow` isn't
  inserted as active on a fresh DB seed — which would recreate the exact zombie class this fixes)
  and kept OUT of the update `set`, so a re-seed never flips a manually-toggled venue. [code-review]

## Prod remediation applied (data-only, no code)

- `npm run db:seed:cinemas` → 71 cinemas upserted. Verified: **`garden` gained coordinates
  (map pin restored)**; the 11 at-risk pinned venues **kept** their coordinates (COALESCE).
- Deleted 4 orphaned zombie cinema records — `garden-cinema`, `genesis-mile-end` (empty),
  `nickel` (inactive, 132 stale rows incl. 40 future — already hidden as inactive), `olympic`
  (inactive, empty) — plus `nickel`'s 132 screenings. 0 zombies remain.

## Verification

- eslint clean; `tsc --noEmit` clean.
- `getCinemasSeedData()` validated: 71 entries, canonical `garden`/`genesis`/`chiswick-cinema`
  present, deprecated ids absent, no duplicate ids.
- Post-seed DB check: `garden` pinned; lexi + Picturehouse/Everyman pins intact; zombies gone.

## Impact

- **The Garden Cinema is back on the map.** No other venue's pin regressed.
- Future `db:seed:cinemas` runs are registry-driven — they can't recreate the zombies or
  starve canonical venues of metadata. Removes the `LONDON_CINEMAS`↔registry dual-maintenance.

## Follow-up (not in this change)

- The registry is missing coordinates for 18 cinemas (7 currently pinless: castle-sidcup,
  arthouse-crouch-end, david-lean-cinema, riverside-studios, everyman-{walthamstow,brentford,
  the-whiteley}). Backfilling those into `cinema-registry.ts` would give them map pins.
