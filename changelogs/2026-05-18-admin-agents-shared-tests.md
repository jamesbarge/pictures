# Add unit tests for admin agent API shared helpers

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/app/api/admin/agents/shared.test.ts` (new) — 7 vitest cases for `geminiKeyMissingResponse` and `agentErrorResponse`.

## Coverage
- geminiKeyMissingResponse: 200 status, success=false, GEMINI_API_KEY mentioned in error message (greppable in admin UI / Vercel logs)
- agentErrorResponse: 500 status, structured fields (success, summary, error), 'Unknown error' fallback for non-Error throwables (string/null/undefined)
- **Pinned log format**: logPrefix is composed as `{prefix} error:` for grepping
- **Pinned summary format**: `{label} failed` suffix for UI parsing consistency

## Why
These two helpers normalise the admin agent route error contract — every admin API for /agents/* uses them. A regression in the response shape silently breaks the admin UI's error-state rendering; a regression in the log prefix breaks the CloudWatch dashboards.

## Changelog deferral note
Per #523-#530.
