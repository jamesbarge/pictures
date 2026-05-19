# Add unit tests for pure functions in src/lib/auth.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/auth.test.ts` (new) — 10 vitest cases covering `unauthorizedResponse`, `forbiddenResponse`, and `verifyCronSecret`.
- Skips the Clerk-dependent functions (`getCurrentUserId`, `requireAuth`, `requireAdmin`, `withAdminAuth`) which need auth-context mocking.

## Coverage (security-critical: `verifyCronSecret`)
- Happy path: `Bearer <correct-secret>` → true
- Missing authorization header → false
- Mismatched token → false
- **Pinned case-sensitivity**: lowercase `bearer ` is NOT stripped — only literal `Bearer `. Captured so a refactor to a case-insensitive regex (`.replace(/^Bearer\s+/i, "")`) gets flagged as a behaviour change.
- CRON_SECRET unset + empty bearer → false (no accidental "undefined === undefined" bypass)
- CRON_SECRET unset + no header → false
- Bare `Bearer` (no trailing space) → false
- Repeated `Bearer Bearer …` → false (single-pass `.replace`)

## Why
`verifyCronSecret` gates every cron route. A weakened auth check is exactly the kind of regression where every test you write is a security win. The Bearer-prefix case-sensitivity is particularly worth pinning — it's the kind of thing a casual "let me make this more forgiving" PR could change without realising the impact.

The unauthorizedResponse / forbiddenResponse tests are tiny but pin the canonical error JSON body so a refactor doesn't accidentally change the API response shape (which would break frontend error parsing).

## Changelog deferral note
Per #523-#530.
