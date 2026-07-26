# Frontend E2E suite now runs in CI

**PR**: #738
**Date**: 2026-07-26

## Why

PR #736 fixed a hydration bug that left 31 of 40 homepage cards wearing another
film's poster in production. CI was green for the entire life of that bug. This
change makes the suite that would have caught it actually run.

## The gap was not the missing secret

`.github/workflows/test.yml` gated its `E2E Tests` job on a `DATABASE_URL_TEST`
secret, found it unset, skipped, and reported "pass in 6s" — and `test-summary`
explicitly accepted `skipped` as success. The obvious fix is to add the secret.
That would have been wrong.

There are two Playwright suites in this repo:

| | root `e2e/` | `frontend/` |
|---|---|---|
| Tests | 43 | 103 |
| Target | `localhost:3000` — the legacy Next.js UI | `localhost:5173` — SvelteKit, i.e. pictures.london |
| Wired into CI | yes (the job that skipped) | **no — no npm script, no job** |
| Needs a database | yes | no |

Adding `DATABASE_URL_TEST` would have lit up 43 tests against a UI that is not
the product, while leaving the 103 tests covering pictures.london unrun — a
green "E2E Tests ✓" that looks like real coverage. Worse than the skip.

The frontend suite needs no database at all: `frontend/vite.config.ts` proxies
`/api` to `API_PROXY_TARGET`, which can point at `https://api.pictures.london`.

## Changes

### Made the suite portable
Four of five specs opened with `const BASE = 'http://localhost:5173'` and called
`page.goto(BASE)`, so Playwright's `baseURL` was dead config and the suite could
not be pointed anywhere else. This — not the secret — is why it never entered
CI. `BASE` now comes from `frontend/tests/base-url.ts`, overridable via
`E2E_BASE_URL`.

### CI drives the built bundle, not the dev server
`vite dev` compiles routes on demand, so a first visit is slow enough that a
click can land before SvelteKit hydrates. Five specs were flaky for exactly this
reason, and a cold CI runner is slower than a warm laptop. `E2E_PREVIEW=1` runs
the suite against `vite build` + `vite preview` instead. `preview.proxy` was
added to `vite.config.ts` because the Vercel `/api` rewrite only exists in
production.

Measured on the same machine, same commit:

| | dev server | preview build |
|---|---|---|
| Result | 3 failed, 5 flaky, 191 passed | **0 failed, 0 flaky, 199 passed** |
| Wall clock | 3.7 min | 2.1 min |

### Fixed the two real test failures
- **`test-all.spec.ts` FORMAT (35mm)** — clicked `getByRole('checkbox')`, which
  resolves to an `.sr-only` input that the painted `.checkbox-box` span
  intercepts; the click could never land. Now uses the `openToolbarPanel` helper
  and clicks the visible `.checkbox-row`, matching the WHERE test beside it.
- **`poster-hydration.spec.ts`** — its precondition asserted the clock skew
  *reduces* the card count. The listing renders a rolling day window, so
  expiring the first day rolls a later one in; on 2026-07-26 that was 60 cards
  for today against 67 for tomorrow, and the test failed despite all 31 common
  cards having shifted index. The assertion encoded "tomorrow is quieter than
  today" — a property of London's listings, not of the bug. It now asserts the
  rendered id sequence changed, plus that cards common to both renders exist, so
  the poster comparison can never pass vacuously.

### A real bug the new gate caught immediately
Running the suite without a Clerk key — which is how CI runs it — failed all
five command-palette tests. `src/routes/+layout.svelte` had two branches:

```svelte
{#if clerkEnabled}
  <ClerkProvider …>
    <PostHogProvider /> <SyncProvider /> <GlobalCmdkBinding />
    {#if CommandPalette}<CommandPalette />{/if}   ← only here
    {@render shell()}
  </ClerkProvider>
{:else}
  <PostHogProvider /> <GlobalCmdkBinding />        ← CommandPalette missing
  {@render shell()}
{/if}
```

