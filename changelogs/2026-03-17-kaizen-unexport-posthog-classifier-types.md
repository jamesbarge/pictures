# Kaizen — Unexport 10 module-private types, delete PostHogInsight

**PR**: #387
**Date**: 2026-03-17

## Changes
- Unexported 10 types/interfaces with zero external importers:
  - `PostHogEvent`, `PostHogPerson`, `PostHogSessionRecording`, `PaginatedResponse`, `EventsQueryParams`, `RecordingsQueryParams`, `PersonsQueryParams` in `src/lib/posthog-api.ts`
  - `PosterStrategy`, `ClassificationResult` in `src/lib/content-classifier.ts`
  - `WatchdogResult` in `src/scrapers/festivals/watchdog.ts`
- Deleted `PostHogInsight` entirely — it was never used anywhere, even within its file
- All remaining types are used only within their declaring files in function signatures

## Impact
- Code quality improvement, no behavior changes
- Reduces module API surface to what's actually consumed
- Kaizen category: dead-code
