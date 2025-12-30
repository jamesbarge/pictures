/**
 * Test Utilities
 * Helpers for rendering components and managing test state
 */

import React, { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Import stores to allow state reset
import { useFilters } from "@/stores/filters";
import { usePreferences } from "@/stores/preferences";
import { useFilmStatus } from "@/stores/film-status";

// =============================================================================
// Store Reset Utilities
// =============================================================================

/** Initial state for filters store */
const initialFiltersState = {
  filmSearch: "",
  cinemaIds: [],
  dateFrom: null,
  dateTo: null,
  timeFrom: null,
  timeTo: null,
  formats: [],
  programmingTypes: [],
  decades: [],
  genres: [],
  timesOfDay: [],
  festivalSlug: null,
  festivalOnly: false,
  hideSeen: false,
  hideNotInterested: true,
  onlySingleShowings: false,
  updatedAt: new Date().toISOString(),
};

/** Initial state for preferences store */
const initialPreferencesState = {
  selectedCinemas: [],
  defaultView: "list" as const,
  calendarViewMode: "films" as const,
  showRepertoryOnly: false,
  hidePastScreenings: true,
  defaultDateRange: "all" as const,
  preferredFormats: [],
  mapArea: null,
  useMapFiltering: false,
  updatedAt: new Date().toISOString(),
};

/** Reset filters store to initial state */
export function resetFiltersStore() {
  useFilters.setState(initialFiltersState);
}

/** Reset preferences store to initial state */
export function resetPreferencesStore() {
  usePreferences.setState(initialPreferencesState);
}

/** Reset film status store to initial state */
export function resetFilmStatusStore() {
  useFilmStatus.setState({ films: {} });
}

/** Reset all stores to initial state */
export function resetAllStores() {
  resetFiltersStore();
  resetPreferencesStore();
  resetFilmStatusStore();
}

// =============================================================================
// Provider Wrapper
// =============================================================================

/** Create a new QueryClient for testing */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface TestProvidersProps {
  children: ReactNode;
}

/** Wrapper component with all providers needed for testing */
function TestProviders({ children }: TestProvidersProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// =============================================================================
// Custom Render
// =============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Reset stores before rendering (default: true) */
  resetStores?: boolean;
}

/**
 * Custom render function that wraps components with necessary providers
 * and optionally resets stores before rendering.
 *
 * @example
 * ```tsx
 * import { renderWithProviders, screen } from "@/test/utils";
 *
 * it("renders the component", () => {
 *   renderWithProviders(<MyComponent />);
 *   expect(screen.getByText("Hello")).toBeInTheDocument();
 * });
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  { resetStores = true, ...options }: CustomRenderOptions = {}
) {
  if (resetStores) {
    resetAllStores();
  }

  return render(ui, {
    wrapper: TestProviders,
    ...options,
  });
}

// Re-export testing library utilities
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wait for a condition to be true
 * Useful for async state updates
 */
export async function waitFor(
  condition: () => boolean,
  { timeout = 1000, interval = 50 } = {}
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error("waitFor timeout exceeded");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create a mock Request object for API route testing
 */
export function createMockRequest(
  url: string,
  options: RequestInit = {}
): Request {
  const fullUrl = url.startsWith("http") ? url : `http://localhost${url}`;
  return new Request(fullUrl, options);
}

/**
 * Create a mock NextRequest for API route testing
 * (Simple version - for full NextRequest features, import from next/server)
 */
export function createMockNextRequest(
  url: string,
  options: RequestInit = {}
): Request {
  return createMockRequest(url, options);
}
