/**
 * Global Test Setup
 * Configures mocks and test environment for all tests
 */

import { vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// =============================================================================
// PostHog Mock
// =============================================================================
// Analytics should never run in tests
vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    init: vi.fn(),
    isFeatureEnabled: vi.fn().mockReturnValue(false),
    getFeatureFlag: vi.fn().mockReturnValue(undefined),
    onFeatureFlags: vi.fn(),
  },
}));

// =============================================================================
// Analytics Module Mock
// =============================================================================
vi.mock("@/lib/analytics", () => ({
  trackWatchlistChange: vi.fn(),
  trackFilmMarkedSeen: vi.fn(),
  trackFilmMarkedNotInterested: vi.fn(),
  trackFilmStatusChange: vi.fn(),
  trackFilterChanged: vi.fn(),
  trackScreeningClicked: vi.fn(),
  trackSearchPerformed: vi.fn(),
  trackCinemaSelected: vi.fn(),
  initPostHog: vi.fn(),
}));

// =============================================================================
// Clerk Auth Mock
// =============================================================================
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
  currentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: vi.fn().mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
  }),
  useUser: vi.fn().mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    user: null,
  }),
  SignInButton: () => null,
  SignOutButton: () => null,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
}));

// =============================================================================
// Next.js Navigation Mock
// =============================================================================
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
  usePathname: vi.fn().mockReturnValue("/"),
  useParams: vi.fn().mockReturnValue({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// =============================================================================
// localStorage Mock
// =============================================================================
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// =============================================================================
// Window Mock Additions
// =============================================================================
Object.defineProperty(globalThis, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: "",
  thresholds: [],
}));

// =============================================================================
// Cleanup
// =============================================================================
afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
  // Clear localStorage between tests
  localStorageMock.clear();
});
