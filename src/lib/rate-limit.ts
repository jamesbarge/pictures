/**
 * Distributed rate limiter for API routes
 *
 * Uses Upstash Redis (via @upstash/ratelimit) for distributed rate limiting
 * across all Vercel serverless instances. Falls back to an in-memory Map
 * when Redis env vars are not configured (local dev, CI).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Types (unchanged — all consumers rely on these)
// ---------------------------------------------------------------------------

/** Configuration for a rate limit rule applied to an API route. */
export interface RateLimitConfig {
  /** Maximum number of requests per window */
  limit: number;
  /** Time window in seconds */
  windowSec: number;
  /** Optional key prefix (e.g., route name) */
  prefix?: string;
}

/** Result of a rate limit check for a given identifier. */
export interface RateLimitResult {
  /** Whether the request is within the rate limit. */
  success: boolean;
  /** Number of requests remaining in the current window. */
  remaining: number;
  /** Seconds until the rate limit window resets. */
  resetIn: number;
}

// ---------------------------------------------------------------------------
// Redis backend (distributed)
// ---------------------------------------------------------------------------

const hasRedis =
  typeof process !== "undefined" &&
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis ? Redis.fromEnv() : null;

/**
 * Cache of Ratelimit instances keyed by "prefix:limit:windowSec".
 * Each unique config combo gets its own limiter so different routes
 * can have different windows without colliding.
 */
const ratelimiters = new Map<string, Ratelimit>();

function getOrCreateRatelimiter(config: RateLimitConfig): Ratelimit {
  const key = `${config.prefix ?? ""}:${config.limit}:${config.windowSec}`;
  let rl = ratelimiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSec} s`),
      prefix: `rl:${config.prefix ?? "default"}`,
      analytics: false,
    });
    ratelimiters.set(key, rl);
  }
  return rl;
}

// ---------------------------------------------------------------------------
// In-memory fallback (local dev / CI)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

function checkRateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup();

  const { limit, windowSec, prefix = "" } = config;
  const key = `${prefix}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSec * 1000;

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { success: true, remaining: limit - 1, resetIn: windowSec };
  }

  entry.count++;

  if (entry.count > limit) {
    return {
      success: false,
      remaining: 0,
      resetIn: Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  return {
    success: true,
    remaining: limit - entry.count,
    resetIn: Math.ceil((entry.resetTime - now) / 1000),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given identifier (usually IP address).
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL is configured,
 * otherwise falls back to an in-memory counter.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!redis) {
    return checkRateLimitInMemory(identifier, config);
  }

  const rl = getOrCreateRatelimiter(config);
  const { success, remaining, reset } = await rl.limit(identifier);

  return {
    success,
    remaining,
    resetIn: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
  };
}

/**
 * Get client IP from request headers.
 * Works with Vercel, Cloudflare, and standard proxies.
 */
export function getClientIP(request: Request): string {
  // Vercel
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  // Cloudflare
  const cfConnectingIP = request.headers.get("cf-connecting-ip");
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Standard
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  return "unknown";
}

/** Preset rate limit configurations for common API route categories. */
export const RATE_LIMITS = {
  // Public API endpoints - generous limits
  public: { limit: 100, windowSec: 60 } as RateLimitConfig,
  // Search endpoints - moderate limits
  search: { limit: 30, windowSec: 60 } as RateLimitConfig,
  // User endpoints - stricter limits
  user: { limit: 20, windowSec: 60 } as RateLimitConfig,
  // Auth/sync endpoints - strict limits
  sync: { limit: 10, windowSec: 60 } as RateLimitConfig,
} as const;
