import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { currentUser } from "@clerk/nextjs/server";

/**
 * GET /api/user - Get or create the current user's record
 * Creates the user record if it doesn't exist (on first sign-in)
 */
export async function GET() {
  try {
    const userId = await requireAuth();
    const clerkUser = await currentUser();

    // Try to find existing user
    let user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    // Create user if doesn't exist
    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email: clerkUser?.emailAddresses[0]?.emailAddress || null,
          displayName: clerkUser?.firstName
            ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}`
            : null,
        })
        .returning();
      user = newUser;
    }

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error, "GET /api/user");
  }
}
