# Audit Quick Wins — Auth Hardening, Scraper Cleanup, CI Visibility

**PR**: #TBD
**Date**: 2026-06-10

The first batch of quick wins from the `improve` codebase audit. Five small,
high-confidence findings; the two with infrastructure dependencies were decided
by the maintainer before implementation.

## Changes

### Security — cron secret timing-safe comparison (`src/lib/auth.ts`)
- `verifyCronSecret` previously compared the bearer token to `CRON_SECRET` with
  `===`. Now uses `crypto.timingSafeEqual` with an explicit empty-secret guard
  and a length pre-check (length is not the secret, so an early length reject is
  acceptable). Removes a (low-severity) response-timing side-channel.

### Security — admin allowlist is fail-closed (`src/lib/admin-emails.ts`)
- Removed the hardcoded `DEFAULT_ADMIN_EMAILS = ["jdwbarge@gmail.com"]` fallback.
  `getAdminEmailAllowlist()` now returns `[]` when `ADMIN_EMAILS` is unset or
  parses to zero entries, so a missing or mistyped env var grants **no** admin
  access instead of silently authorising one personal account.
- `ADMIN_EMAILS` is confirmed set in Vercel production, so prod admin access is
  unaffected.
- Updated `src/lib/admin-emails.test.ts` to pin the fail-closed contract.
- Added `process.env.ADMIN_EMAILS = "jdwbarge@gmail.com"` to the global test
  setup (`src/test/setup.ts`): admin route tests mock the current user as that
  address, so the test environment now configures the allowlist explicitly
  rather than depending on a production default.

### Tech debt — scraper v1/v2 runner sprawl (`package.json`, `src/scrapers/`)
- `scrape:curzon`, `scrape:picturehouse`, `scrape:everyman` now invoke the v2
  runner-factory runners (typed, health checks, retry-then-continue) — the same
  path the admin API and registry already use. Previously they ran the inferior
  `@ts-nocheck` v1 runners.
- Deleted the dead v1 runners: `run-curzon.ts`, `run-picturehouse.ts`,
  `run-everyman.ts` (referenced only by the npm scripts above).
- Removed the now-redundant `scrape:curzon-v2` / `-v2` / `-v2` aliases.
- Canonical path (`scrape:unified` → `runScrapeAll`) was already on the v2
  path and is unchanged.

### DX — CI E2E gate visibility (`.github/workflows/test.yml`)
- The E2E job silently skipped the entire Playwright suite when
  `DATABASE_URL_TEST` was absent, and the summary job still reported green — so
  E2E has never actually run in CI.
- Replaced the silent skip with a `::warning::` annotation in both the E2E job
  and the summary job. Non-blocking by design (maintainer's choice): PRs still
  pass, but a green check no longer hides missing E2E coverage. Enforcing the
  gate requires provisioning a test database and adding the `DATABASE_URL_TEST`
  secret — tracked as a follow-up.

### Hygiene (local only, not in this PR)
- Deleted stray untracked files `tsconfig 2.tsbuildinfo` and
  `.env.local 2.example` (macOS "copy 2" duplicates; `*.tsbuildinfo` is already
  gitignored).

## Impact
- **Admins**: no change in prod (ADMIN_EMAILS is set); future misconfiguration
  now fails closed instead of open.
- **Cron routes**: identical behaviour for valid secrets; hardened comparison.
- **Operators running scrapes**: `npm run scrape:chains` / `scrape:all` now use
  the better v2 runners.
- **Contributors**: CI warnings make the missing E2E coverage visible on every
  run instead of silently passing.

## Verification
- `npm run test:run` — 1685 passed (110 files).
- `npm run lint` — 0 errors.
- `npx tsc --noEmit` — no new errors (pre-existing stale `.next` type warnings only).
