import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { captureServerEvent, setServerUserProperties } from "@/lib/posthog-server";

interface EnsureUserRecordOptions {
  email?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  source?: string;
}

/**
 * Ensure an authenticated Clerk user has the parent row required by user-data
 * foreign keys. The conflict-safe insert also handles concurrent first writes.
 */
export async function ensureUserRecord(
  userId: string,
  options: EnsureUserRecordOptions = {}
): Promise<boolean> {
  const [inserted] = await db
    .insert(users)
    .values({
      id: userId,
      email: options.email ?? null,
      displayName: options.displayName ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (!inserted && (options.email !== undefined || options.displayName !== undefined)) {
    await db
      .update(users)
      .set({
        ...(options.email !== undefined ? { email: options.email } : {}),
        ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  if (!inserted) return false;

  const source = options.source ?? "user_write";
  captureServerEvent(userId, "user_created", {
    source,
    email_domain: options.email?.split("@")[1],
    has_name: !!options.displayName,
  });

  setServerUserProperties(userId, {
    created_at: new Date().toISOString(),
    signup_source: source,
    email: options.email ?? undefined,
    name: options.fullName ?? options.displayName ?? undefined,
  });

  return true;
}
