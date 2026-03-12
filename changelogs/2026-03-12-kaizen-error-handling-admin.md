# Kaizen — Standardize error handling in admin API routes

**PR**: #171
**Date**: 2026-03-12

## Changes
- `src/app/api/admin/health/route.ts`: Replaced manual console.error + Response.json 500 with `handleApiError`
- `src/app/api/admin/bfi/status/route.ts`: Replaced manual console.error + Response.json 500 with `handleApiError`
- `src/app/api/admin/anomalies/verify/route.ts`: Replaced manual console.error + Response.json 500 with `handleApiError`

## Impact
- Code quality improvement, no behavior changes
- 3 fewer manually-crafted error responses (still ~13 remaining admin routes for future passes)
- Kaizen category: error-handling
