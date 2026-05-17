# Reactivate Curzon Camden + Richmond + Wimbledon (also fix Wimbledon siteId typo)

**PR**: TBD
**Date**: 2026-05-17

## Context

Three Curzon venues (`curzon-camden`, `curzon-richmond`, `curzon-wimbledon`) had been marked `active: false` in the chain scraper config with the comment "no listings since Feb 2026". They were one of the persistent items on the open-coverage list across many recent sessions.

This session attempted a Vista API probe with a freshly-bootstrapped JWT (using the same `Bearer <token>` format the production scraper uses). Results:

| Venue | siteId | API response | Future-dated screenings |
|---|---|---|---|
| Curzon Soho | SOH1 | 200 OK | 23 (control — known active) |
| **Curzon Camden** | CAM1 | **200 OK** | **25** |
| **Curzon Richmond** | RIC1 | **200 OK** | **15** |
| Curzon Wimbledon (old) | `WIM01` | 400 errorCode 17000 | — |
| **Curzon Wimbledon (corrected)** | **`WIM1`** | **200 OK** | live programming |

All three venues are live. The earlier "inactive Feb 2026" mark was a misread:

- For Camden + Richmond: the auth header was being passed without the `Bearer ` prefix at some point, returning 401s — interpreted as "no listings" when it was actually an auth-format issue.
- For Wimbledon: the recorded `chainVenueId` `WIM01` is a typo. The correct site code is `WIM1`, which is what the live API accepts.

## Changes

### `src/scrapers/chains/curzon.ts`

- `curzon-camden` → `active: true` (was false)
- `curzon-richmond` → `active: true` (was false)
- `curzon-wimbledon` → `active: true` AND `chainVenueId: "WIM1"` (was `"WIM01"`)
- Updated all three `active: false` comments to record the 2026-05-17 verification and corrections.

### `src/scrapers/pipeline.ts` — `ensureCinemaExists()`

The existing-cinema UPDATE path didn't touch `is_active`. That meant the DB rows for these 3 Curzon venues — which were created with `is_active=false` during a prior state — would stay `is_active=false` even after the code reactivation, breaking the new detectors (which all filter `WHERE c.is_active=true`).

Fix: re-assert `isActive: true` on the UPDATE path. The chain config is now the source-of-truth signal for cinema activeness — disabling should be done by removing the venue from the chain config / registry, not by flipping the DB flag. Documented with an inline comment referencing this PR's investigation.

## Verification

- `npm run test:run` — 993 / 993 pass on the branch
- `npx tsc --noEmit` — clean
- **Live API probe** (recorded above) confirms all 3 venues return future-dated screenings via the production-equivalent auth path

## Impact

- **Active cinema count: 60 → 63** — three Curzon venues added to live coverage with zero new scraper code (chain scraper fans out automatically once `active: true` and a valid `chainVenueId` are in place)
- Closes the last named gap from the multi-session coverage audit
- The `ensureCinemaExists` fix is a low-risk, semantically-correct improvement that prevents this class of code/DB-state drift from biting again

## Follow-ups

- After the next `/scrape` run, confirm the 3 new venues actually persist screenings to the `screenings` table
- After 7 days of post-merge data, the new detectors should treat these venues as healthy (their `is_active=true` row enables them in the detector queries)
