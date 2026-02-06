import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminEmailAllowlist } from "@/lib/admin-emails";

/**
 * Clerk Middleware Configuration
 *
 * Public routes: Most of the app is public
 * Protected routes:
 * - /admin/* requires authentication + admin email
 * - /api/admin/* requires authentication + admin email
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
    // Block admin routes in CI mode for safety.
    if (request.nextUrl.pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (request.nextUrl.pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Dynamically import Clerk middleware when key is valid
  const { clerkMiddleware, createRouteMatcher, clerkClient } = await import(
    "@clerk/nextjs/server"
  );

  const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);
  const adminEmails = getAdminEmailAllowlist();

  return clerkMiddleware(async (auth, req) => {
    // Protect admin routes - require sign-in AND admin email
    if (isAdminRoute(req)) {
      const isAdminApiRoute = req.nextUrl.pathname.startsWith("/api/admin");
      let userId: string | null = null;

      if (isAdminApiRoute) {
        const authResult = await auth();
        userId = authResult.userId;
        if (!userId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      } else {
        const protectedAuth = await auth.protect({
          unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
        });
        userId = protectedAuth.userId;
      }

      // Check if user's email is in the admin allowlist
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmails = user.emailAddresses.map((e) =>
        e.emailAddress.toLowerCase()
      );
      const isAdmin = userEmails.some((email) => adminEmails.includes(email));

      if (!isAdmin) {
        if (isAdminApiRoute) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        // Redirect non-admin users to home page.
        return NextResponse.redirect(new URL("/", req.url));
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
