# Kaizen — Unexport Internal-Only Rate-Limit Types

**PR**: #283
**Date**: 2026-03-13

## Changes
- Removed `export` from `RateLimitConfig` interface — only used within rate-limit.ts
- Removed `export` from `RateLimitResult` interface — only used within rate-limit.ts

## Impact
- Code quality improvement, no behavior changes
- Reduces public API surface of the module to only what external consumers need
- Kaizen category: dead-code
