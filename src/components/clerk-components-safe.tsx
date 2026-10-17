"use client";

/**
 * Safe wrapper for Clerk's UserButton that renders nothing when there's no valid Clerk key.
 *
 * Uses a dynamic import to completely avoid loading @clerk/nextjs when no valid key exists.
 */

import dynamic from "next/dynamic";

// Check if we have a valid Clerk key at build time
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const hasValidClerkKey =
  !!publishableKey &&
  publishableKey.startsWith("pk_") &&
  publishableKey !== "disabled";

export const SafeUserButton = hasValidClerkKey
  ? dynamic(() => import("@clerk/nextjs").then((mod) => mod.UserButton), {
      ssr: false,
      loading: () => null,
    })
  : () => null;
