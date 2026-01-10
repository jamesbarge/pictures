# Coding Conventions

**Analysis Date:** 2026-01-10

## Naming Patterns

**Files:**
- kebab-case for all files: `user-service.ts`, `film-card.tsx`
- `*.test.ts` / `*.test.tsx` for unit tests (co-located with source)
- `*.spec.ts` for Playwright E2E tests
- PascalCase not used for file names (component files are kebab-case)

**Functions:**
- camelCase for all functions: `toggleCinema()`, `fetchScreenings()`
- Verb-noun pattern: `extractFilmTitle()`, `parseScreeningDate()`
- Boolean predicates: `isAnomalyDismissed()`, `isIndependentCinema()`
- Handler functions: `handleClick()`, `handleSubmit()`
- No special prefix for async functions

**Variables:**
- camelCase for variables: `filmStatus`, `selectedCinemas`
- SCREAMING_SNAKE_CASE for constants: `STORAGE_KEY`, `DECADES`, `TIME_PRESETS`
- No underscore prefix for private members

**Types:**
- PascalCase for interfaces: `FilmStatus`, `ScreeningData`
- No `I` prefix for interfaces
- PascalCase for type aliases: `CinemaSlug`, `EventType`
- PascalCase for enums, UPPER_CASE for values (if used)

## Code Style

**Formatting:**
- 2-space indentation
- Double quotes for strings (ESLint enforced)
- Semicolons required
- No Prettier config (using ESLint defaults from Next.js)

**Linting:**
- ESLint with `eslint-config-next/core-web-vitals`
- ESLint with `eslint-config-next/typescript`
- Config: `eslint.config.mjs`
- Run: `npm run lint`

## Import Organization

**Order:**
1. React imports (`import React`, `import { useState }`)
2. External packages (`import { format } from "date-fns"`)
3. Internal modules (`import { db } from "@/db"`)
4. Relative imports (`import { utils } from "./utils"`)
5. Type imports (`import type { Film } from "@/types"`)

**Grouping:**
- Blank line between groups
- Alphabetical within each group (not strictly enforced)

**Path Aliases:**
- `@/` maps to `src/`
- Example: `import { db } from "@/db"`
- Configured in `tsconfig.json`

## Error Handling

**Patterns:**
- Throw errors from services, catch at API boundaries
- Custom error classes extend base class (`src/lib/api-errors.ts`)
- Use try/catch in async functions, not `.catch()` chains

**Error Types:**
- `BadRequestError` - Invalid input (400)
- `NotFoundError` - Resource not found (404)
- `UnauthorizedError` - Auth required (401)
- Throw on invalid input, missing dependencies

**Error Responses:**
```typescript
// API route error handling pattern
try {
  // ... logic
} catch (error) {
  return handleApiError(error);
}
```

## Logging

**Framework:**
- Console methods: `console.log()`, `console.warn()`, `console.error()`
- Sentry for error capture in production

**Patterns:**
- Log state transitions in scrapers
- Log external API calls for debugging
- No console.log in production code (use Sentry)
- Structured logging with context: `console.log('[Scraper]', message)`

**When:**
- Scraper progress and anomalies
- API errors
- Agent results
- Not for routine operations

## Comments

**When to Comment:**
- Explain "why" not "what"
- Document business rules
- Explain non-obvious algorithms
- Avoid obvious comments

**JSDoc/TSDoc:**
- Required for public API functions
- File headers with description
- Use `@param`, `@returns`, `@throws` tags
- Example:
```typescript
/**
 * TMDB API Client
 * Handles all interactions with The Movie Database API
 */
```

**Section Dividers:**
```typescript
// =============================================================================
// Store Reset Utilities
// =============================================================================
```

**TODO Comments:**
- Format: `// TODO: description`
- Not tracking username (use git blame)
- Link to issue if exists: `// TODO: Fix race condition (issue #123)`

## Function Design

**Size:**
- Keep under 50 lines when possible
- Extract helpers for complex logic
- One level of abstraction per function

**Parameters:**
- Max 3 parameters preferred
- Use options object for 4+ parameters
- Destructure in parameter list:
```typescript
function process({ id, name }: ProcessParams) { ... }
```

**Return Values:**
- Explicit return statements
- Return early for guard clauses
- Consistent return types (don't mix null/undefined)

## Module Design

**Exports:**
- Named exports preferred
- Default exports for React components only
- Export public API from `index.ts` barrel files

**Barrel Files:**
- `index.ts` re-exports public API
- Keep internal helpers private
- Avoid circular dependencies

**Example:**
```typescript
// src/db/schema/index.ts
export * from "./cinemas";
export * from "./films";
export * from "./screenings";
```

## React Patterns

**Components:**
- Functional components only
- Hooks for state and effects
- Props interface defined inline or imported

**State Management:**
- Zustand for global client state
- TanStack Query for server state
- useState for local component state

**Store Pattern:**
```typescript
// Call actions via getState()
useStore.getState().toggleCinema("bfi");

// Read state with selector
const cinemas = useStore((state) => state.selectedCinemas);
```

## API Route Pattern

```typescript
// src/app/api/{endpoint}/route.ts
export async function GET(request: NextRequest) {
  try {
    // Validate with Zod
    const params = searchParamsSchema.parse(searchParams);

    // Query database
    const data = await db.query...

    // Return JSON
    return Response.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
```

## Database Patterns

**Queries:**
- Use Drizzle ORM query builder
- Explicit select fields (not `*`)
- Use `eq()`, `and()`, `or()` operators

**Mutations:**
- Use `onConflictDoUpdate` for upserts
- Transaction for multi-table operations
- Return inserted/updated records

---

*Convention analysis: 2026-01-10*
*Update when patterns change*
