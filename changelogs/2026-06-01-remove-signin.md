# Temporarily remove sign-in from the site

**PR**: TBD
**Date**: 2026-06-01

## Why
The production **frontend** Vercel project's `PUBLIC_CLERK_PUBLISHABLE_KEY` is a development
`pk_test_…smooth-prawn-4` key, so Clerk's hosted `<SignIn />` widget renders blank/broken. Rather
than ship a dead sign-in flow, sign-in is removed from the UI until a `pk_live_` key is configured.

## Changes
- `frontend/src/lib/components/layout/Header.svelte`: removed the desktop and mobile "Sign in" links
  and their now-dead `.sign-in-link` CSS. (Kept the nav divider as a separator before the controls.)
- `frontend/src/routes/sign-in/[...rest]/+page.ts` (new) and `sign-up/[...rest]/+page.ts` (new):
  `load` that `307`-redirects to `/`, so direct navigation to the broken widget isn't possible.
- `frontend/src/routes/sitemap.xml/+server.ts`: drive-by fix of a `svelte-check` type error — the
  film source was a union of two array shapes, and `'updatedAt' in f` narrowed the no-`updatedAt`
  branch to `unknown`. Collapsed both sources to a single `FilmRef` type and read `f.updatedAt`
  directly (guarded by `toLastmod`).

## What is intentionally NOT changed
- `ClerkProvider` / `SyncProvider` stay mounted in `+layout.svelte`. Components that depend on Clerk
  context (e.g. `FollowButton`, status sync) keep working; they simply render nothing / no-op while
  no one is signed in. The watchlist still works via localStorage. Re-enabling auth = set the
  `pk_live_` key, restore the header links, and delete the two redirect files.

## Verification
- `npx svelte-check` → 0 errors (was 1, now fixed; 2 pre-existing unrelated warnings remain).
- Header grep confirms no `sign-in` / `SIGN IN` references remain.

## Impact
- Frontend-only → auto-deploys on merge. Users no longer see a broken sign-in entry point.
