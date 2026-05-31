# Root layout: extract duplicated app-shell into a {#snippet}

**PR**: TBD
**Date**: 2026-05-30

## Changes
- In `frontend/src/routes/+layout.svelte`, the `{#if clerkEnabled}` and `{:else}` branches duplicated the app-shell markup verbatim: the `<a class="skip-link">` and the `<div class="min-h-dvh flex flex-col">` containing `<Header cinemas={data?.cinemas ?? []} />`, `<main id="main-content">{@render children()}</main>` and `<Footer />`.
- Defined a `{#snippet shell()}...{/snippet}` covering exactly that shared skip-link + shell `<div>` block, and replaced both inline copies with `{@render shell()}`.
- Left the per-branch provider logic untouched: the Clerk branch still renders `ClerkProvider` wrapping `PostHogProvider`, `SyncProvider`, `GlobalCmdkBinding`, and the conditional lazy `{#if CommandPalette}<CommandPalette />{/if}`; the else branch still renders `PostHogProvider` and `GlobalCmdkBinding` only.

## Impact
- Removes a real drift hazard: the two copies of the shell can no longer diverge.
- No new imports, no dependency changes, no logic changes.

## Behavior preservation
- The snippet captures byte-identical markup to the two previous inline copies; render order within each branch is preserved (providers first, then skip-link + shell).
- `data`, `children`, and `Header`/`main`/`Footer` references inside the snippet resolve to the same component-scope bindings.
- Clerk-only `SyncProvider` and the lazy/conditional `CommandPalette` placement are unchanged.
- Rendered DOM is identical in both the Clerk-enabled and Clerk-disabled paths.
- Verified with `svelte-kit sync` + `svelte-check --threshold error`: 0 errors (the only 2 warnings are pre-existing and in unrelated files).
