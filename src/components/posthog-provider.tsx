"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, Suspense, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@/hooks/useClerkSafe";
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
 * Determine if tracking should be enabled based on consent and admin status.
 * Returns: "enable" | "disable" | "wait"
 * - "enable": User consented and is not an admin
 * - "disable": User rejected consent OR is an admin
 * - "wait": Still loading user data (don't change state yet)
 */
function useTrackingDecision(): "enable" | "disable" | "wait" {
  const analyticsConsent = useCookieConsent((state) => state.analyticsConsent);
  const { user, isLoaded: isUserLoaded } = useUser();

  // If consent is pending, wait
  if (analyticsConsent === "pending") {
    return "wait";
  }

  // If consent was rejected, disable immediately (no need to wait for user)
  if (analyticsConsent === "rejected") {
    return "disable";
  }

  // Consent was accepted - now we need to check admin status
  // If user auth is still loading, wait before enabling
  if (!isUserLoaded) {
    return "wait";
  }

  // User is loaded - check if they're an admin
  if (user && isAdminEmail(user.primaryEmailAddress?.emailAddress)) {
    return "disable";
  }

  // Not an admin (or not signed in) with consent - enable tracking
  return "enable";
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
 * IMPORTANT: This component now also checks admin status BEFORE starting recording
 * to prevent the race condition where recording starts before we know it's an admin.
 */
function PostHogConsentManager() {
  const posthogClient = usePostHog();
  const trackingDecision = useTrackingDecision();
  const lastAppliedDecision = useRef<"enable" | "disable" | null>(null);

  useEffect(() => {
    if (!posthogClient) return;

    // Wait until we have enough information to make a decision
    if (trackingDecision === "wait") {
      return;
    }

    // Skip if we've already applied this decision
    if (lastAppliedDecision.current === trackingDecision) return;

    if (trackingDecision === "enable") {
      // User consented AND is not an admin - enable tracking
      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] Enabling tracking and session recording (consent given, not admin)");
      }

      posthogClient.opt_in_capturing();

      // Update persistence to use cookies/localStorage
      posthogClient.set_config({
        persistence: "localStorage+cookie",
      });

      // Start session recording only after confirming not an admin
      posthogClient.startSessionRecording();

      lastAppliedDecision.current = "enable";

      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] Session recording started");
      }
    } else if (trackingDecision === "disable") {
      // User rejected consent OR is an admin - disable tracking
      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] Disabling all tracking (consent rejected or admin user)");
      }

      posthogClient.opt_out_capturing();
      posthogClient.stopSessionRecording();
      posthogClient.reset(); // Clear any existing identity for admins

      lastAppliedDecision.current = "disable";
    }
  }, [posthogClient, trackingDecision]);

  return null;
}

/**
 * Component to track pageviews with App Router.
 * Uses centralized tracking decision that considers both consent and admin status.
 */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogClient = usePostHog();
  const trackingDecision = useTrackingDecision();

  useEffect(() => {
    // Only track if tracking is enabled (consent given AND not admin)
    if (!pathname || !posthogClient || trackingDecision !== "enable") return;

    let url = window.origin + pathname;
    if (searchParams.toString()) {
      url = url + "?" + searchParams.toString();
    }
    posthogClient.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, posthogClient, trackingDecision]);

  return null;
}

/**
 * Component to identify users with Clerk.
 * Admin exclusion is now handled by PostHogConsentManager via useTrackingDecision.
 */
function PostHogUserIdentify() {
  const { user, isLoaded } = useUser();
  const posthogClient = usePostHog();
  const trackingDecision = useTrackingDecision();
  const lastIdentifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !posthogClient) return;

    // Only identify users if tracking is enabled (not admin, has consent)
    if (trackingDecision !== "enable") {
      // If tracking was disabled and we had identified a user, reset
      if (lastIdentifiedUserId.current !== null) {
        posthogClient.reset();
        lastIdentifiedUserId.current = null;
      }
      return;
    }

    if (user) {
      // Skip if already identified this user
      if (lastIdentifiedUserId.current === user.id) return;

      const userEmail = user.primaryEmailAddress?.emailAddress;

      posthogClient.identify(user.id, {
        email: userEmail,
        name: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
      });

      lastIdentifiedUserId.current = user.id;

      if (process.env.NODE_ENV === "development") {
        console.log("[PostHog] User identified:", user.id);
      }
    } else {
      // User signed out - reset PostHog identity
      if (lastIdentifiedUserId.current !== null) {
        posthogClient.reset();
        lastIdentifiedUserId.current = null;
      }
    }
  }, [user, isLoaded, posthogClient, trackingDecision]);

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
