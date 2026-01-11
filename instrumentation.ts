/**
 * Next.js Instrumentation - Server-side error tracking with PostHog
 *
 * This file runs on both Node.js and Edge runtimes.
 * The onRequestError hook captures server-side errors and sends them to PostHog.
 */

import type { Instrumentation } from "next";

export function register() {
  // Initialization runs once when the server starts
  // PostHog client is lazily initialized on first use
}

/**
 * Capture server-side request errors and send to PostHog
 * This handles errors from API routes, server components, and middleware
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getPostHogServer, extractDistinctIdFromCookies } = await import(
      "./src/lib/posthog-server"
    );

    const posthog = getPostHogServer();
    if (!posthog) return;

    // Extract distinct_id from PostHog cookie to link error to user session
    const cookieHeader = request.headers["cookie"];
    const cookieString = Array.isArray(cookieHeader)
      ? cookieHeader[0]
      : cookieHeader;
    const distinctId = extractDistinctIdFromCookies(cookieString || null);

    // Capture the exception with context
    posthog.captureException(err, distinctId || undefined, {
      // Request context
      $current_url: request.path,
      request_method: request.method,

      // Next.js routing context
      router_kind: context.routerKind,
      route_path: context.routePath,
      route_type: context.routeType,

      // Error metadata
      $lib: "posthog-node",
      source: "server-instrumentation",
    });

    // Flush immediately for critical errors
    await posthog.flush();
  }
};
