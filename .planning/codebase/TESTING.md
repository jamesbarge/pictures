# Testing Patterns

**Analysis Date:** 2026-01-10

## Test Framework

**Runner:**
- Vitest 4.0.16 - Unit and component tests
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in `expect`
- @testing-library/jest-dom for DOM assertions

**Run Commands:**
```bash
npm test                        # Watch mode
npm run test:run                # Single run (CI/pre-commit)
npm run test:coverage           # With coverage report
npm run test:e2e                # Playwright E2E tests
npm run test:e2e:ui             # Playwright UI mode
```

## Test File Organization

**Location:**
- Unit tests: `*.test.ts` / `*.test.tsx` co-located with source
- E2E tests: `e2e/*.spec.ts` (separate directory)
- Test utilities: `src/test/` directory

**Naming:**
- Unit tests: `{module}.test.ts`
- Component tests: `{component}.test.tsx`
- E2E tests: `{feature}.spec.ts`

**Structure:**
```
src/
├── lib/
│   ├── title-extractor.ts
│   └── title-extractor.test.ts      # Co-located
├── stores/
│   ├── filters.ts
│   └── filters.test.ts               # Co-located
├── app/api/
│   └── screenings/
│       ├── route.ts
│       └── route.test.ts             # Co-located
└── test/
    ├── setup.ts                      # Global setup
    ├── utils.tsx                     # Test utilities
    └── fixtures.ts                   # Shared fixtures

e2e/
├── smoke.spec.ts
└── calendar.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("ModuleName", () => {
  beforeEach(() => {
    // Reset state before each test
  });

  describe("functionName", () => {
    it("should handle success case", () => {
      // arrange
      const input = createTestInput();

      // act
      const result = functionName(input);

      // assert
      expect(result).toEqual(expected);
    });

    it("should throw on invalid input", () => {
      expect(() => functionName(null)).toThrow("error message");
    });
  });
});
```

**Patterns:**
- `beforeEach` for per-test setup, avoid `beforeAll`
- `afterEach` to restore mocks: `vi.restoreAllMocks()`
- Arrange/act/assert comments in complex tests
- One assertion focus per test (multiple expects OK)

## Mocking

**Framework:**
- Vitest built-in mocking (`vi`)
- Module mocking via `vi.mock()` at top of test file

**Patterns:**
```typescript
import { vi } from "vitest";

// Mock module at top of file
vi.mock("@/lib/external-service", () => ({
  fetchData: vi.fn()
}));

describe("test suite", () => {
  it("mocks function", () => {
    const mockFn = vi.mocked(fetchData);
    mockFn.mockResolvedValue({ data: "test" });

    // Test code using mocked function

    expect(mockFn).toHaveBeenCalledWith("expected arg");
  });
});
```

**What to Mock:**
- External APIs (TMDB, PostHog)
- File system operations
- Clerk authentication
- localStorage
- Environment variables

**What NOT to Mock:**
- Pure functions and utilities
- Internal business logic
- TypeScript types

## Fixtures and Factories

**Test Data:**
```typescript
// Factory pattern in test file
function createTestScreening(overrides?: Partial<Screening>): Screening {
  return {
    id: "test-id",
    filmId: "film-123",
    cinemaId: "bfi-southbank",
    datetime: new Date("2026-01-10T14:00:00Z"),
    ...overrides
  };
}

// Shared fixtures
// src/test/fixtures.ts
export const mockCinemas = [/* ... */];
export const mockFilms = [/* ... */];
```

**Location:**
- Factory functions: In test file near usage
- Shared fixtures: `src/test/fixtures.ts`
- Mock data: Inline when simple, factory when complex

## Coverage

**Requirements:**
- Target: 60% lines, 60% functions (not yet enforced)
- Currently tracked for awareness
- Focus on critical paths (scrapers, API routes, stores)

**Configuration:**
```typescript
// vitest.config.ts
coverage: {
  reporter: ["text", "html", "json-summary"],
  include: [
    "src/lib/**",
    "src/scrapers/utils/**",
    "src/stores/**",
    "src/app/api/**",
    "src/components/**",
  ],
  exclude: [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/test/**",
    "**/*.d.ts",
  ],
}
```

**View Coverage:**
```bash
npm run test:coverage
open coverage/index.html
```

## Test Types

**Unit Tests:**
- Scope: Single function/module in isolation
- Mocking: Mock all external dependencies
- Speed: Each test <100ms
- Examples: `src/lib/title-extractor.test.ts`, `src/stores/filters.test.ts`

**Integration Tests:**
- Scope: Multiple modules together
- Mocking: Mock only external boundaries
- Examples: `src/app/api/**/route.test.ts`

**E2E Tests:**
- Framework: Playwright
- Scope: Full user flows
- Location: `e2e/*.spec.ts`
- Examples: `e2e/smoke.spec.ts`, `e2e/calendar.spec.ts`

## Common Patterns

**Store Tests (Zustand):**
```typescript
import { useStore } from "./store";

// Reset state before each test (don't use replace: true)
beforeEach(() => {
  useStore.setState(initialStateValues);
});

it("should toggle cinema", () => {
  // Call actions via getState()
  useStore.getState().toggleCinema("bfi-southbank");

  // Read state directly
  expect(useStore.getState().selectedCinemas).toContain("bfi-southbank");
});
```

**API Route Tests:**
```typescript
import { GET, POST } from "./route";

it("should return screenings", async () => {
  const request = new NextRequest(
    "http://localhost/api/screenings?startDate=2026-01-10"
  );

  const response = await GET(request);

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.screenings).toBeDefined();
});
```

**Async Testing:**
```typescript
it("should handle async operation", async () => {
  const result = await asyncFunction();
  expect(result).toBe("expected");
});

// Async error
it("should reject on failure", async () => {
  await expect(asyncCall()).rejects.toThrow("error message");
});
```

**Error Testing:**
```typescript
it("should throw on invalid input", () => {
  expect(() => parse(null)).toThrow("Cannot parse null");
});
```

**Parameterized Tests:**
```typescript
it.each([
  ["Film Title (2020)", "Film Title"],
  ["Another Film", "Another Film"],
])("extracts title from '%s'", async (input, expected) => {
  const result = await extractTitle(input);
  expect(result).toBe(expected);
});
```

## Test Setup

**Global Setup (`src/test/setup.ts`):**
```typescript
import { vi, beforeAll, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock PostHog
vi.mock("posthog-js", () => ({ ... }));

// Mock Clerk
vi.mock("@clerk/nextjs", () => ({ ... }));

// Mock localStorage
const localStorageMock = { ... };
vi.stubGlobal("localStorage", localStorageMock);

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Test Utilities (`src/test/utils.tsx`):**
```typescript
import { render } from "@testing-library/react";

export function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: TestProviders });
}

export * from "@testing-library/react";
export { userEvent } from "@testing-library/user-event";
```

## Test Database

- Unit tests: No database (all mocked)
- Integration tests: Mock database queries
- E2E tests: Run against dev/test environment
- No separate test database currently configured

---

*Testing analysis: 2026-01-10*
*Update when test patterns change*
