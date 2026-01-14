"use client";

/**
 * Safe wrappers for Clerk hooks that handle the case when Clerk is not available.
 * This allows the app to work in CI/test environments without a valid Clerk key.
 */

import { useUser as useClerkUser, useAuth as useClerkAuth } from "@clerk/nextjs";

// Check if we have a valid Clerk key
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const hasValidKey =
  publishableKey &&
  publishableKey.startsWith("pk_") &&
  publishableKey !== "disabled";

/**
 * Safe version of useUser that returns null/false values when Clerk is not available.
 */
export function useUser() {
  if (!hasValidKey) {
    return {
      isLoaded: true,
      isSignedIn: false,
      user: null,
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkUser();
}

/**
 * Safe version of useAuth that returns null/false values when Clerk is not available.
 */
export function useAuth() {
  if (!hasValidKey) {
    return {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      orgId: null,
      orgRole: null,
      orgSlug: null,
      signOut: async () => {},
      getToken: async () => null,
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkAuth();
}
