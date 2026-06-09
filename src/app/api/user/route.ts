import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { currentUser } from "@clerk/nextjs/server";
import { ensureUserRecord } from "@/lib/user-record";

/**
 * GET /api/user - Get or create the current user's record
 * Creates the user record if it doesn't exist (on first sign-in)
 */
export async function GET() {
  try {
    const userId = await requireAuth();
    const clerkUser = await currentUser();
    const displayName = clerkUser?.firstName
      ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}`
      : undefined;

    await ensureUserRecord(userId, {
      email: clerkUser?.emailAddresses[0]?.emailAddress,
      displayName,
      fullName: clerkUser?.fullName,
      source: "user_profile",
    });

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error, "GET /api/user");
  }
}
