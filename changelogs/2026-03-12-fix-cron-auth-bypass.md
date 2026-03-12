# Security — Fix Cron Auth Bypass in Non-Production

**Date**: 2026-03-12

## Changes
- Removed `NODE_ENV === "production"` guard from cron secret verification in cleanup and posthog-sync routes
- All cron routes now verify CRON_SECRET regardless of environment

## Impact
- CRITICAL: Previously preview/staging deployments accepted unauthenticated cron requests
- Now CRON_SECRET is required in all environments
