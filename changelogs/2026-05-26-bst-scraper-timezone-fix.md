# BST timezone fix — bfi.ts, rich-mix.ts, rich-mix-v2.ts off by +1h

**PR**: TBD
**Date**: 2026-05-26

## Customer report

A user reported on 2026-05-26 (mid-BST):

> Ur website has failed me. Was wanting to escape the heat, so found Devil Wears Prada 2 at the near cinema at 6:30. And gets here. The film was on at 5:30. And realized all the times on the site have not accounted for daylight savings.

i.e. pictures.london was showing showtimes 1 hour ahead of the actual cinema times during BST.

## Root cause

Three scrapers constructed `Date` objects with the local-timezone constructor:

```ts
new Date(year, month, day, hours, minutes); // ❌ depends on host TZ
```

On the UTC server (Vercel / cloud orchestrator) this interprets the components as UTC, so a cinema's "18:10 BST" gets stored as `2026-05-26T18:10:00Z`. The frontend then correctly renders UTC → Europe/London (which adds +1h during BST), producing `19:10 BST` — one hour ahead of the actual showtime.

Verified end-to-end against Rich Mix's Spektrix API, which conveniently emits both `start` (UK local) and `startUtc`:

```
API:  start = "2026-05-26 18:10:00"   startUtc = "2026-05-26 17:10:00"
DB (pre-fix):  2026-05-26 18:10:00+00  →  displayed 19:10 BST  (WRONG, +1h)
DB (post-fix): 2026-05-26 17:10:00+00  →  displayed 18:10 BST  (matches API)
```

The project already has a `ukLocalToUTC()` helper specifically for this. Curzon, Picturehouse, and Everyman were fixed previously; these three slipped through.

## Code changes

| File | Change |
|---|---|
| `src/scrapers/cinemas/bfi.ts` | `parseBFIDateTime` now routes through `ukLocalToUTC` |
| `src/scrapers/cinemas/rich-mix.ts` | `parseDateTime` now routes through `ukLocalToUTC` |
| `src/scrapers/cinemas/rich-mix-v2.ts` | `parseDateTime` now routes through `ukLocalToUTC` |
| `src/scrapers/cinemas/bst-regression.test.ts` (new) | Locks in BST behaviour for all three parsers |
| `scripts/verify-bst-fix.ts` (new) | Manual verification harness — algorithm mirror under TZ=UTC, 7/7 pass |
| `scripts/diagnose-bst-bug.ts` (new) | Diagnostic harness used during root-cause investigation |

## Data backfill

BFI turned out to have three data sources writing to the same table:

| source_id prefix | Source | Bug status |
|---|---|---|
| `bfi-southbank-*` / `bfi-imax-*` | `bfi.ts` website scraper | BUGGY |
| `bfi-pdf-*` | `bfi-pdf` PDF importer | Correct (uses `ukLocalToUTC`) |
| `bfi-changes-*` | `programme-changes-parser` | Correct (uses `ukLocalToUTC`) |
| `richmix-*` (cinema_id `rich-mix`) | `rich-mix.ts` / `-v2.ts` | BUGGY |

Surgical backfill, scoped strictly by `source_id`:

- **DELETE 5** BFI rows where a correct twin existed at `-1h` (would have collided on the `(film_id, cinema_id, datetime)` unique index)
- **UPDATE 210** other BFI buggy rows, shifted `-1h`
- **UPDATE 79** Rich Mix buggy rows, shifted `-1h`

Total: 294 row changes. Correct sources (`bfi-pdf-*`, `bfi-changes-*`) untouched.

## Verification

Cross-checked DB against Rich Mix Spektrix API after backfill:

| Showtime | API (truth) | DB after fix | Match |
|---|---|---|---|
| Wed 27 May | UTC 14:30 / UK 15:30 | UTC 14:30 / Lon 15:30 | ✅ |
| Thu 28 May | UTC 14:15 / UK 15:15 | UTC 14:15 / Lon 15:15 | ✅ |

## Impact

- Affected venues: BFI Southbank, BFI IMAX, Rich Mix (and any other cinema scraped through `bfi.ts` / `rich-mix.ts` / `rich-mix-v2.ts` during BST 2026-03-29 → present).
- Affected users: anyone planning a screening at those venues using pictures.london during BST. Customer-reported impact: arriving an hour late.
- Side effects: none on correctly-stored data; all changes scoped to known-buggy `source_id` prefixes.

## Known follow-ups

- Vitest workers hang in this checkout (pre-existing, not from this change). Manual verify via `TZ=UTC npx tsx scripts/verify-bst-fix.ts` passes 7/7.
- Discussed guardrail options to prevent recurrence (ESLint rule banning the local-TZ `Date` constructor in `src/scrapers/**`); deferred until after this customer-facing fix lands.
