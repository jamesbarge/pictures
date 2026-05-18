# gitignore Finder-duplicate pattern (root cause fix)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `.gitignore` — add patterns matching macOS Finder duplicate files at any depth:
  ```
  * [2-9].ts
  * [2-9].tsx
  * [2-9].d.ts
  * [2-9].mts
  * [2-9].svelte
  * [2-9].js
  * [2-9].jsx
  * [2-9].mjs
  * [2-9].cjs
  * [2-9].json
  * [2-9].css
  * [2-9].md
  * [2-9].example
  ```

## Context
The root `tsconfig.json` excludes `**/* 2.*`, `**/* 3.*`, AND `**/* 4.*` patterns. The fact that the bandage extends to ` 4.` means Finder duplicates have made it into commits four separate times — each time prompting a defensive tsconfig exclusion rather than a source-level fix.

The duplicates are typically created by Finder's "Duplicate" command (Cmd-D) or by macOS auto-saving a Save-As-rename operation with a numeric suffix to avoid collision. They look like:

- `frontend/vite.config 2.ts` (identical to original — pure duplicate)
- `frontend/src/lib/utils 2.ts` (stale older version of the canonical file)
- `src/lib/data-quality/index 2.ts` (pre-rename snapshot referencing "Trigger.dev" before the migration to "cloud orchestrator")
- `.env.local 2.example` (older env template missing later-added sections)

Some are benign copies; others are silent stale snapshots that confuse code review and `grep`.

## Impact
- **Prevents recurrence**: any future Finder duplicate is unstageable; `git add` and `git commit` will skip them silently.
- **Unlocks tsconfig cleanup**: a follow-up PR can remove the `**/* 2.*`, `**/* 3.*`, `**/* 4.*` exclude entries from `tsconfig.json` since the patterns are now blocked upstream.
- **No effect on currently-committed files**: gitignore only affects untracked files, so this PR is purely a safeguard for new files. The existing tracked codebase is unchanged.

## Verification
Pattern behaviour confirmed against `git check-ignore`:

| Path | Expected | Actual |
|------|----------|--------|
| `foo 2.ts` | ignored | IGNORED |
| `frontend/utils 2.ts` | ignored | IGNORED |
| `src/lib/data-quality/index 2.ts` | ignored | IGNORED |
| `vite.config 2.ts` | ignored | IGNORED |
| `+page 2.svelte` | ignored | IGNORED |
| `.env.local 2.example` | ignored | IGNORED |
| `config.json` | tracked | tracked |
| `normal.ts` | tracked | tracked |
| `foo2.ts` (no space) | tracked | tracked |

## Follow-up
A separate PR will remove the now-redundant `**/* 2.*`, `**/* 3.*`, `**/* 4.*` exclude entries from `tsconfig.json`.

Caveat for that follow-up: the tsconfig excludes serve two purposes — (a) preventing tsc from compiling already-staged duplicates (this PR removes the need for that), and (b) preventing tsc from compiling local-only Finder duplicates that exist in a developer's working tree pre-stage. (b) still applies if someone produces a Finder duplicate locally. Removing the tsconfig excludes is therefore only safe if developers regularly clean stale duplicates from their working trees — or we add a `prebuild` hook that warns on their presence. Worth a sentence in that PR's body.
