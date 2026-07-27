# Remove Clerk entirely from pictures.london

**PR**: TBD
**Date**: 2026-07-27
**Branch**: `fix/remove-clerk-from-frontend`

## Why

This came out of a PostHog-driven review of what to fix and build next. Auth turned out to be
the clearest call in the dataset: it had **zero measurable users while actively causing the
site's largest source of client errors**.

### Nobody was using it

| window | metric | value |
|---|---|---|
| last 90d | total persons | **1,492** |
| last 90d | persons with `$is_identified = true` | **0** |
| last 90d | persons with a non-empty `person.properties.email` | **0** |

`$identify` over 180 days: 424 events from just 7 distinct persons, **last fired 2026-04-26**.
The PostHog `User Signed Up` action and `Registered Users` cohort (both created 2026-01-04)
reference a signup event that has never existed in the project taxonomy, so they are
permanently empty.

### It was the site's biggest crash

Production served the Clerk publishable key `pk_test_c21vb3Ro…`. Clerk encodes the frontend API
domain in the key, so it decodes directly:

```bash
curl -s https://www.pictures.london/ | grep -oE "pk_test_[A-Za-z0-9=]+" | head -1 \
  | sed 's/pk_test_//' | base64 -d
# → smooth-prawn-4.clerk.accounts.dev
```

That is a Clerk **development** instance, live on the production domain (while the page also
referenced the production satellite `clerk.pictures.london`). clerk-js/clerk-ui failed to load,
producing an unhandled exception for **337 of 496 (68%) of all `$exception` events in 30 days**,
one per user, concentrated on `/` and `/cinemas/everyman-canary-wharf` / `-baker-street`.

Two things kept this hidden:

1. **The bad value is in Vercel's environment, not the repo.** Both `.env.local` and
   `frontend/.env.local` correctly hold `pk_live_`, so nothing in code review or a local run
   would reveal it.
2. **posthog-js autocapture never populates `$exception_type` / `$exception_message`** — those
   are written only by the legacy Sentry integration path. Both were NULL for 495 of 496 events,
   which reads as broken instrumentation. The payload was in `$exception_list` all along, and
   PostHog's Error Tracking had correctly grouped these into 9 issues.

### It was already half-removed

`sign-in/[...rest]/+page.ts` already 307-redirected home, with the comment: *"the prod Clerk key
is a dev `pk_test_` key, so the hosted SignIn widget renders blank"*. So the dev key had been
diagnosed for the sign-in widget but never connected to the crashes or the bundle cost. No
header link, no `UserButton`, no `SignedIn`/`SignedOut` anywhere — the UI had **no auth entry
point at all**, while still shipping ~420KB of eager Clerk JS on every page load.

## Changes

18 files, **+23 / −536**.

**Deleted**
- `frontend/src/lib/stores/SyncProvider.svelte` — the only `useClerkContext()` consumer in the layout
- `frontend/src/lib/stores/sync.svelte.ts` — server sync, inert without a Clerk token getter
- `frontend/src/lib/components/festivals/FollowButton.svelte`
- `frontend/src/hooks.server.ts` — contained nothing but the Clerk handler and its handshake workaround

**Edited**
- `routes/+layout.svelte` — dropped `ClerkProvider`, `PUBLIC_CLERK_PUBLISHABLE_KEY` and the
  `clerkEnabled` conditional. The `{#snippet shell()}` indirection existed only to avoid
  duplicating markup across the two Clerk branches, so with one branch the shell is now inlined.
- `lib/analytics/posthog.ts` — removed `identifyUser`, `resetUser`, `isAdminEmail`,
  `ADMIN_EMAILS`, `adminOptedOut`, `isAdminOptedOut`, and `trackSyncInitiated` /
  `trackSyncCompleted` / `trackSyncFailed` (all Clerk-driven or sync-only).
- `lib/analytics/PostHogProvider.svelte` — dropped the now-unreachable `isAdminOptedOut()` guard.
- `lib/stores/film-status.svelte.ts` — removed the `pushFilmStatus` import and its 3 call sites,
  plus `setStatusLocal`.
