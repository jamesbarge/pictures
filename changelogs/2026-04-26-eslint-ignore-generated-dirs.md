# Add generated-dir ignores to ESLint config

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/eslint-ignore-generated-dirs`

## Changes

Added four patterns to `globalIgnores()` in `eslint.config.mjs`:

- `.trigger/**` — Trigger.dev's `.trigger/tmp/build-*/` build artifacts
- `.vercel/**` — root Vercel build output (when present locally)
- `frontend/.svelte-kit/**` — SvelteKit's `prepare` / `sync` output (`ambient.d.ts`, `non-ambient.d.ts`, `types/`, `output/`)
- `frontend/.vercel/**` — frontend Vercel build output

`.next/**` already covered Next's typegen — no change needed there.

## Why

During PR #455 verification I burned ~1 hour chasing **251 phantom lint errors** that turned out to be entirely from generated code in dirs ESLint wasn't told to ignore:

- 122 `@typescript-eslint/no-this-alias` errors — all in `frontend/.vercel/output/functions/.../catchall.func/.svelte-kit/output/server/...`
- 22 `react-hooks/rules-of-hooks` errors — all in SvelteKit's compiled SSR output
- 81 errors after partial cleanup — `frontend/.svelte-kit/types/...`, `frontend/.svelte-kit/non-ambient.d.ts`

A clean checkout passed lint cleanly because none of those generated dirs existed yet. The fix is mechanical: add the patterns and the false positives disappear.

## Verification

In a fresh worktree at `origin/main`, after running `cd frontend && npm install` (which populates `.svelte-kit/`):

| | Before fix | After fix |
|---|---|---|
| `npm run lint` | 251 problems (81 errors, 170 warnings) | 41 problems (0 errors, 41 warnings) |

The "after" state matches a clean checkout exactly — meaning `eslint.config.mjs` now produces deterministic results regardless of which generated artifacts happen to be on disk.

## Impact

- The next dep-update author won't waste time on this red herring.
- CI behavior unchanged (CI starts from a clean checkout, so it never had the artifacts anyway). Local dev is the only winner.
- Phase 2 item 13 from `tasks/todo.md`.
