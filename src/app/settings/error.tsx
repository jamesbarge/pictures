"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      posthog.captureException(error, {
        error_digest: error.digest,
        error_boundary: "settings",
      });
    } catch {
      // PostHog may not be initialized — error boundary must not crash
    }
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
          We hit an unexpected error loading this page. Try again, or head back
          to the calendar.
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
            className="px-6 py-2.5 border border-border-default rounded-lg hover:bg-background-secondary transition-colors font-medium text-center"
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
