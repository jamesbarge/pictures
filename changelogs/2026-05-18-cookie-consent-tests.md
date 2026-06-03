# Add unit tests for cookie-consent Zustand store

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/stores/cookie-consent.test.ts` (new) — 9 vitest cases covering all actions + helpers.

## Why
The cookie-consent store gates analytics tracking under PECR/UK-GDPR. A regression in `canTrack()` either:
- Tracks users who rejected (legal risk, ICO complaint surface)
- Doesn't track users who accepted (no analytics data, broken funnel reporting)

The `hasDecided()` predicate controls when the consent banner shows — a regression silently shows the banner to users who already chose.

## Coverage
- Initial state: 'pending' + null timestamp
- acceptAnalytics: status + stamped timestamp
- rejectAnalytics: status + stamped timestamp
- resetConsent: reverts to pending + null
- hasDecided: true for accepted/rejected, false for pending
- **Pinned `canTrack()` contract**: returns true ONLY for 'accepted' (NOT for 'pending', NOT for 'rejected')
- Persistence: state survives across getState() calls (persist middleware contract)

## Changelog deferral note
Per #523-#530.
