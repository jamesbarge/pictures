# Security — Add Zod Input Validation to User API Routes

**Date**: 2026-03-12

## Changes
- Added Zod runtime validation to 4 user API routes
- film-statuses: validates status enum, rating range (0-5), notes length (1000 chars)
- festival follows: validates interestLevel enum, boolean flags
- preferences: validates JSONB structure with array size limits
- sync: validates film status array (max 5000) and preference structures

## Impact
- HIGH: Prevents type confusion and unbounded input attacks
- All user-facing API routes now validate input at runtime, not just TypeScript compile-time
