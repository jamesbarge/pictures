"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

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
      <body className="antialiased bg-[#FBF7F0] text-[#1A1A1A]">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="mb-6">
              <span className="text-6xl">:(</span>
            </div>
            <h1 className="text-2xl font-semibold mb-3">
              Something went seriously wrong
            </h1>
            <p className="text-[#4A4A4A] mb-6">
              We encountered a critical error. Please try refreshing the page.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={reset}
                className="px-6 py-2.5 bg-[#1E3A5F] text-white rounded-lg hover:bg-[#1E3A5F]/90 transition-colors font-medium"
              >
                Try again
              </button>
              <a
                href="/"
                className="px-6 py-2.5 border border-[#E5E0D5] rounded-lg hover:bg-[#EDE8DD] transition-colors font-medium"
              >
                Go home
              </a>
            </div>
            {process.env.NODE_ENV === "development" && error.message && (
              <details className="mt-8 text-left">
                <summary className="text-sm text-[#4A4A4A] cursor-pointer hover:text-[#1A1A1A]">
                  Error details
                </summary>
                <pre className="mt-2 p-4 bg-[#EDE8DD] rounded-lg text-xs overflow-auto text-red-600">
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
