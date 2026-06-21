import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "./rate-limit";

// The Redis-backed path is mocked so we can simulate the backing store throwing
// (Upstash over-quota / unreachable) and assert the limiter fails OPEN rather
// than propagating the error as a 500. See the fail-open describe block below.
const { mockLimit } = vi.hoisted(() => ({ mockLimit: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class FakeRedis {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class FakeRatelimit {
    static slidingWindow = vi.fn(() => ({}));
    limit(identifier: string) {
      return mockLimit(identifier);
    }
  },
}));

// The default describe blocks run without Redis env vars, so they exercise the
// in-memory fallback (the mocks above are inert there — Redis is never built).

describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
  });

  it("should allow requests within the limit", async () => {
    const config = { limit: 5, windowSec: 60, prefix: "test1" };
    const result1 = await checkRateLimit("192.168.1.1", config);
    expect(result1.success).toBe(true);
    expect(result1.remaining).toBe(4);
    const result2 = await checkRateLimit("192.168.1.1", config);
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(3);
  });

  it("should block requests exceeding the limit", async () => {
    const config = { limit: 3, windowSec: 60, prefix: "test2" };
    await checkRateLimit("192.168.1.2", config);
    await checkRateLimit("192.168.1.2", config);
    await checkRateLimit("192.168.1.2", config);
    const result = await checkRateLimit("192.168.1.2", config);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should reset after the time window", async () => {
    const config = { limit: 2, windowSec: 60, prefix: "test3" };
    await checkRateLimit("192.168.1.3", config);
    await checkRateLimit("192.168.1.3", config);
    const blocked = await checkRateLimit("192.168.1.3", config);
    expect(blocked.success).toBe(false);
    vi.advanceTimersByTime(61 * 1000);
    const result = await checkRateLimit("192.168.1.3", config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("should track different IPs separately", async () => {
    const config = { limit: 2, windowSec: 60, prefix: "test4" };
    await checkRateLimit("10.0.0.1", config);
    await checkRateLimit("10.0.0.1", config);
    expect((await checkRateLimit("10.0.0.1", config)).success).toBe(false);
    const result = await checkRateLimit("10.0.0.2", config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("should track different prefixes separately", async () => {
    const config1 = { limit: 2, windowSec: 60, prefix: "api1" };
    const config2 = { limit: 2, windowSec: 60, prefix: "api2" };
    await checkRateLimit("192.168.1.5", config1);
    await checkRateLimit("192.168.1.5", config1);
    expect((await checkRateLimit("192.168.1.5", config1)).success).toBe(false);
    const result = await checkRateLimit("192.168.1.5", config2);
    expect(result.success).toBe(true);
  });

  it("should return correct resetIn time", async () => {
    const config = { limit: 2, windowSec: 120, prefix: "test6" };
    const result1 = await checkRateLimit("192.168.1.6", config);
    expect(result1.resetIn).toBe(120);
    vi.advanceTimersByTime(30 * 1000);
    const result2 = await checkRateLimit("192.168.1.6", config);
    expect(result2.resetIn).toBe(90);
  });
});

describe("getClientIP", () => {
  it("should extract IP from x-forwarded-for header", () => {
    const request = new Request("http://example.com", {
      headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178" },
    });
    expect(getClientIP(request)).toBe("203.0.113.195");
  });

  it("should extract IP from cf-connecting-ip header", () => {
    const request = new Request("http://example.com", {
      headers: { "cf-connecting-ip": "198.51.100.178" },
    });
    expect(getClientIP(request)).toBe("198.51.100.178");
  });

  it("should extract IP from x-real-ip header", () => {
    const request = new Request("http://example.com", {
      headers: { "x-real-ip": "192.0.2.1" },
    });
    expect(getClientIP(request)).toBe("192.0.2.1");
  });

  it("should return unknown when no IP headers present", () => {
    const request = new Request("http://example.com");
    expect(getClientIP(request)).toBe("unknown");
  });

  it("should prefer x-forwarded-for over other headers", () => {
    const request = new Request("http://example.com", {
      headers: {
        "x-forwarded-for": "10.0.0.1",
        "cf-connecting-ip": "10.0.0.2",
        "x-real-ip": "10.0.0.3",
      },
    });
    expect(getClientIP(request)).toBe("10.0.0.1");
  });
});

describe("RATE_LIMITS presets", () => {
  it("should have correct public limits", () => {
    expect(RATE_LIMITS.public.limit).toBe(100);
    expect(RATE_LIMITS.public.windowSec).toBe(60);
  });

  it("should have correct search limits", () => {
    expect(RATE_LIMITS.search.limit).toBe(30);
    expect(RATE_LIMITS.search.windowSec).toBe(60);
  });

  it("should have correct sync limits", () => {
    expect(RATE_LIMITS.sync.limit).toBe(10);
    expect(RATE_LIMITS.sync.windowSec).toBe(60);
  });
});

describe("checkRateLimit (fail-open when the Redis backend throws)", () => {
  // Regression guard for the 2026-05-30 incident: Upstash hit its request
  // quota, rl.limit() threw, and — before the fail-open fix — that 500'd every
  // DB-backed route here, before the query even ran (PR #584).
  beforeEach(() => {
    vi.resetModules(); // force a fresh module that re-reads the stubbed env
    // Configure a Redis backend so the module takes the Upstash path, not in-memory.
    vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
    mockLimit.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails open via in-memory instead of throwing when rl.limit() rejects", async () => {
    mockLimit.mockRejectedValue(new Error("Upstash quota exceeded"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { checkRateLimit } = await import("./rate-limit");
    const config = { limit: 5, windowSec: 60, prefix: "failopen" };

    // Must RESOLVE, not reject — a thrown error here would 500 the route.
    const result = await checkRateLimit("203.0.113.7", config);

    // Fails OPEN: request is allowed via the per-instance in-memory fallback.
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failing open"),
      expect.stringContaining("Upstash quota exceeded")
    );

    warnSpy.mockRestore();
  });

  it("still enforces limits via the in-memory fallback after the backend fails", async () => {
    mockLimit.mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { checkRateLimit } = await import("./rate-limit");
    const config = { limit: 2, windowSec: 60, prefix: "failopen-enforce" };

    await checkRateLimit("203.0.113.9", config);
    await checkRateLimit("203.0.113.9", config);
    const blocked = await checkRateLimit("203.0.113.9", config);

    // Fallback is fail-OPEN, not fail-THROUGH: it still rate-limits per instance.
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("uses the Redis result on the happy path (no fallback)", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    // reset 30s out, computed right before the call to keep the delta tight.
    mockLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 30_000,
    });

    const result = await checkRateLimit("203.0.113.8", {
      limit: 5,
      windowSec: 60,
      prefix: "happy",
    });

    expect(mockLimit).toHaveBeenCalledWith("203.0.113.8");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    // Derived from the Redis `reset`, not the in-memory fallback's windowSec.
    expect(result.resetIn).toBeGreaterThanOrEqual(29);
    expect(result.resetIn).toBeLessThanOrEqual(30);
  });
});
