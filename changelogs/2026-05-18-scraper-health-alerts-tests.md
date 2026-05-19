# Add unit tests for generateHealthSummary

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/scraper-health/alerts.test.ts` (new) — 7 vitest cases for `generateHealthSummary`.

## Coverage
- Header line present
- ISO timestamp embedded
- Total/Healthy/Warning/Critical counts on one line
- Alerts section OMITTED when empty (avoids "Alerts (0)" noise)
- **Pinned alert-type prefix logic**: `[WARNING]` for warn-types, `[CRITICAL]` for any alertType starting with "critical" (the `alertType.startsWith("critical")` branch)
- Alerts count header `Alerts (N):` rendered when alerts present

## Why
The health summary is what gets posted to the Telegram alert channel and dumped into CloudWatch logs when the nightly scraper health check runs. A regression to the count line breaks the alert-dashboard parser; a regression to the [CRITICAL]/[WARNING] prefix breaks human-eye triage at 3am.

## Changelog deferral note
Per #523-#530.
