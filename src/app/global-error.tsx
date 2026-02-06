"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import Link from "next/link";

/**
 * Global error boundary for the root layout.
 * Captures catastrophic errors that break the entire app.
 * Must include <html> and <body> tags since root layout may have failed.
 */
export default function GlobalError({
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
      error_boundary: "global",
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased bg-background-primary text-text-primary">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="mb-6">
              <span className="text-6xl">:(</span>
            </div>
            <h1 className="text-2xl font-semibold mb-3">
              Something went seriously wrong
            </h1>
            <p className="text-text-secondary mb-6">
              We encountered a critical error. Please try refreshing the page.
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
                className="px-6 py-2.5 border border-border-default rounded-lg hover:bg-background-tertiary transition-colors font-medium"
              >
                Go home
              </Link>
            </div>
            {process.env.NODE_ENV === "development" && error.message && (
              <details className="mt-8 text-left">
                <summary className="text-sm text-text-secondary cursor-pointer hover:text-text-primary">
                  Error details
                </summary>
                <pre className="mt-2 p-4 bg-background-tertiary rounded-lg text-xs overflow-auto text-accent-danger">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
