# Kaizen — Remove unused _admin params from admin route handlers

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_admin` callback parameter from `withAdminAuth` handlers in 5 admin API routes
- These routes only needed the auth guard effect, not the admin user data
- TypeScript allows omitting trailing callback parameters, so removing `_admin` is type-safe

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Eliminates 5 ESLint `@typescript-eslint/no-unused-vars` warnings
