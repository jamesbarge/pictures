# Add phoenix legacy alias to Inngest known IDs

**PR**: #426
**Date**: 2026-04-16

## Changes
- Added `"phoenix"` as a legacy alias in `SCRAPER_REGISTRY_IDS` alongside `"phoenix-east-finchley"`
- Mirrors the existing pattern where `"nickel"` is a legacy alias for `"the-nickel"`

## Impact
- Fixes 2 failing contract tests in `cinema-registry.test.ts` that validate every active cinema resolves to an Inngest-known ID
- Combined with #425 (directors route TS fix), this should bring CI on main to fully green
