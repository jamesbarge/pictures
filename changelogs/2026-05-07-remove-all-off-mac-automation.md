# Remove all off-Mac automation — Inngest, Vercel crons, GitHub Actions schedules

**PR**: TBD
**Date**: 2026-05-07
**Branch**: `chore/remove-inngest`
**Driven by**: Investigation of why PR #474's Layer 0 dedup prevention didn't fire on the post-deploy cron run. Root cause: an Inngest-cloud-scheduled function `scheduledScrapeAll` (cron `0 6 * * *`) had been running scrapes from off-Mac infrastructure that was using a code path that bypassed the Layer 0 prevention. User policy: nothing scheduled should run off this Mac.

## Why

The local `/scrape` entry point is the canonical scrape runner. After PR #474 merged with `checkForDuplicate`'s Layer 0 lookup, post-deploy verification found 418 fresh `(cinema, source_id, datetime)` duplicate triples reappearing within ~14h — which Layer 0 was supposed to prevent.

Investigation chain:
- Source_ids were byte-identical for known dup pairs (verified via hex dump).
- Datetimes were byte-identical (microseconds = 0).
- The deployed code on `main` had Layer 0.
- The Vercel cron config had no scrape jobs.
- GitHub Actions scrape workflows were commented-out.
- The user's Mac had no `cron`/`launchd`/`pm2`/`bree` schedulers.
- **Inngest was alive** — `src/inngest/functions.ts` registered `scheduledScrapeAll` at `cron: "0 6 * * *"`. Inngest's cloud dashboard schedules HTTP calls to Vercel's `/api/inngest` webhook, which then runs scrapers. That code path apparently used a different insertion route that didn't go through `checkForDuplicate`'s updated signature.

User policy decision: kill *all* off-Mac automation; `/scrape` is the only scrape entry point. Nuclear approach.

## Changes

### Inngest — deleted entirely

- `src/inngest/client.ts`, `src/inngest/functions.ts`, `src/inngest/known-ids.ts` — deleted.
- `src/app/api/inngest/route.ts` — deleted.
- `inngest` npm dep — removed from `package.json`.
- `package-lock.json` — synced.

### Vercel cron — deleted

- `vercel.json` — removed the `crons` block (`cleanup`, `posthog-sync`, `health-check`).
- `src/app/api/cron/cleanup/route.ts`, `src/app/api/cron/posthog-sync/route.ts`, `src/app/api/cron/health-check/route.ts` — deleted along with the cleanup test.
- `verifyCronSecret` helper in `src/lib/auth.ts` — left in place (one-off lib helper, no current consumer, low blast radius if untouched).

### GitHub Actions — schedules removed

- `.github/workflows/social-outreach.yml` — `schedule:` block removed; `workflow_dispatch` still allows manual runs.
- `.github/workflows/scrape.yml` and `.github/workflows/scrape-playwright.yml` — deleted entirely (already commented-out reminders of retired Bree+PM2-era infrastructure; not actually firing).

### `cinema-registry.ts` cleanup

After removing Inngest, the following helpers became dead code (zero external consumers, only their own definitions and the now-deleted test):

- `INNGEST_ID_OVERRIDES` (constant, lines 1331-1349)
- `getInngestCinemaId` (function)
- `getCinemaToScraperMap` (function)
- `requiresPlaywright` (function — also dead, unrelated to Inngest)
- `getInnguestVenueDefinition` (function)
- `getChainCinemaMapping` (function)

All removed. File header comment updated to drop the obsolete cross-references; `getCinemasSeedData` (used by `src/db/migrations/canonicalize-cinema-ids.ts`) preserved.

`src/config/cinema-registry.test.ts` — deleted (only imported the now-removed Inngest helpers).

## Verification

- `npm run test:run` — **890 / 890 passing** (was 894; lost 4 cron route tests).
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 41 warnings (all pre-existing).
- `grep -rln "inngest" src/` — only `src/lib/auth.ts` (kept `verifyCronSecret`) and `src/config/cinema-registry.ts` (1 surviving JSDoc nope, also gone).

## Impact

- **No automation runs off this Mac.** Cinema scraping happens only when the user invokes `/scrape` locally.
- **Inngest cloud dashboard's webhook endpoint will 404** for any inflight scheduled invocations — Inngest's scheduler can't reach our app. Manual cleanup of the Inngest dashboard registration is recommended but not load-bearing (a 404 has no side-effect on Pictures' DB).
- **Vercel Cron deployment will diff** on next push — `vercel.json` no longer registers any crons.
- **Trigger.dev env vars** (`TRIGGER_ACCESS_TOKEN`, `TRIGGER_PROD_SECRET_KEY`, `TRIGGER_SECRET_KEY`) remain in `.env.local` but are unused — Trigger.dev was already removed in a prior PR per the briefing. Left untouched as env-var cleanup is out of scope.

## Out of scope (deliberately)

- **Re-running `dedupe-screening-source-id-duplicates.ts`** to clean the 418 fresh triples — separate operational task, follow-up. Now that the source of new duplicates is plugged, the dedup will hold.
- **Removing `verifyCronSecret`** from `src/lib/auth.ts` — kept as a non-load-bearing helper.
- **Cleaning up Trigger.dev env vars** — separate concern.
- **Manual deletion of the Inngest cloud dashboard registration** — user action, not code.
