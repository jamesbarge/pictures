/**
 * Tests for the pure functions in src/lib/auth.ts.
 *
 * Skips the Clerk-dependent functions (`getCurrentUserId`, `requireAuth`,
 * `requireAdmin`, `withAdminAuth`) since they require auth-context mocking.
 * These tests cover the security-critical `verifyCronSecret` and the
 * `unauthorizedResponse` / `forbiddenResponse` helpers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  forbiddenResponse,
  unauthorizedResponse,
  verifyCronSecret,
} from "./auth";

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

describe("verifyCronSecret", () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret-123";
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
  });

  function reqWithAuth(authHeader?: string): Request {
    const headers: Record<string, string> = {};
    if (authHeader !== undefined) headers["authorization"] = authHeader;
    return new Request("https://example.com/api/cron/x", { headers });
  }

  it("returns true when the Bearer token matches CRON_SECRET", () => {
    expect(verifyCronSecret(reqWithAuth("Bearer test-cron-secret-123"))).toBe(true);
  });

  it("returns false when no authorization header is present", () => {
    expect(verifyCronSecret(reqWithAuth())).toBe(false);
  });

  it("returns false when the Bearer token does not match", () => {
    expect(verifyCronSecret(reqWithAuth("Bearer wrong-secret"))).toBe(false);
  });

  it("strips ONLY the literal 'Bearer ' prefix (leading lowercase 'bearer' is NOT stripped)", () => {
    // The implementation does .replace("Bearer ", "") — case-sensitive.
    // Lowercase "bearer " stays in the token string, so the comparison fails.
    // Pinning this so a refactor to .replace(/^Bearer\s+/i, "") gets flagged
    // as a behaviour change before it lands.
    expect(verifyCronSecret(reqWithAuth("bearer test-cron-secret-123"))).toBe(false);
  });

  it("returns false when CRON_SECRET env var is unset and token is empty", () => {
    delete process.env.CRON_SECRET;
    // Both undefined → matches via `token === undefined`. Pin behaviour.
    // Note: this is a SECURITY-CRITICAL edge case. The function returns false
    // (correctly) when the secret is unset AND token has the Bearer-prefix
    // shape — because the prefix-stripped value is empty string, which doesn't
    // === undefined.
    expect(verifyCronSecret(reqWithAuth("Bearer "))).toBe(false);
  });

  it("returns false when CRON_SECRET is unset and token is also missing", () => {
    delete process.env.CRON_SECRET;
    expect(verifyCronSecret(reqWithAuth())).toBe(false);
  });

  it("does NOT treat the bare 'Bearer' (no trailing space) as a Bearer scheme", () => {
    // .replace("Bearer ", "") needs the trailing space to find anything.
    // Without it, the whole string survives and won't match the secret.
    expect(verifyCronSecret(reqWithAuth("Bearer"))).toBe(false);
  });

  it("does NOT support multiple Bearer prefixes (the first-match strip only)", () => {
    // .replace strips ONE occurrence. Repeated prefixes survive.
    expect(verifyCronSecret(reqWithAuth("Bearer Bearer test-cron-secret-123"))).toBe(false);
  });
});
