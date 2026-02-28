# CR-04: Admin Auth Middleware Factory

**Date**: 2026-02-28
**Branch**: `cr04-admin-auth-middleware`
**Type**: Refactor (no behavior change)

## Summary

Extracted the repeated `requireAdmin()` + `instanceof Response` boilerplate into a `withAdminAuth()` higher-order function. Every admin API route previously duplicated these 3 lines; now they use a single-line wrapper.

## Changes

### New: `withAdminAuth()` in `src/lib/auth.ts`

```typescript
export function withAdminAuth<C = unknown>(
  handler: (req: Request, admin: AdminAuthContext, context: C) => Promise<Response>
): (req: Request, context: C) => Promise<Response>
```

- Generic `<C>` supports both static routes (no params) and dynamic routes (`{ params }`)
- Auth check runs before the handler; 401/403 responses are returned automatically

### Migrated Routes (18 routes, 19 files, 22 handlers)

| Route | Handlers |
|-------|----------|
| `/api/admin/scrape` | POST |
| `/api/admin/scrape/all` | POST |
| `/api/admin/data-quality` | GET, POST |
| `/api/admin/health` | GET |
| `/api/admin/screenings` | POST |
| `/api/admin/screenings/[id]` | PUT, PATCH, DELETE |
| `/api/admin/anomalies/verify` | POST |
| `/api/admin/agents/health` | POST |
| `/api/admin/agents/enrich` | POST |
| `/api/admin/agents/links` | POST |
| `/api/admin/bfi/status` | GET |
| `/api/admin/films/search` | GET |
| `/api/admin/cinemas/[id]/config` | GET, PUT |
| `/api/admin/festivals/scrape-eventive` | POST |
| `/api/admin/festivals/status` | GET |
| `/api/admin/festivals/reverse-tag` | POST |
| `/api/admin/festivals/audit` | GET |
| `/api/admin/analytics` | GET |

### Skipped

- `src/app/api/admin/bfi-import/route.ts` — uses `requireAuth()` (not `requireAdmin()`), different auth pattern

### Test Updates

Updated 5 test files to match new handler signatures (pass `(req, context)` instead of `()` or `(request)`):
- `agents/agents.test.ts`
- `anomalies/verify/route.test.ts`
- `bfi/status/route.test.ts`
- `scrape/all/route.test.ts`
- `screenings/screenings.test.ts`

## Verification

- `npx tsc --noEmit` — clean (no new errors)
- `npm run lint` — 0 errors, 143 pre-existing warnings
- `npm run test:run` — 31 test files, 658 tests pass
- `grep -rn "const admin = await requireAdmin" src/app/api/admin/` — returns zero results
