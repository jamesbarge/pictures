# Technical Debt & Concerns

**Analysis Date:** 2026-01-10

## Summary

Overall quality: **Good** - Well-structured codebase with proper error handling, validation, and documentation. Minor improvements needed around edge cases and scaling.

**Test Coverage:** Good (16+ test files covering critical paths)
**Dependencies:** Current (Next.js 16.1.0, React 19.2.3, Drizzle ORM 0.45.1)

## High Priority (All Resolved)

### 1. ~~Missing Input Validation in Admin APIs~~ (RESOLVED)

**Severity:** ~~High~~ → Resolved
**Files:**
- `src/app/api/admin/screenings/[id]/route.ts`
- `src/app/api/admin/cinemas/[id]/config/route.ts`

**Original Issue:**
Request body parsing uses `await request.json()` without Zod validation. Malformed JSON or missing fields could cause runtime errors.

**Resolution (2026-01-10):**
Added Zod schemas to both admin routes:
- `updateScreeningSchema` and `patchScreeningSchema` for screenings route
- `cinemaConfigSchema` for cinema config route
All routes now use safeParse pattern with proper error responses.

---

### 2. ~~No Rate Limiting on Public API Routes~~ (RESOLVED)

**Severity:** ~~High~~ → Resolved
**Files:**
- `src/app/api/screenings/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/films/search/route.ts` (already had rate limiting)

**Original Issue:**
Public API endpoints lack rate limiting.

**Resolution (2026-01-10):**
Applied rate limiting to all public endpoints:
- `/api/screenings` - 100 req/min (RATE_LIMITS.public)
- `/api/search` - 30 req/min (RATE_LIMITS.search)
- `/api/films/search` - already had rate limiting
All routes return 429 with Retry-After header when limits exceeded.

---

### 3. ~~Error Handling Gap in JSON Parsing~~ (RESOLVED)

**Severity:** ~~High~~ → Resolved
**File:** `src/lib/title-extractor.ts` (lines 64-73)

**Original Issue:**
```typescript
const text = response.content[0].type === "text" ? response.content[0].text : "";
const parsed = JSON.parse(text.trim());  // Flagged as having no try-catch
```

**Resolution (2026-01-10):**
Upon code review, the `JSON.parse` call IS already wrapped in a try-catch block (lines 41-81). The concern analysis was a **false positive**. The catch block at line 74 properly falls back to low-confidence extraction when JSON parsing fails.

**Verification:** Added test cases `title-extractor.test.ts`:
- "should handle invalid JSON response gracefully"
- "should handle malformed JSON response gracefully"

Both tests confirm errors are caught and handled correctly.

---

## Medium Priority

### 4. Schema Limitations - Unimplemented Database Columns

**Severity:** Medium
**File:** `src/db/schema/screenings.ts` (lines 66-70)

**Issue:**
```typescript
// TODO: Add these columns via Supabase console - ALTER TABLE times out on serverless
// linkStatus: text("link_status").$type<...>(),
// linkLastChecked: timestamp("link_last_checked", { withTimezone: true }),
```

Link verification columns are commented out because schema migrations time out on serverless. This blocks the link-validator agent from storing verification results persistently.

**Impact:** Link validation data cannot be persisted; results are lost between runs.

**Mitigation:** Either migrate to a non-serverless database context or implement persistence via the `data_issues` table.

---

### 5. Partial Agent Storage Implementation

**Severity:** Medium
**File:** `src/scrapers/pipeline.ts` (lines 276-282)

**Issue:**
```typescript
if (report.anomalyDetected) {
  console.warn(`[Agent] Anomaly detected: ${report.warnings.join(", ")}`);
  // Could store this in data_issues table for review
}
```

Scraper health results are logged but not persisted. The `data_issues` table exists but isn't used here. Anomalies are transient and hard to track over time.

**Fix:** Store agent analysis results in the `data_issues` table.

---

### 6. Type Casting Without Verification

**Severity:** Medium
**File:** `src/app/api/webhooks/clerk/route.ts` (lines 213, 217, 221)

**Issue:**
```typescript
await handleUserCreated(event.data as ClerkUserData);
await handleUserUpdated(event.data as ClerkUserData);
await handleUserDeleted(event.data as ClerkUserData);
```

Webhook event data is cast to specific types without runtime validation. If Clerk sends unexpected event structure, the code could fail silently.

**Fix:** Validate event.data matches the expected type before casting.

---

## Low Priority

### 7. Large Component Files

**Severity:** Low
**Files:**
- `src/components/layout/header.tsx` (1,409 lines)
- `src/scrapers/pipeline.ts` (988 lines)

**Issue:**
Several files exceed 700+ lines, making them difficult to test and maintain. The header component manages multiple concerns (date picking, cinema selection, filters).

**Recommendation:** Break large components into smaller, focused sub-components.

---

### 8. Duplicate Scraper Runner Files

**Severity:** Low
**Files:** `src/scrapers/run-*.ts` (50+ files)

**Issue:**
Many scrapers have `-v2` or `-v2-basescraper` variants suggesting incomplete refactoring:
- `run-genesis.ts` and `run-genesis-v2.ts`
- `run-genesis-v2-basescraper.ts` (unclear purpose)

**Impact:** Cognitive overhead; unclear which version is canonical.

**Recommendation:** Remove old versions or clearly document the migration path.

---

### 9. Large Test Files

**Severity:** Low
**Files:**
- `src/lib/title-extractor.test.ts` (595 lines)
- `src/lib/postcode.test.ts` (470 lines)
- `src/stores/filters.test.ts` (477 lines)

**Issue:**
While test coverage is good, some test files are large and could benefit from breaking into logical suites.

---

### 10. Missing High-Level Documentation

**Severity:** Low
**File:** `src/scrapers/pipeline.ts`

**Issue:**
The complex caching mechanism, film matching logic, and agent integration lack high-level documentation explaining the overall flow and trade-offs.

---

## Positive Findings

The following areas are well-implemented:

✓ **Environment Configuration**: `.env.local.example` exists and is up-to-date
✓ **No Hardcoded Secrets**: API keys loaded from environment variables
✓ **Good Test Coverage**: 16+ test files covering critical paths
✓ **Proper Error Handling**: Try-catch blocks in cron jobs, API routes, webhook handlers
✓ **Authentication**: Clerk properly integrated with middleware
✓ **Data Validation**: Screenings API validates input with Zod
✓ **Caching Strategy**: Film cache in pipeline optimizes DB queries
✓ **Unique Constraints**: Database enforces duplicate prevention
✓ **Recent Commits**: Active maintenance (image rendering fixes, new scrapers)

## Action Items by Priority

**High Priority:** (All resolved 2026-01-10)
1. ~~Add Zod validation to all admin API request bodies~~ ✓
2. ~~Implement rate limiting on public API endpoints~~ ✓
3. ~~Fix JSON parsing error handling in title-extractor~~ ✓ (false positive - already handled)

**Medium Priority:**
1. Enable link_status columns in screenings table (migration workaround needed)
2. Add persistence for agent analysis results (data_issues table)
3. Add runtime validation for webhook event data

**Low Priority:**
1. Break down large components (header.tsx, pipeline.ts)
2. Document or remove old scraper `-v2` versions
3. Add high-level documentation to pipeline.ts
4. Organize large test files into logical suites

---

*Concerns analysis: 2026-01-10*
*Update when issues are resolved or new concerns identified*
