# BFI — path-agnostic canonical sourceId

**PR**: TBD
**Date**: 2026-06-01
**Branch**: fix/bfi-sourceid-path-agnostic
**Task**: 1 of the post-#619 scraper-coverage brief (gates the PDF-retirement, task 2)

## Problem
The three BFI ingest paths each minted their own sourceId:
- Playwright (`bfi.ts`): `bfi-<cinemaId>-<articleId|titleSlug>-<iso>`
- PDF (`pdf-parser.ts`): `bfi-pdf-<pdfLabel>-<titleSlug>-<iso>`
- Programme-changes (`programme-changes-parser.ts`): `bfi-changes-<titleSlug>-<iso>`

So when the Playwright path fell back to the PDF importer, the SAME physical
screening got a DIFFERENT sourceId, and the `(cinema_id, source_id)` upsert
INSERTed a duplicate row instead of updating in place. The same film showing
simultaneously in two screens (NFT1/NFT2) could also collapse, because screen
was not part of the key.

## Fix
- New `src/scrapers/bfi-pdf/bfi-source-id.ts`: `buildBfiSourceId(cinemaId, title, screen, datetime)`
  → `bfi-<cinemaId>-<titleSlug>-<screen>-<iso>`, used by all three paths.
  - `bfiTitleSlug` matches the pre-existing lowercase-hyphen slug (minimises churn).
  - `normalizeBfiScreen` maps any path's screen string to a canonical token
    (NFT1–4 / STUDIO / IMAX / REUBEN), so "Southbank - NFT3" (Playwright row[63/64])
    and "NFT3" (PDF/changes venue) resolve identically.
- `bfi.ts`: dropped the articleId branch (the source of cross-path divergence) and
  the now-dead `extractArticleId` method.
- `pdf-parser.ts`: keys on the per-screening venue→cinemaId via `VENUE_MAP`
  (not the file-level `pdfLabel`), so a combined Southbank+IMAX PDF keys each
  venue correctly. Removed the now-unused `pdfLabel` param.
- `programme-changes-parser.ts`: keys on `screening.cinemaId` + `screening.venue`.
- Unit test `bfi-source-id.test.ts`: cross-path equality, NFT1/NFT2 disambiguation,
  IMAX/Reuben normalisation.
- `scripts/dedup-bfi-sourceid-migration.ts`: one-time sweep for the reformat churn.

## Verification
- `buildBfiSourceId` cross-path equality + NFT disambiguation confirmed via a tsx
  runtime check (and the unit test, which runs in CI — vitest can't start in this
  checkout's corrupted node_modules, so `tsc --noEmit` is the local gate and passes).
- Dedup script dry-run vs prod DB: **0 current duplicates** (data is clean today).

## Deploy sequence (IMPORTANT — one-time churn)
Reformatting changes every BFI sourceId, so the next BFI scrape inserts new-keyed
rows alongside the pre-migration rows (scrapers don't delete future screenings).
Apply in order:
1. Merge + deploy this PR (promote api.pictures.london).
2. Run the BFI Playwright scrape so new-format rows exist.
3. `npx tsx --env-file=.env.local scripts/dedup-bfi-sourceid-migration.ts` (dry-run),
   then `--execute` to remove the superseded duplicates. The sweep only deletes
   within a `(cinema_id, film_id, datetime, screen)` partition that has >1 row,
   keeping the newest-scraped — so genuinely simultaneous multi-screen shows are
   preserved.

## Impact
- Eliminates the recurring duplicate-screening source for BFI on every path flip.
- Unblocks task 2 (retire the BFI PDF importer) — once Playwright has 2–3 healthy
  weeks, the PDF fallback can be removed without a duplicate risk.
