"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

// Initialize PostHog only on the client side
if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
    // Capture pageviews manually for App Router compatibility
    capture_pageview: false,
    // Capture pageleaves for session replay accuracy
    capture_pageleave: true,

    // Session Replay - record user sessions
    disable_session_recording: false,
    session_recording: {
      // Mask all text inputs for privacy
      maskAllInputs: true,
      // Mask sensitive text content
      maskTextSelector: '[data-ph-mask]',
    },

    // Autocapture settings
    autocapture: {
      // Capture clicks, form submissions, etc.
      dom_event_allowlist: ['click', 'submit', 'change'],
      // Capture useful element attributes
      element_allowlist: ['button', 'a', 'input', 'select', 'textarea'],
    },

    // Performance - capture web vitals
    capture_performance: true,

    // Error tracking - capture exceptions
    capture_exceptions: true,

    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") {
        posthog.debug();
      }
    },
  });
}

// Component to track pageviews with App Router
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + "?" + searchParams.toString();
      }
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}

// Component to identify users with Clerk
function PostHogUserIdentify() {
  const { user, isLoaded } = useUser();
  const posthog = usePostHog();

  useEffect(() => {
    if (!isLoaded || !posthog) return;

    if (user) {
      // Identify the user in PostHog
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
      });
    } else {
      // User signed out - reset PostHog identity
      posthog.reset();
    }
  }, [user, isLoaded, posthog]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogUserIdentify />
      {children}
    </PHProvider>
  );
}
