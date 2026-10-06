/**
 * Server-side PostHog client
 * Used for tracking events from API routes and server components
 */

import { PostHog } from "posthog-node";

// Singleton instance
let posthogClient: PostHog | null = null;

/**
 * Get the server-side PostHog client (lazy initialization)
 * Returns null if PostHog key is not configured
 */
export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    console.warn("[PostHog] Server client not initialized - missing NEXT_PUBLIC_POSTHOG_KEY");
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: "https://eu.posthog.com",
      // Flush events automatically in production
      flushAt: process.env.NODE_ENV === "production" ? 20 : 1,
      flushInterval: process.env.NODE_ENV === "production" ? 10000 : 0,
    });
  }

  return posthogClient;
}

/**
 * Capture a server-side event
 * Safe to call even if PostHog is not configured
 */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const client = getPostHogServer();
  if (!client) return;

  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      $lib: "posthog-node",
      source: "server",
    },
  });
}

/**
 * Set user properties server-side
 */
export function setServerUserProperties(
  distinctId: string,
  properties: Record<string, unknown>
) {
  const client = getPostHogServer();
  if (!client) return;

  client.identify({
    distinctId,
    properties,
  });
}

/**
 * Extract PostHog distinct_id from cookie string
 * Used to link server-side errors to client sessions
 */
export function extractDistinctIdFromCookies(
  cookieString: string | null
): string | undefined {
  if (!cookieString) return undefined;

  // PostHog cookie format: ph_<project_key>_posthog=<json_encoded_data>
  const postHogCookieMatch = cookieString.match(/ph_[^_]+_posthog=([^;]+)/);

  if (postHogCookieMatch && postHogCookieMatch[1]) {
    try {
      const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
      const postHogData = JSON.parse(decodedCookie);
      return postHogData.distinct_id;
    } catch {
      // Cookie parsing failed - not critical
      return undefined;
    }
  }

  return undefined;
}