With Clerk unconfigured, `GlobalCmdkBinding` still bound ⌘K but the palette was
never mounted, so pressing it did nothing. The repo describes this conditional
as "graceful degradation when unconfigured"; it silently removed search.
Production configures Clerk so users were unaffected, but any preview deploy or
Clerk-less dev session lost ⌘K.

Only `SyncProvider` consumes `useClerkContext()`, so the fix is to declare the
Clerk-independent components once, outside the conditional, rather than
duplicating them across branches that can drift.

### Made the gate honest
`test-summary` now fails when `frontend-e2e` is anything other than `success` —
a skip counts as failure, because that suite needs no secrets. The legacy
Next.js job is left exactly as it was, still optional, but is no longer counted
as E2E coverage, and its skip message no longer claims the Playwright suite
didn't run.

## Impact

- Every PR now runs 103 tests × 2 device projects against pictures.london.
- No new secrets required. `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_POSTHOG_KEY`
  default to empty, which disables Clerk and PostHog — verified that an
  explicit empty value overrides `.env.local` and that the real key appears in
  0 files of the resulting build.
- Adds roughly 100 page loads per CI run against `api.pictures.london`.

## REQUIRED follow-up: branch protection

Branch protection on `main` currently requires these checks by name:

```
Unit & Integration Tests, E2E Tests, Vercel – filmcal2, Vercel – frontend
```

Two consequences:

1. **The legacy job keeps the display name `E2E Tests` deliberately.** GitHub
   matches required checks by name, so renaming it would leave every PR waiting
   forever on a check that can no longer report. Rename it only in the same
   change that updates the ruleset.
2. **`Frontend E2E (pictures.london)` is not yet a required check, and neither
   is `Test Summary`.** Until the ruleset is updated the new gate is advisory —
   a PR can go red on the frontend suite and still be mergeable. Add both:

   ```
   gh api -X PATCH repos/:owner/:repo/branches/main/protection/required_status_checks \
     -f 'contexts[]=Unit & Integration Tests' \
     -f 'contexts[]=Frontend E2E (pictures.london)' \
     -f 'contexts[]=Test Summary' \
     -f 'contexts[]=Vercel – filmcal2' \
     -f 'contexts[]=Vercel – frontend'
   ```

## Known risks accepted

- **Production API rate limits.** SSR in `frontend/src/lib/server/api.ts` calls
  `api.pictures.london` directly, and `/api/cinemas` (100/min) and
  `/api/films/search` (30/min) are rate limited per client IP — one GitHub
  runner is one IP. Measured on 2026-07-26: 120 concurrent `/api/cinemas` and 60
  concurrent `/api/films/search` requests all returned 200, and three full
  206-test runs passed with zero failures, because the limiter currently fails
  open to a per-instance in-memory fallback (the Upstash quota follow-up from
  the 2026-05-30 incident). So this is latent, not active — but restoring the
  Upstash quota could start 429ing CI. A `concurrency` group with
  `cancel-in-progress` limits the blast radius; recorded fixtures or a CI bypass
  token would remove it properly.
- **CI only exercises the Clerk-disabled layout branch.** Production renders the
  `{#if clerkEnabled}` branch; CI renders `{:else}`. A regression confined to the
  Clerk branch is invisible to this gate.

## Pre-existing bug found while doing this (not fixed here)

`useClerkContext()` throws when no `ClerkProvider` is mounted
(`svelte-clerk/dist/context.js`). `festivals/FollowButton.svelte` calls it and is
rendered unconditionally by `festivals/[slug]/+page.svelte:37`, which sits inside
the Clerk-less `{:else}` branch. So **`/festivals/[slug]` hard-crashes whenever
Clerk is unconfigured** — including in the configuration CI now builds. No test
visits a festival detail page, so the gate is green over it. Fixing it is a
product call (should following a festival degrade to a sign-in prompt, or should
the button be hidden?), so it is left alone and flagged here.

## Not done

- The legacy root `e2e/` suite (43 tests) is untouched. Whether the Next.js
  frontend is still meant to be tested is a separate product question.
- The 7 skipped tests are data-conditional guards (no 35mm on the homepage
  today, `/this-weekend` empty outside its window). They are honest skips, but
  it does mean coverage varies with London's listings.
