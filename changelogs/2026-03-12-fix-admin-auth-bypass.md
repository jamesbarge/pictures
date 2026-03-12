# Security — Fix Admin Auth Bypass

**Date**: 2026-03-12

## Changes
- Deleted root `middleware.ts` passthrough that shadowed `src/middleware.ts`
- Migrated `src/app/api/admin/bfi-import/route.ts` from `requireAuth()` to `withAdminAuth()`

## Impact
- CRITICAL: Previously any authenticated user could access admin API endpoints
- Now all admin routes are properly gated by email allowlist via middleware + withAdminAuth()
