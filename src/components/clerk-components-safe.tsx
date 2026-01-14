"use client";

/**
 * Safe wrappers for Clerk UI components that handle the case when Clerk is not available.
 * These components render nothing (or children for wrappers) when there's no valid Clerk key.
 *
 * Uses dynamic imports to completely avoid loading @clerk/nextjs when no valid key exists.
 */

import { ReactNode, useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Check if we have a valid Clerk key at build time
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
export const hasValidClerkKey =
  !!publishableKey &&
  publishableKey.startsWith("pk_") &&
  publishableKey !== "disabled";

// Only dynamically import Clerk components if we have a valid key
const DynamicUserButton = hasValidClerkKey
  ? dynamic(() => import("@clerk/nextjs").then((mod) => mod.UserButton), {
      ssr: false,
      loading: () => null,
    })
  : () => null;

const DynamicSignInButton = hasValidClerkKey
  ? dynamic(() => import("@clerk/nextjs").then((mod) => mod.SignInButton), {
      ssr: false,
      loading: () => null,
    })
  : () => null;

// For SignedIn/SignedOut, we need wrapper components
function SignedInWrapper({ children }: { children: ReactNode }) {
  const [ClerkSignedIn, setClerkSignedIn] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    if (hasValidClerkKey) {
      import("@clerk/nextjs").then((mod) => {
        setClerkSignedIn(() => mod.SignedIn);
      });
    }
  }, []);

  if (!hasValidClerkKey || !ClerkSignedIn) {
    return null;
  }

  return <ClerkSignedIn>{children}</ClerkSignedIn>;
}

function SignedOutWrapper({ children }: { children: ReactNode }) {
  const [ClerkSignedOut, setClerkSignedOut] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    if (hasValidClerkKey) {
      import("@clerk/nextjs").then((mod) => {
        setClerkSignedOut(() => mod.SignedOut);
      });
    }
  }, []);

  if (!hasValidClerkKey || !ClerkSignedOut) {
    return null;
  }

  return <ClerkSignedOut>{children}</ClerkSignedOut>;
}

// Export safe versions
export const SafeUserButton = DynamicUserButton;
export const SafeSignInButton = DynamicSignInButton;
export const SafeSignedIn = SignedInWrapper;
export const SafeSignedOut = SignedOutWrapper;
