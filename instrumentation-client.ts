import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  // Set tracesSampleRate to 1.0 for development, lower for production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Configure which URLs receive trace headers for distributed tracing
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/pictures\.london/,
  ],

  // Enable browser tracing integration (automatic in @sentry/nextjs)
  integrations: [
    Sentry.browserTracingIntegration({
      // Only create spans for our own API
      shouldCreateSpanForRequest: (url) => {
        return !url.includes("/ingest"); // Skip PostHog proxy
      },
    }),
  ],

  // Disable in development for cleaner console
  enabled: process.env.NODE_ENV === "production",
});

// Required for Next.js App Router navigation tracking
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
