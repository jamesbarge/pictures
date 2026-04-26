# Declare Node engine in package.json

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/node-bump-20-20`

## Changes

Added to root `package.json`:

```json
"engines": {
  "node": "^20.20.0 || >=22.22.0"
}
```

No other files touched.

## Why

Phase 1 (#455) bumped `@posthog/ai` to 7.16.10 and `posthog-node` to 5.30.4. Both packages declare a Node engine of `^20.20.0 || >=22.22.0`. The repo had no `engines` field, so:

- Local devs on Node < 20.20 (or 22.x < 22.22) saw EBADENGINE warnings at install time **without** an actionable signal to upgrade.
- The project's intended runtime requirement was implicit, scattered across deps.

Adding the field surfaces the requirement explicitly. Anyone running `npm install` on a non-conforming Node version now gets a clear warning citing the project's own `engines` declaration.

## What was NOT changed and why

- `.nvmrc` stays at `22`. Local nvm/fnm resolves this to current 22 LTS (well above 22.22), which already satisfies the engine.
- `.github/workflows/*.yml` stay at Node 24 (or `${{ env.NODE_VERSION }} = '24'`). CI deliberately tests on a newer Node than production runtime — that catches forward-compat issues. No reason to drop to 22.
- `frontend/package.json` left without `engines`. The frontend has no deps with stricter Node requirements; over-declaring would just cause noise.

## Verification

- `npm install` re-installs cleanly against the new engines field
- `npm run lint` → 0 errors, 41 warnings
- `npx tsc --noEmit` → clean
- `npm run test:run` → 913/913 pass

## Impact

- Existing CI: unchanged (already on Node 24).
- Existing Vercel deploy: unchanged (Vercel's default Node satisfies the engine).
- Local dev on Node < 20.20: now gets a louder warning. Upgrade path: switch to Node 22 LTS via `nvm use` (the project's `.nvmrc` already points there).
- Phase 2 item 2 from `tasks/todo.md`.
