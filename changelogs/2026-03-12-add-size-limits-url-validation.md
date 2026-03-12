# Security — Add Response Size Limits and URL Protocol Validation

**Date**: 2026-03-12

## Changes
- Added `maxResponseSize` option to `fetchWithRetry()` (default 10MB)
- Added 50MB limit check in BFI PDF fetcher before buffer allocation
- Added URL length validation (2000 char max) to screening validator
- Refined admin screening Zod schema to whitelist http/https protocols

## Impact
- MEDIUM: Prevents memory exhaustion from oversized responses
- Prevents javascript: and data: protocol injection in booking URLs
