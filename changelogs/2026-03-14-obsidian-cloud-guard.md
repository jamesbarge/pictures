# Skip Obsidian writes in cloud environments

**PR**: #336
**Date**: 2026-03-14

## Changes
- Added `isCloudEnvironment()` detection to `obsidian-reporter.ts`
- `writeOvernightReport()` and `updateCursor()` return early with a log message when running on Trigger.dev, Vercel, or Railway
- Detection uses `TRIGGER_PROJECT_ID`, `VERCEL`, and `RAILWAY_ENVIRONMENT` env vars

## Impact
- Eliminates two EACCES errors at the end of every Trigger.dev autoquality/autoscrape run
- No impact on local runs (Obsidian reports still written when running from dev machine)
