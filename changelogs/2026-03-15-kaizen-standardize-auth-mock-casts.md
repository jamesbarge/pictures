# Kaizen — Standardize Auth Mock Type Casts

**PR**: #339
**Date**: 2026-03-15

## Changes
- Standardized 46 auth mock type casts across 5 admin API test files
- Replaced verbose `as unknown as Awaited<ReturnType<typeof auth>>` (4 files, 38 instances)
- Replaced verbose `as ReturnType<typeof auth> extends Promise<infer T> ? T : never` (1 file, 8 instances)
- All replaced with concise `as never`, matching the convention already used in 2 other admin test files

## Impact
- Code quality improvement in test files, no behavior changes
- Kaizen category: test-quality
