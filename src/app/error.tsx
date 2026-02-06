"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for route segments.
 * Captures React rendering errors and reports them to PostHog.
 * This handles errors within the root layout (nested routes).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report error to PostHog
    posthog.captureException(error, {
      error_digest: error.digest,
      error_boundary: "route",
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-6xl">:(</span>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-3">
          Something went wrong
        </h1>
        <p className="text-text-secondary mb-6">
          We encountered an unexpected error. Our team has been notified and
          is looking into it.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-accent-primary text-text-inverse rounded-lg hover:bg-accent-primary-hover transition-colors font-medium"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 border border-border-default rounded-lg hover:bg-background-secondary transition-colors font-medium"
          >
            Go home
          </Link>
        </div>
        {process.env.NODE_ENV === "development" && error.message && (
          <details className="mt-8 text-left">
            <summary className="text-sm text-text-secondary cursor-pointer hover:text-text-primary">
              Error details
            </summary>
            <pre className="mt-2 p-4 bg-background-secondary rounded-lg text-xs overflow-auto text-accent-danger">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
