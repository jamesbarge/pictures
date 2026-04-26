# Drop unused @chenglou/pretext from frontend deps

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/pretext-bump`

## Changes

- Removed `@chenglou/pretext@^0.0.3` from `frontend/package.json` `dependencies`.

## Why I removed instead of bumped

`tasks/todo.md` item 11 originally said "bump @chenglou/pretext 0.0.3 → 0.0.6". When I started, I grep'd for actual usage and found zero imports:

```bash
grep -rE "@chenglou" --include="*.svelte" --include="*.ts" --include="*.tsx" frontend/src
# (no output)
```

The local `frontend/src/lib/components/pretext/` directory has two Svelte components — `BreathingGrid.svelte` and `FittedTitleCanvas.svelte` — but they don't import `@chenglou/pretext`. They're custom components inspired by the package's typographic style but written from scratch in this codebase.

Same shape as the Anthropic SDK situation in item 1: listed in `package.json` but never used at runtime. Removing is the higher-leverage move:

- One less 0.x dep on the maintenance surface (0.x means any release can be breaking).
- Smaller install footprint.
- No risk of accidentally pulling in a future 0.0.7+ that breaks something.

## Verification

- `npm run check` (svelte-check) → 13 errors, 2 warnings (matches origin/main baseline)
- `npm run dev` boots clean
- `/`, `/cinemas`, `/map`, `/this-weekend` all return HTTP 200 (the routes most reliant on the local Pretext-style components)

## Impact

- Faster cold install in CI.
- Phase 2 item 11 of 12 complete.
- If the codebase ever does want to use the upstream package, re-add as a fresh dep at the then-current version.
