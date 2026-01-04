"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, Suspense, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useCookieConsent } from "@/stores/cookie-consent";

/**
 * Admin emails to exclude from all PostHog tracking.
 * These users will be completely invisible in analytics.
 */
const ADMIN_EMAILS = [
  "jdwbarge@gmail.com",
  // Add other admin emails here
];

/**
 * Check if an email belongs to an admin who should be excluded from tracking
 */
function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Initialize PostHog with privacy-first defaults.
 * Tracking is disabled by default and only enabled after explicit consent.
 */
if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    // Use reverse proxy to avoid ad blockers
    api_host: "/ingest",
    // UI host for PostHog toolbar and feature flags UI
    ui_host: "https://eu.posthog.com",
    // Capture pageviews manually for App Router compatibility
    capture_pageview: false,
    // Capture pageleaves for session replay accuracy
    capture_pageleave: true,

    // PRIVACY: Don't persist data until consent is given
    // This prevents cookies from being set before consent
    persistence: "memory",

    // PRIVACY: Opt out of tracking by default (PECR/UK GDPR compliance)
    opt_out_capturing_by_default: true,

    // Session Replay - record user sessions (only after consent)
    disable_session_recording: true, // Will be enabled after consent via startSessionRecording()
    session_recording: {
      // Mask all text inputs for privacy
      maskAllInputs: true,
      // Mask sensitive text content
      maskTextSelector: "[data-ph-mask]",
    },

    // Autocapture settings (only active after consent)
    autocapture: {
      // Capture clicks, form submissions, etc.
      dom_event_allowlist: ["click", "submit", "change"],
      // Capture useful element attributes
      element_allowlist: ["button", "a", "input", "select", "textarea"],
    },

    // Performance - capture web vitals (only after consent)
    capture_performance: true,

    // Error tracking - capture exceptions (only after consent)
    capture_exceptions: true,

    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") {
        posthog.debug();
        console.log("[PostHog] Initialized with opt_out_capturing_by_default=true");
      }
    },
  });
}

/**
 * Component to manage consent state and update PostHog accordingly.
 * IMPORTANT: set_config alone doesn't start session recording - we need startSessionRecording()
 */
function PostHogConsentManager() {
  const posthogClient = usePostHog();
  const analyticsConsent = useCookieConsent((state) => state.analyticsConsent);
  const lastAppliedConsent = useRef<string | null>(null);

  useEffect(() => {
    if (!posthogClient) return;

    // Skip if we've already processed this consent state
    if (lastAppliedConsent.current === analyticsConsent) return;

    if (analyticsConsent === "accepted") {
      // User accepted - enable tracking with persistent storage
      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] Consent accepted - enabling tracking and session recording");
      }

      posthogClient.opt_in_capturing();

      // Update persistence to use cookies/localStorage
      posthogClient.set_config({
        persistence: "localStorage+cookie",
      });

      // CRITICAL: Actually start session recording
      // set_config({ disable_session_recording: false }) doesn't start it!
      posthogClient.startSessionRecording();

      lastAppliedConsent.current = "accepted";

      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] Session recording started, capturing opted in");
      }
    } else if (analyticsConsent === "rejected") {
      // User rejected - ensure tracking is disabled
      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] Consent rejected - disabling all tracking");
      }

      posthogClient.opt_out_capturing();
      posthogClient.stopSessionRecording();

      lastAppliedConsent.current = "rejected";
    } else if (analyticsConsent === "pending") {
      // Reset state tracking for fresh consent
      lastAppliedConsent.current = null;
    }
  }, [posthogClient, analyticsConsent]);

  return null;
}

/**
 * Component to track pageviews with App Router.
 * Respects both cookie consent and admin exclusion.
 */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogClient = usePostHog();
  const canTrack = useCookieConsent((state) => state.canTrack());
  const { user, isLoaded } = useUser();

  useEffect(() => {
    // Don't track if no consent, PostHog not ready, or user is admin
    if (!pathname || !posthogClient || !canTrack) return;
    if (isLoaded && user && isAdminEmail(user.primaryEmailAddress?.emailAddress)) {
      return; // Skip pageview tracking for admins
    }

    let url = window.origin + pathname;
    if (searchParams.toString()) {
      url = url + "?" + searchParams.toString();
    }
    posthogClient.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, posthogClient, canTrack, user, isLoaded]);

  return null;
}

/**
 * Component to identify users with Clerk.
 * Admin users are completely excluded from all tracking.
 */
function PostHogUserIdentify() {
  const { user, isLoaded } = useUser();
  const posthogClient = usePostHog();
  const canTrack = useCookieConsent((state) => state.canTrack());
  const isAdminOptedOut = useRef(false);

  useEffect(() => {
    if (!isLoaded || !posthogClient) return;

    if (user) {
      const userEmail = user.primaryEmailAddress?.emailAddress;

      // Check if this is an admin user who should be excluded
      if (isAdminEmail(userEmail)) {
        if (!isAdminOptedOut.current) {
          if (process.env.NODE_ENV === "development") {
            console.log("[PostHog] Admin user detected - opting out of all tracking");
          }

          // Completely disable tracking for admin users
          posthogClient.opt_out_capturing();
          posthogClient.stopSessionRecording();
          posthogClient.reset(); // Clear any existing identity

          isAdminOptedOut.current = true;
        }
        return; // Don't identify admin users
      }

      // Reset admin flag if user changed
      isAdminOptedOut.current = false;

      // Only identify non-admin users who have consented
      if (canTrack) {
        posthogClient.identify(user.id, {
          email: userEmail,
          name: user.fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          imageUrl: user.imageUrl,
          createdAt: user.createdAt,
        });

        if (process.env.NODE_ENV === "development") {
          console.log("[PostHog] User identified:", user.id);
        }
      }
    } else {
      // User signed out - reset PostHog identity
      isAdminOptedOut.current = false;
      posthogClient.reset();
    }
  }, [user, isLoaded, posthogClient, canTrack]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogConsentManager />
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogUserIdentify />
      {children}
    </PHProvider>
  );
}

/**
 * Export admin email check for use in other components.
 * Use this to exclude admin activity from any custom tracking.
 */
export { isAdminEmail, ADMIN_EMAILS };

/**
 * Hook to check if current user is an admin (excluded from analytics).
 * Returns undefined while loading, true/false once determined.
 */
export function useIsAdminUser(): boolean | undefined {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return undefined;
  if (!user) return false;

  return isAdminEmail(user.primaryEmailAddress?.emailAddress);
}
