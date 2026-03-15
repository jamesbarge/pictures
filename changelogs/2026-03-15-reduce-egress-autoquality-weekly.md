# Reduce Supabase Egress — AutoQuality Back to Weekly

**PR**: #361
**Date**: 2026-03-15

## Changes
- Reverted AutoQuality cron from `0 2 * * *` (daily) to `0 2 * * 0` (weekly Sunday)
- Task ID changed from `autoquality-daily` back to `autoquality-weekly`
- Reduced MAX_EXPERIMENTS from 5 to 3 per run
- Updated schedule references in QA orchestrator and data-quality rules

## Impact
- Supabase Free Plan egress exceeded 461% (23 GB / 5 GB). Services restricted with 402 responses.
- Each AutoQuality run does 1 baseline + N experiment audit passes (full films + screenings joins)
- Daily with 5 experiments = ~180 full audit passes/month
- Weekly with 3 experiments = ~16 full audit passes/month (11x reduction)
- AutoQuality still runs weekly, accumulating learning via DB-backed thresholds
- Other daily tasks (enrichment sweep, QA orchestrator) remain unchanged as they provide direct user-facing value

## Root Cause
Moving from weekly to daily AutoQuality (PR #337) without accounting for Supabase egress limits. Each experiment's `runAuditForDqs()` queries all films with upcoming screenings across multiple passes.
