/**
 * Next.js Instrumentation - Server-side error tracking with PostHog
 *
 * This file runs on both Node.js and Edge runtimes.
 * The onRequestError hook captures server-side errors and sends them to PostHog.
 */

export function register() {
  // Initialization runs once when the server starts
  // PostHog client is lazily initialized on first use
}

/**
 * Capture server-side request errors and send to PostHog
 * This handles errors from API routes, server components, and middleware
 */
export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: { cookie?: string; "user-agent"?: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource?: "react-server-components" | "react-server-components-payload";
    revalidateReason?: "on-demand" | "stale" | undefined;
    renderType?: "dynamic" | "dynamic-resume";
  }
) => {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getPostHogServer, extractDistinctIdFromCookies } = await import(
      "./src/lib/posthog-server"
    );

    const posthog = getPostHogServer();
    if (!posthog) return;

    // Extract distinct_id from PostHog cookie to link error to user session
    const distinctId = extractDistinctIdFromCookies(
      request.headers.cookie || null
    );

    // Capture the exception with context
    posthog.captureException(err, distinctId || undefined, {
      // Request context
      $current_url: request.path,
      request_method: request.method,
      user_agent: request.headers["user-agent"],

      // Next.js routing context
      router_kind: context.routerKind,
      route_path: context.routePath,
      route_type: context.routeType,
      render_source: context.renderSource,
      revalidate_reason: context.revalidateReason,
      render_type: context.renderType,

      // Error metadata
      $lib: "posthog-node",
      source: "server-instrumentation",
    });

    // Flush immediately for critical errors
    await posthog.flush();
  }
};
