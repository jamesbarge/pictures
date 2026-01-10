# Roadmap: High Priority Technical Debt

## Overview

Address 3 critical security and stability concerns identified in the codebase analysis: missing input validation on admin APIs, lack of rate limiting on public endpoints, and unhandled JSON parsing errors. Each phase delivers one fix with comprehensive tests.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: API Validation** - Add Zod schemas to admin API routes
- [ ] **Phase 2: Rate Limiting** - Apply rate limiting to public API endpoints
- [ ] **Phase 3: JSON Error Handling** - Fix JSON parsing in title-extractor

## Phase Details

### Phase 1: API Validation
**Goal**: Prevent crashes from malformed requests by adding Zod validation to admin routes
**Depends on**: Nothing (first phase)
**Research**: Unlikely (patterns exist in `/api/screenings/route.ts`)
**Plans**: TBD

Target files:
- `src/app/api/admin/screenings/[id]/route.ts`
- `src/app/api/admin/cinemas/[id]/config/route.ts`

### Phase 2: Rate Limiting
**Goal**: Protect public endpoints from abuse by applying existing rate limiting utility
**Depends on**: Phase 1
**Research**: Unlikely (utility exists in `src/lib/rate-limit.ts`)
**Plans**: TBD

Target files:
- `src/app/api/screenings/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/films/search/route.ts`

### Phase 3: JSON Error Handling
**Goal**: Handle invalid JSON responses gracefully in title-extractor
**Depends on**: Phase 2
**Research**: Unlikely (straightforward try-catch pattern)
**Plans**: TBD

Target file:
- `src/lib/title-extractor.ts` (lines 64-73)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. API Validation | 0/TBD | Not started | - |
| 2. Rate Limiting | 0/TBD | Not started | - |
| 3. JSON Error Handling | 0/TBD | Not started | - |
