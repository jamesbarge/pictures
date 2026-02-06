import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Clerk Middleware Configuration
 *
 * Public routes: Most of the app is public
 * Protected routes: /admin/* requires authentication AND admin email
 *
 * In CI/test environments without Clerk keys, this middleware
 * is a no-op passthrough.
 */

// Admin email allowlist - only these emails can access /admin/*
const ADMIN_EMAILS = ["jdwbarge@gmail.com"];

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
  const { clerkMiddleware, createRouteMatcher, clerkClient } = await import(
    "@clerk/nextjs/server"
  );

  const isAdminPage = createRouteMatcher(["/admin(.*)"]);
  const isAdminApi = createRouteMatcher(["/api/admin(.*)"]);

  return clerkMiddleware(async (auth, req) => {
    // Protect admin pages - require sign-in AND admin email
    if (isAdminPage(req)) {
      const { userId } = await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
      });

      // Check if user's email is in the admin allowlist
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmails = user.emailAddresses.map((e) => e.emailAddress);
      const isAdmin = userEmails.some((email) => ADMIN_EMAILS.includes(email));

      if (!isAdmin) {
        // Redirect non-admin users to home page
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    // Protect admin API routes - require sign-in AND admin email
    if (isAdminApi(req)) {
      const { userId } = await auth.protect();

      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmails = user.emailAddresses.map((e) => e.emailAddress);
      const isAdmin = userEmails.some((email) => ADMIN_EMAILS.includes(email));

      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
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
