/**
 * Simple in-memory rate limiter for API routes
 *
 * Note: This uses in-memory storage, so each serverless instance has its own state.
 * For stronger rate limiting across all instances, use Redis (Upstash/Vercel KV).
 * However, this still provides protection against:
 * - Rapid-fire requests from the same IP to the same instance
 * - Basic DoS attempts within an instance's lifecycle
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Store rate limit data per IP
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
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

/**
 * Check rate limit for a given identifier (usually IP address)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup();

  const { limit, windowSec, prefix = "" } = config;
  const key = `${prefix}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSec * 1000;

  const entry = rateLimitStore.get(key);

  // No existing entry or window expired - create new entry
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: limit - 1,
      resetIn: windowSec,
    };
  }

  // Within window - increment counter
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

/**
 * Get client IP from request headers
 * Works with Vercel, Cloudflare, and standard proxies
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

  // Fallback
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
