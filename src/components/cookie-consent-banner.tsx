/**
 * Cookie Consent Banner
 * PECR/UK GDPR compliant cookie consent banner.
 * Shows at bottom of screen until user makes a choice.
 */

"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { useHydrated } from "@/hooks/useHydrated";
import { useCookieConsent } from "@/stores/cookie-consent";

export function CookieConsentBanner() {
  const hydrated = useHydrated();
  const analyticsConsent = useCookieConsent((state) => state.analyticsConsent);
  const acceptAnalytics = useCookieConsent((state) => state.acceptAnalytics);
  const rejectAnalytics = useCookieConsent((state) => state.rejectAnalytics);

  // Don't render on server or if user has already made a choice
  if (!hydrated || analyticsConsent !== "pending") {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6"
    >
      <div className="max-w-2xl mx-auto bg-background-secondary border border-border-subtle rounded-xl shadow-lg">
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent-primary/10 text-accent-primary shrink-0">
              <Cookie className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2
                id="cookie-consent-title"
                className="font-display text-lg text-text-primary text-balance"
              >
                Cookie preferences
              </h2>
            </div>
          </div>

          {/* Description */}
          <p
            id="cookie-consent-description"
            className="text-sm text-text-secondary mb-4 leading-relaxed"
          >
            We use cookies to see which features get used and to fix bugs. This
            includes analytics and session recordings.{" "}
            <Link
              href="/privacy"
              className="text-accent-primary hover:underline"
            >
              Learn more
            </Link>
          </p>

          {/* Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={rejectAnalytics}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-text-secondary bg-background-tertiary hover:bg-background-hover border border-border-subtle rounded-lg transition-colors"
            >
              Reject non-essential
            </button>
            <button
              onClick={acceptAnalytics}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-text-inverse bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors"
            >
              Accept all
            </button>
          </div>

          {/* Essential cookies note */}
          <p className="text-xs text-text-tertiary mt-3">
            Essential cookies for authentication are always enabled.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact cookie settings component for the settings page
 */
export function CookieConsentSettings() {
  const analyticsConsent = useCookieConsent((state) => state.analyticsConsent);
  const consentUpdatedAt = useCookieConsent((state) => state.consentUpdatedAt);
  const acceptAnalytics = useCookieConsent((state) => state.acceptAnalytics);
  const rejectAnalytics = useCookieConsent((state) => state.rejectAnalytics);

  const formatDate = (isoString: string | null) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-4">
      {/* Current status */}
      <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
        <div>
          <p className="text-sm font-medium text-text-primary">
            Analytics cookies
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {analyticsConsent === "accepted" && "Enabled"}
            {analyticsConsent === "rejected" && "Disabled"}
            {analyticsConsent === "pending" && "Not set"}
            {consentUpdatedAt && ` · Updated ${formatDate(consentUpdatedAt)}`}
          </p>
        </div>
        <div
          className={`w-3 h-3 rounded-full ${
            analyticsConsent === "accepted"
              ? "bg-accent-success"
              : analyticsConsent === "rejected"
                ? "bg-accent-danger"
                : "bg-accent-highlight"
          }`}
        />
      </div>

      {/* Toggle buttons */}
      <div className="flex gap-2">
        <button
          onClick={acceptAnalytics}
          disabled={analyticsConsent === "accepted"}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            analyticsConsent === "accepted"
              ? "bg-accent-primary text-text-inverse cursor-default"
              : "bg-background-tertiary text-text-secondary hover:bg-background-hover border border-border-subtle"
          }`}
        >
          Enable
        </button>
        <button
          onClick={rejectAnalytics}
          disabled={analyticsConsent === "rejected"}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            analyticsConsent === "rejected"
              ? "bg-accent-danger text-text-inverse cursor-default"
              : "bg-background-tertiary text-text-secondary hover:bg-background-hover border border-border-subtle"
          }`}
        >
          Disable
        </button>
      </div>

      {/* Info text */}
      <p className="text-xs text-text-tertiary">
        Analytics help us understand how you use Pictures. We use PostHog for
        privacy-focused analytics. Session recordings are masked to protect
        sensitive information.
      </p>
    </div>
  );
}
