# Kaizen — Promote failure-condition logs to console.warn

**PR**: #157
**Date**: 2026-03-12

## Changes
- Promoted 5 `console.log` calls to `console.warn` where they report failure conditions, missing configuration, or rate limiting
- Follows the convention: `console.log` = INFO, `console.warn` = WARNING for log aggregation filtering

## Files Modified
- `src/lib/posters/service.ts` — "No image found" and "No poster found" now warn-level (search failures)
- `src/lib/scraper-health/alerts.ts` — "Slack webhook not configured" and alert fallback logging now warn-level
- `src/lib/event-classifier.ts` — Rate limit backoff message now warn-level

## Impact
- Code quality improvement, no behavior changes
- Better log level filtering in production monitoring
- Kaizen category: console-cleanup
