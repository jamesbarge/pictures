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
 * Alias an anonymous user to an authenticated user
 * This links pre-signup behavior to the authenticated user
 */
export function aliasServerUser(anonymousId: string, userId: string) {
  const client = getPostHogServer();
  if (!client) return;

  client.alias({
    distinctId: userId,
    alias: anonymousId,
  });
}

/**
 * Flush all pending events (call during graceful shutdown)
 */
export async function flushPostHogServer() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}
