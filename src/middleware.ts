import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk Middleware Configuration
 *
 * Currently all routes are PUBLIC (beta phase).
 * This middleware adds Clerk context to all requests
 * without protecting any routes.
 *
 * Future: Add route protection for subscription features:
 * - /account - User profile, subscription management
 * - /api/sync - Sync localStorage to database
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
