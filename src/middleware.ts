import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Clerk Middleware Configuration
 *
 * Public routes: Most of the app is public
 * Protected routes: /admin/* requires authentication
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

export default async function middleware(request: NextRequest) {
  if (!hasValidClerkKey) {
    // No valid Clerk key - passthrough (CI/test mode)
    // Block admin routes in CI mode for safety
    if (request.nextUrl.pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Dynamically import Clerk middleware when key is valid
  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );

  const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

  return clerkMiddleware(async (auth, req) => {
    // Protect admin routes - require sign-in
    if (isAdminRoute(req)) {
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
      });
    }
  })(request, {} as never);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
