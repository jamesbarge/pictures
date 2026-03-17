# Kaizen — Unexport 5 module-private types

**PR**: #386
**Date**: 2026-03-17

## Changes
- Removed `export` from 5 types/interfaces with zero external importers:
  - `SpotCheckResults` in `src/autoresearch/autoquality/spot-checks.ts`
  - `AuditForDqs` in `src/autoresearch/autoquality/audit-wrapper.ts`
  - `GeminiModelId` in `src/lib/gemini.ts`
  - `GenerateResult` in `src/lib/gemini.ts`
  - `ApiErrorResponse` in `src/lib/api-errors.ts`
- All types are used only within their declaring file (in function signatures)
- External consumers get these types via inference, not direct import

## Impact
- Code quality improvement, no behavior changes
- Reduces module API surface to what's actually consumed
- Kaizen category: dead-code