- `routes/festivals/[slug]/+page.svelte` — removed `FollowButton`.
- `app.d.ts` — removed the Clerk `AuthObject` import and the `App.Locals` auth interface.
- `app.html` — removed the `clerk.pictures.london` preconnect and dns-prefetch.
- `routes/{sign-in,sign-up}/[...rest]/+page.svelte` — reduced to no-Clerk stubs.
- `package.json` / `.env.example` — dropped `svelte-clerk` and the Clerk env vars.

## Decisions worth recording

**`/sign-in` and `/sign-up` routes are kept, not deleted.** Both `+page.ts` files still
307-redirect home so existing links, bookmarks and indexed URLs don't start 404ing.
`tests/mobile.spec.ts:84` asserts `/sign-in` redirects with a status under 400 — deleting the
routes would have 404'd and failed it. SvelteKit needs a `+page.svelte` for the route to
resolve, so each is now a comment-only stub carrying `noindex`.

**`sync-contract.ts` is retained.** It has no Clerk coupling, has its own passing test, and
documents the server-side film-status wire format if accounts ever return. Deleting it would
have meant removing a green test for no benefit.

**The admin analytics opt-out is gone, and this is not a behaviour change.** `adminOptedOut` was
only ever set inside `identifyUser`, which only Clerk drove — so it has been unreachable since
sign-in was redirected. Excluding internal traffic belongs at the PostHog project level
(*Filter out internal and test users*), not in app code keyed on an auth system that no longer
exists.

**Film status is unchanged for users.** It was always localStorage-first; the server push only
ran when signed in, which no one was.

## Verification

| check | result |
|---|---|
| `npm run check` (svelte-check) | **0 errors**, 4 warnings (all pre-existing, in untouched files) |
| `npm test` (vitest) | **86 passed** / 9 files |
| `npm run build` | clean, adapter-vercel ok |
| `grep -ri clerk .svelte-kit/output/client/` | **no matches** — Clerk fully absent from the client bundle |
| `grep -c svelte-clerk package.json package-lock.json` | 0 / 0 |
| frontend E2E (`E2E_PREVIEW=1`, prod API) | **197 passed, 1 failed, 2 flaky, 6 skipped** |
| `--grep "sign-in is gone"` | **2 passed** (chromium + mobile-small) |

The single E2E failure — `poster-hydration.spec.ts` → *"posters stay with their own film across
hydration: /this-weekend"* — **reproduces identically on `8c9f086e`, the parent commit**
(1 failed / 1 passed / 2 skipped, both before and after). It is therefore pre-existing and
unrelated. Cause: the test advances the page clock past the last screening of the first rendered
day and asserts cards remain; run on a Monday, `/this-weekend` renders only next weekend, so
skewing past its first day legitimately empties the window. The test guards `baseline.length === 0`
as "legitimately empty outside its window" but applies no equivalent guard post-skew.

## Impact

- **Users**: ~68% of client-side crashes disappear. `/festivals/[slug]` stops hard-crashing.
  ~420KB of eager JS no longer loads. No feature is lost — there was no reachable auth UI.
- **Analytics**: the `$exception` volume should drop sharply; the remaining exceptions become
  worth triaging instead of drowning in Clerk noise. `Registered Users` / `User Signed Up` in
  PostHog are now formally dead and can be archived.
- **Not affected**: the root Next.js app (`api.pictures.london` + admin) still uses Clerk for
  admin auth, `/api/webhooks/clerk` and `/api/user`. Untouched by design.

## Follow-ups (not in this change)

1. Clean up the dead `Registered Users` cohort and `User Signed Up` action in PostHog.
2. Remove `PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` from the **frontend** Vercel
   project's env (harmless now, but misleading). Leave the root project's Clerk vars alone.
3. Re-triage the remaining `/` and `/cinemas/*` exceptions once Clerk noise is gone.
4. If accounts are ever wanted again, treat it as a fresh product decision with a `pk_live_`
   key, a signup event in the taxonomy, and a lazy-loaded provider — not a revert.
