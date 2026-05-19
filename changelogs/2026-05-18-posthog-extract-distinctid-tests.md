# Add unit tests for extractDistinctIdFromCookies (exposes regex bug)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/posthog-extract-distinctid.test.ts` (new) — 10 vitest cases pinning the BEHAVIOUR of `extractDistinctIdFromCookies`, including a known bug.

## 🐛 Known bug exposed by these tests
The implementation regex `/ph_[^_]+_posthog=([^;]+)/` does NOT match **real** PostHog cookies. Real PostHog cookies look like:

```
ph_phc_<projectid>_posthog=<urlencoded-json>
```

…i.e. the project key contains an underscore (`phc_<projectid>`). The regex requires the segment between `ph_` and `_posthog` to be underscore-free, so it never matches.

Two tests pin this directly:
- `(BUG) does NOT match real PostHog cookies of the form 'ph_phc_<projectid>_posthog'`
- `(BUG) does NOT match cookies with underscores in the project key portion`

## What this PR does NOT do
- Does NOT fix the regex. The fix is straightforward (`[^_]+` → `.+?` or `[^=]+`) but changes runtime behaviour for the server-side-error-linking feature. Should ship as its own PR with a verified production cookie sample.

## Why pin the broken behaviour
Without these tests, a future maintainer might "fix" the regex without realising the implementation was never working in the first place — and that fix could trigger other latent issues in downstream Sentry/PostHog correlation logic. Pinning the bug makes the issue explicit and audit-able.

## Coverage of the working slice
The function DOES work for cookies of the form `ph_KEY_posthog` where KEY has no internal underscore. That slice is covered (5 cases): canonical extract, mid-string position, parse-error swallow, missing-distinct_id field, null/empty input.

## Changelog deferral note
Per #523-#530.
