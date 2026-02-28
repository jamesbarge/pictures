import { auth, currentUser } from "@clerk/nextjs/server";
import { getAdminEmailAllowlist, isAdminEmail } from "@/lib/admin-emails";

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

export interface AdminAuthContext {
  userId: string;
  email: string | null;
}

/**
 * Require admin authentication for API/admin operations.
 * Returns either admin context or an HTTP response to return directly.
 */
export async function requireAdmin(): Promise<AdminAuthContext | Response> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return unauthorizedResponse();
  }

  // Fast path: check session claim email if present.
  const claimEmail =
    typeof sessionClaims === "object" &&
    sessionClaims !== null &&
    "email" in sessionClaims &&
    typeof (sessionClaims as Record<string, unknown>).email === "string"
      ? ((sessionClaims as Record<string, unknown>).email as string).toLowerCase()
      : null;

  if (claimEmail && isAdminEmail(claimEmail)) {
    return { userId, email: claimEmail };
  }

  // Fallback: fetch full Clerk user and evaluate all emails.
  const user = await currentUser();
  const userEmails =
    user?.emailAddresses
      .map((item) => item.emailAddress?.toLowerCase())
      .filter((email): email is string => Boolean(email)) ?? [];

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
