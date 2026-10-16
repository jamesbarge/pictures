/**
 * Tests for the pure functions in src/lib/auth.ts.
 *
 * Skips the Clerk-dependent functions (`getCurrentUserId`, `requireAuth`,
 * `requireAdmin`, `withAdminAuth`) since they require auth-context mocking.
 * These tests cover the `unauthorizedResponse` / `forbiddenResponse` helpers.
 */
import { describe, expect, it } from "vitest";
import { forbiddenResponse, unauthorizedResponse } from "./auth";

describe("unauthorizedResponse", () => {
  it("returns a 401 Response with the canonical error body", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });
});

describe("forbiddenResponse", () => {
  it("returns a 403 Response with the canonical error body", async () => {
    const res = forbiddenResponse();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });
});
