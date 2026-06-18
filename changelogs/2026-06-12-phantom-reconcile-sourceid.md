# Generalized phantom-screening reconcile + sourceId hardening (plan 009)

**PR**: pending
**Date**: 2026-06-12
**Plan**: `plans/009-sourceid-phantom-reconcile.md`
**Branch**: `feat/sourceid-reconcile`

## Background

The scrape pipeline is upsert-only: rows that vanish from a cinema's website
are never deleted. Stable dedup therefore depends on `screenings.source_id`
(partial unique index on `(cinema_id, source_id)`), and any sourceId scheme
change strands every pre-change row as a "phantom" — observed live at BFI
Southbank (~64 phantom rows + 33 near-dup pairs, cleaned by the one-off
staging script `src/scripts/_bfi_reconcile.ts`).

## Audit finding (deviation from the plan's premise)

Plan 009 claimed "13 of 26 scrapers don't set sourceId". Verified against
current code (and against the plan's own authoring commit `716e543`): **27 of
28 registry scrapers already emit sourceId unconditionally**. The only real
gaps were:

- **Prince Charles**: `sourceId: bookingUrl.match(/booknow\/(\d+)/)?.[1]`
  could be `undefined` when the booking URL format drifts.
- **Phoenix**: the plan's "perfCode at ~line 138" does not exist in current
  code; Phoenix already uses the plan's recommended derived composite
  (`phoenix-{titleSlug}-{ISO}`). Left unchanged — switching schemes would
  strand all existing rows for zero benefit.

## Changes

- **`src/scripts/reconcile-phantom-screenings.ts`** (new): generalized,
  per-cinema phantom sweep, default-dry. Phantom = upcoming row
  (`datetime >= now()`) whose `scraped_at` predates the start of the cinema's
  most recent *successful* scrape (the pipeline bumps `scraped_at` on every
  insert and update, so live rows are never candidates).
  Five hard guards, each an exported pure function with unit tests:
  1. `parseReconcileArgs` / `validateCinemaId` — exactly one cinemaId per
     invocation, and it must exist in `CINEMA_REGISTRY`.
  2. `isReconcileSafe` — a successful `scraper_runs` row must have completed
     within the last 2 hours, else refuse (reconciling against a stale scrape
     would delete valid rows). `isVacuousRun` additionally refuses — never
     overridable — when that "success" run upserted 0 screenings (sweeping
     behind an empty scrape would wipe the venue; code-review major #2).
  3. `isPhantomRow` — future-only AND untouched-by-the-run only; re-guarded
     again inside the DELETE (`cinema_id` + `datetime >= now()` +
     `scraped_at < run start`). `scrapeHorizon` additionally excludes stale
     rows beyond the latest datetime the run actually refreshed — a
     temporarily shortened listings window or capped API must not condemn
     valid far-future rows (code-review major #1); excluded rows are printed
     separately as `EXCLUDED`, never deleted.
  4. `exceedsDeletionCap` — refuse plans deleting >40% of the cinema's
     upcoming rows; `--force-large` overrides with a red warning and still
     requires `--execute`.
  5. `batchIds` — every doomed row is printed (title, datetime, source_id,
     scraped_at) before anything happens; `--execute` deletes in batches of
     100 inside a single transaction.
- **`src/scripts/reconcile-phantom-screenings.test.ts`** (new): 36 unit tests
  covering all guards (boundary conditions, clock skew, the 100% LARGE_DROP
  case, horizon classification, vacuous runs, batch integrity, pinned
  constants).
- Known limitation (documented): canonical registry cinema IDs only — rows
  under legacy cinema IDs are not swept.
- **`package.json`**: `reconcile:plan` / `reconcile:apply` entries following
  the default-dry convention from PR #660.
- **`src/scrapers/cinemas/prince-charles.ts`**: sourceId is never `undefined`
  — falls back to `prince-charles-{slugify(title)}-{ISO}` when the
  `booknow/{id}` regex misses. The bare-digit primary scheme is deliberately
  untouched (prefixing it would strand every existing PCC row).
- **`src/scrapers/SCRAPING_PLAYBOOK.md`**: new "sourceId Schemes" section
  documenting every active scraper's scheme + key source, the
  scheme-change → reconcile rule, and the reconcile script's guard contract.
  Notes that the generalized script supersedes `_bfi_reconcile.ts` (that
  staging one-off is untracked in git, so it could not be deleted from this
  branch — remove it from the main checkout when encountered).

## Verification

- `npm run test:run` — 123 files / 1886 tests green (incl. 28 new).
- `npm run lint` — 0 errors (60 pre-existing warnings, none in changed files).
- `npx tsc --noEmit` — clean.
- Read-only `npm run reconcile:plan -- phoenix-east-finchley` against prod:
  correctly **REFUSED (guard 2)** — last successful scrape was the 03:05 UTC
  nightly, outside the 2h window. A read-only probe of the same selection
  logic against that run shows 27/83 upcoming rows (32.5%, under the cap)
  would be planned, including the predicted near-dup phantoms
  (`rocky-road-to-dublin` vs `rocky-roads-to-dublin` slug drift, stranded
  "Tuner" rows).

## Impact

- Operators get a safe, guarded path to clean phantom rows for ANY cinema —
  previously only BFI had (one-off, untracked) tooling.
- The playbook's scheme table makes the next sourceId scheme change
  detectable and pairs it with the mandatory reconcile sequence.
- **No production rows were deleted in this change.** Rollout (per-venue
  scrape → `reconcile:plan` → review → `reconcile:apply`, worst offenders
  first: phoenix-east-finchley, then the ≥70% LARGE_DROP chain venues) is
  performed by the orchestrator post-merge per plan 009 Steps 1 & 3.
