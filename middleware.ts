import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Clerk Middleware Configuration
 *
 * Currently all routes are PUBLIC (beta phase).
 * This middleware adds Clerk context to all requests
 * without protecting any routes.
 *
 * In CI/test environments without Clerk keys, this middleware
 * is a no-op passthrough.
 */

// Check if we have a valid Clerk key
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const hasValidClerkKey =
  publishableKey &&
  publishableKey.startsWith("pk_") &&
  publishableKey !== "disabled";

// Dynamic middleware based on Clerk availability
export default async function middleware(request: NextRequest) {
  if (!hasValidClerkKey) {
    // No valid Clerk key - passthrough (CI/test mode)
    return NextResponse.next();
  }

  // Dynamically import and run Clerk middleware only when key is valid
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  return clerkMiddleware()(request, {} as never);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
