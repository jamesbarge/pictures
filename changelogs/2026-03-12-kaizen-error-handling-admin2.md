# Kaizen — Adopt handleApiError in remaining admin catches

**PR**: #179
**Date**: 2026-03-12

## Changes
- `src/app/api/admin/cinemas/[id]/config/route.ts`: Replaced GET handler's manual catch with `handleApiError`
- `src/app/api/admin/screenings/[id]/route.ts`: Replaced DELETE handler's manual catch with `handleApiError`

## Impact
- Both files already imported `handleApiError` for other handlers but had remaining manual catches
- Brings these files to 100% `handleApiError` adoption (all catch blocks now use the shared pattern)
- Code quality improvement, standardizes error handling
- Kaizen category: error-handling
