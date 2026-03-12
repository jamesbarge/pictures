import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "./rate-limit";

// Tests run without UPSTASH_REDIS_REST_URL, so they exercise the in-memory fallback.

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
