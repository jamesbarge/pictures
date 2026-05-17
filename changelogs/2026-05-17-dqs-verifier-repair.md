# DQS verifier repair — Barbican selector, Rio fallback, Picturehouse API

**PR**: TBD
**Date**: 2026-05-17

## Changes

- **`verifyBarbicanScreening`** (`scripts/data-check.ts:1102-1124`): replaced the broken `a[href*="/whats-on/"]` selector with a body-text contains-prefix check. Diagnostic probe showed the old selector was matching the site-wide navigation menu items (`"Cinema"`, `"Theatre & dance"`, `"Library"`) instead of film cards, so every screening got `not_found_on_site`. Mirrors the Genesis/Rich Mix pattern that has been working.
- **`verifyRioScreening`** (`scripts/data-check.ts:1045-1085`): the `var Events = {...}` regex no longer matches Rio's page structure (page contains film titles but not the wrapped JSON the old code expected). Kept the JSON-extraction primary path (in case Rio brings it back) but added a body-text fallback so the page-fetched-but-JSON-missing case still produces a `confirmed` when the title is present. Previously this case returned `fetch_error` (excluded from denominator, no signal).
- **`verifyPicturehouseScreening`** (`scripts/data-check.ts:1217-1257`): the `https://www.picturehouses.com/cinema/<slug>` URL pattern 301-redirects to the Picturehouse homepage (probed 2026-05-17 — confirmed via `<title>Redirecting to https://www.picturehouses.com</title>`). The verifier was unwittingly scanning the homepage for film titles on every check. Switched to the same POST JSON API the existing `src/scrapers/chains/picturehouse.ts` scraper already uses: `POST /api/scheduled-movies-ajax` with `cinema_id` form field, mapped from the screening's `cinema_id` via `PICTUREHOUSE_VENUES`. Smoke-tested against Picturehouse Clapham — API returned HTTP 200 with 24 currently-scheduled movies.
- **`tasks/goal.md`** condition #7: ticked the verifier-investigation sub-task with a pointer to this changelog. Added a follow-up sub-task to confirm the post-fix `verificationPassRate` rises above 0.1 over the next two `/data-check` runs. Added two stretch sub-tasks for Curzon (Cloudflare-blocked) and Everyman (URL pattern wrong) — they currently return `fetch_error` and are correctly excluded from the denominator, so they're not blocking the goal.

## Diagnostic process

A one-off probe script (`scripts/_tmp_probe_verifiers.ts`, now deleted) pulled one current production screening per cinema and ran the actual verifier match logic against the fetched HTML. Results:

| Verifier | Status | Notes |
|---|---|---|
| Rio (JSON) | broken | Page fetched (831 KB), title in body, but `var Events` regex did not match. Returned `fetch_error`. |
| ICA | healthy | Selector `.item.films > a` returned 44 candidates, exact match found. |
| Barbican | broken | Page fetched (240 KB), title in body, but selector returned nav menu items. Returned `not_found_on_site`. |
| Close-Up | n/a | No future Close-Up screenings in DB to probe. |
| Genesis | healthy | Body-text fallback matched. |
| Rich Mix | healthy | Body-text fallback matched. |
| Curzon | fetch_error | Cloudflare-blocked, returns `null` from fetch. Correctly excluded from denominator. |
| Picturehouse | broken | Page fetched (369 KB) but actually the homepage (URL redirected). Title absent. Returned `not_found_on_site`. |
| Everyman | fetch_error | Fetch returned null. Correctly excluded. |

Three broken → patched. Two `fetch_error` paths → left alone (already exclude correctly from denominator). Three healthy → untouched.

## Why this matters

Condition #7 in `tasks/goal.md` (DQS floor ≥ 85) was failing at composite 76.62/77.42 because `verificationPassRate` was structurally 0. The /goal slash command (PRs #497, #502, #503) deferred condition #7 as a measurement artefact rather than treating it as a real product failure. This PR closes that loop: with three of the broken verifiers patched and Picturehouse — the highest-volume chain in the verification sample — now using a working API, `verificationPassRate` should rise to a healthy value the next time `/data-check` runs.

When the post-fix DQS scores land in `.claude/data-check-learnings.json`, `goal-check-dqs.ts` will exit the deferral branch (`verificationPassRate > 0.1`) and compare the original `compositeScore` against the 85 floor. Both should pass.

## Impact

- **No producer-side weight changes**: the composite formula in `data-check.ts:1722` is unchanged. Only the inputs to that formula change.
- **No DB writes**: verifiers are read-only against external HTTP endpoints.
- **No new dependencies**: imports `PICTUREHOUSE_VENUES` which already lives in `src/scrapers/chains/picturehouse.ts`.
- **No frontend or pipeline changes**.

## Verification

- `npx tsc --noEmit` clean.
- `npx eslint scripts/data-check.ts` clean (the one warning at line 1650 is pre-existing on an unrelated `any` cast).
- Diagnostic probe (deleted) confirmed Barbican's body contains the title; Rio's body contains the title; ICA/Genesis/Rich Mix continue to match.
- Direct API smoke-test against `/api/scheduled-movies-ajax` for Picturehouse Clapham returned 200 with 24 movies — confirming the API endpoint is reachable and the request shape is correct.

## Follow-ups (queued as sub-tasks in `tasks/goal.md`)

1. After two `/data-check` cycles, verify `verificationPassRate` is above 0.1 and condition #7 is genuinely passing on the recorded `compositeScore`.
2. (Stretch) Fix Curzon verifier — needs Cloudflare bypass (likely the persistent-context approach from the BFI fix in PR #488).
3. (Stretch) Fix Everyman verifier — needs the correct venue URL pattern.
