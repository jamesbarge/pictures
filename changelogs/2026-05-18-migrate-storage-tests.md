# Add unit tests for runAllStorageMigrations (postboxd → pictures rebrand)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/stores/utils/migrate-storage.test.ts` (new) — 7 vitest cases using jsdom localStorage.

## Coverage
- Single-key migration (old → new, old removed)
- Both-keys-present: prefer NEW, clean up OLD
- New-key-only: untouched
- Neither: no-op
- Batch migration of all 7 configured key pairs
- Summary log only fires when ≥1 migration occurred (no noise for fresh installs)
- Idempotent (running twice produces same end state)

## Why
This module runs on every app boot for users who installed the previous "Postboxd" version and now have the "Pictures" rebrand. A regression that drops a migration loses user data (filter settings, film-status preferences, cookie-consent). A regression that overwrites new with old data downgrades fresh users to stale defaults.

The "prefer NEW when both exist" contract is particularly worth pinning — a flipped precedence would silently lose new-user state.

## Changelog deferral note
Per #523-#530.
