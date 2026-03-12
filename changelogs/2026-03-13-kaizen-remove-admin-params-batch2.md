# Kaizen — Remove remaining unused _admin params (batch 2)

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Remove unused `_admin` callback parameter from `withAdminAuth` handlers in 4 remaining admin API routes
- Completes the admin route cleanup arc started in PR #223

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Eliminates final 4 `@typescript-eslint/no-unused-vars` warnings for `_admin`
