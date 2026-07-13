# Rich Mix Spektrix rewrite + Close-Up WAF hardening + dedup merge fix

**PR**: TBD
**Date**: 2026-07-13

## Changes
- **Rich Mix rewritten against the public Spektrix v3 API** (`src/scrapers/cinemas/rich-mix-v2.ts`):
  the old WordPress JSON endpoint was removed in a site restructure (301 → `/cinema/`).
  Now reads `system.spektrix.com/richmix/api/v3/events` + `/instances?startFrom=`,
  filters film events via `attribute_COGEventProgramme === "FILM"`, uses `startUtc`
  (`timeSource: "iso"`), captures runtime + screen, links to `/cinema/{slug}/` pages.
  New sourceId scheme `richmix-{inst.id}` (no reconcile needed — 0 upcoming rows existed).
  **81 screenings restored**; times verified against richmix.org.uk.
- **Close-Up WAF hardening** (`src/scrapers/cinemas/close-up.ts`): per-page retries with
  backoff (burst-403s are transient); only weeks 1–4 of the date-search pages are
  load-bearing — far-future failures shorten the horizon instead of failing the run;
  `healthCheck()` overridden to use full browser headers (UA-only GET gets 403'd).
  Verified: 10/10 pages fetched, 29 screenings, run success.
- **Dedup merge fix** (`scripts/cleanup-duplicate-films.ts`): unique-index-safe screening
  move + per-cluster error isolation — was described in PR #724's changelog but the code
  was accidentally left uncommitted.

## Impact
- Rich Mix (dark since the site restructure, not covered by L-CUT) is back on
  pictures.london with a full programme.
- Close-Up no longer flaps on WAF bursts; its silent-breaker/flaky signals should clear.
