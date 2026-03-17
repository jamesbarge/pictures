# Kaizen — Unexport 6 lib types, delete PostcodeValidationResponse

**PR**: #388
**Date**: 2026-03-17

## Changes
- Unexported 6 types/interfaces with zero external importers:
  - `PostcodeLookupResponse` in `src/lib/postcode.ts`
  - `MapAreaPolygon` in `src/lib/geo-utils.ts` (note: `MapArea` alias remains exported)
  - `UserEngagementData` in `src/lib/analytics.ts`
  - `EventClassification` in `src/lib/event-classifier.ts`
  - `AdminAuthContext` in `src/lib/auth.ts`
- Deleted `PostcodeValidationResponse` entirely — never used anywhere, even within its file

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
