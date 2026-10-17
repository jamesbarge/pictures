/**
 * Global Test Setup
 * Configures mocks and test environment for all tests
 */

import { vi, afterEach } from "vitest";

// =============================================================================
// Admin Allowlist (test environment)
// =============================================================================
// The admin allowlist is fail-closed: with no ADMIN_EMAILS set, no email is an
// admin. Admin route tests mock currentUser as "jdwbarge@gmail.com", so the
// test environment configures the allowlist explicitly to match. Tests that
// exercise allowlist parsing itself (admin-emails.test.ts) save/override/
// restore this var per-test, so this default does not interfere with them.
process.env.ADMIN_EMAILS = "jdwbarge@gmail.com";

// =============================================================================
// Clerk Auth Mock
// =============================================================================
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
  currentUser: vi.fn().mockResolvedValue(null),
}));

// =============================================================================
// Cleanup
// =============================================================================
afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});
