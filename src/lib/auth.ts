import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getAdminEmailAllowlist,
  getVerifiedEmailAddresses,
} from "@/lib/admin-emails";

/**
 * Get the current user's ID, or null if not signed in.
 * Use this in API routes that can work for both signed-in and anonymous users.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Require authentication - throws an error if user is not signed in.
 * Use this in API routes that require authentication.
 */
export async function requireAuth(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

/** Authenticated admin context returned by requireAdmin() on success */
interface AdminAuthContext {
  userId: string;
  email: string | null;
}

/**
 * Require admin authentication for API/admin operations.
 * Returns either admin context or an HTTP response to return directly.
 */
export async function requireAdmin(): Promise<AdminAuthContext | Response> {
  const { userId } = await auth();
  if (!userId) {
    return unauthorizedResponse();
  }

  // Session claims do not prove that an email address is verified, so always
  // fetch the Clerk user before evaluating the admin allowlist.
  const user = await currentUser();
  const userEmails = getVerifiedEmailAddresses(user?.emailAddresses);

  const allowlist = getAdminEmailAllowlist();
  const matchingEmail = userEmails.find((email) => allowlist.includes(email));

  if (!matchingEmail) {
    return forbiddenResponse();
  }

  return {
    userId,
    email: matchingEmail,
  };
}

/**
 * Create a standardized unauthorized response
 */
export function unauthorizedResponse() {
  return Response.json(
    { error: "Unauthorized" },
    { status: 401 }
  );
}

/**
 * Create a standardized forbidden response
 */
export function forbiddenResponse() {
  return Response.json(
    { error: "Forbidden" },
    { status: 403 }
  );
}

/**
 * Verify that a request comes from Vercel Cron via the CRON_SECRET bearer token.
 * Used by cron route handlers to authenticate scheduled invocations.
 */
export function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

/**
 * Higher-order function that wraps a Next.js route handler with admin auth.
 * Eliminates the repeated requireAdmin() + instanceof check boilerplate.
 *
 * Static routes:  export const POST = withAdminAuth(async (req, admin) => { ... });
 * Dynamic routes: export const PUT = withAdminAuth<RouteParams>(async (req, admin, ctx) => { ... });
 */
export function withAdminAuth<C = unknown>(
  handler: (req: Request, admin: AdminAuthContext, context: C) => Promise<Response>
): (req: Request, context: C) => Promise<Response> {
  return async (req: Request, context: C): Promise<Response> => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    return handler(req, admin, context);
  };
}
