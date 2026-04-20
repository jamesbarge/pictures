# Fix PostHog opt-in guard that blocked all event capture

**PR**: TBD
**Date**: 2026-04-19
**Branch**: `fix/playwright-tests-v2a`

## Symptom
PostHog captured zero custom events from pictures.london in production — including `film_viewed`, `booking_link_clicked`, `screening_card_clicked`, `search_performed`, `filter_changed`, `cinema_viewed`, `film_status_changed`, `calendar_export_clicked`, and all sync lifecycle events. Autocapture, pageviews, and web-vitals were also blocked for any user who accepted consent.

## Root cause
In `frontend/src/lib/analytics/PostHogProvider.svelte`, the consent `$effect` short-circuited before calling `opt_in_capturing()`:

```ts
if (decision === 'enable') {
  // Don't re-enable if admin was opted out by identifyUser()
  if (posthogLib.has_opted_out_capturing()) return;
  posthogLib.opt_in_capturing();
  ...
}
```

The `has_opted_out_capturing()` check was meant to preserve admin opt-out (done inside `identifyUser()` for `jdwbarge@gmail.com`). But in `posthog.ts` we init PostHog with `opt_out_capturing_by_default: true` — and posthog-js's `has_opted_out_capturing()` falls back to that default setting when no explicit decision has been stored. So for every default user with no prior PostHog state, `has_opted_out_capturing()` returned `true`, the effect early-returned, and `opt_in_capturing()` was never called.

Introduced in PR #422 / commit `c448a2be` (2026-04-11) — the commit message explicitly names this check as a "fix: admin opt-out race condition", but the fix has the opposite effect.

## Evidence
Live-browser verification on production pictures.london before the fix:
- After clicking "Accept All" on the cookie banner → 120s of observation.
- Only network hits: `/ingest/array/.../config` (200, once) + `/ingest/api/surveys/` (404, polling).
- Zero POSTs to `/ingest/e/`, `/ingest/batch/`, `/ingest/flags/`, `/ingest/decide`.
- No `posthog_*` / `ph_*` keys in `localStorage` despite `opt_in_capturing()` being supposed to persist opt-in state and upgrade persistence to `localStorage+cookie`.

## Fix
Disentangle admin opt-out from PostHog's by-default opt-out state by tracking admin opt-out explicitly.

### `frontend/src/lib/analytics/posthog.ts`
- Add `let adminOptedOut = false` module flag.
- Export `isAdminOptedOut()` getter.
- Set `adminOptedOut = true` inside `identifyUser()` when `isAdminEmail(email)` matches, alongside the existing `opt_out_capturing()` + `reset()` calls.

### `frontend/src/lib/analytics/PostHogProvider.svelte`
- Replace `if (posthogLib.has_opted_out_capturing()) return;` with `if (posthogModule?.isAdminOptedOut()) return;`.

## Verification
Local dev server with Pictures project key in `.env.local`:
1. Clear localStorage → navigate to `/` → consent banner appears.
2. Click "ACCEPT ALL".
3. Confirmed:
   - `localStorage` now has `__ph_opt_in_out_phc_m9yV…pgN` and `ph_phc_m9yV…pgN_posthog` keys.
   - `consent` status = `accepted`.
   - Network POSTs fire to `/ingest/flags/` and `/ingest/e/` with token `phc_m9yV…pgN` (Pictures project).
   - Events captured: `$opt_in`, `$autocapture`, `$pageview`, `$exception` (via `trackException()` — proving the custom-track wrappers reach the wire).
4. Local 404s on `/ingest/*` are expected in dev (Vercel's `vercel.json` rewrites are only applied in preview/prod).

## Impact
- All custom events wired up in PR #422 will start flowing in PostHog immediately after deploy.
- 8 days of lost data between 2026-04-11 (PR #422 merge) and 2026-04-19 (this fix) are unrecoverable.
- Admin opt-out for `jdwbarge@gmail.com` continues to work unchanged — `identifyUser()` sets the new `adminOptedOut` flag, and the consent effect still respects it.

## Related
- PR #422: "restore PostHog analytics with GDPR consent" (introduced the regression)
- Pictures PostHog project token: `phc_m9yVROnvEmJSiJWfGXy3FQszpIyhcOMZi3xKxhvnpgN` (already deployed in Vercel env — no env change required)
