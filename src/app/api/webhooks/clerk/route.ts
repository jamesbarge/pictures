/**
 * Clerk Webhooks Handler
 * Handles user lifecycle events from Clerk
 * - user.created: Track new signups, set initial properties
 * - user.updated: Sync profile changes to Supabase and PostHog
 * - user.deleted: Clean up user data (GDPR compliance)
 * - session.created: Track login events
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/db";
import { users, userFilmStatuses, userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  captureServerEvent,
  setServerUserProperties,
} from "@/lib/posthog-server";

// Clerk webhook event types
interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
}

interface ClerkSessionData {
  id: string;
  user_id: string;
  created_at: number;
}

interface WebhookEvent {
  type: string;
  data: ClerkUserData | ClerkSessionData;
}

/**
 * Verify Clerk webhook signature
 */
async function verifyWebhook(
  request: NextRequest
): Promise<WebhookEvent | null> {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[Webhook] Missing CLERK_WEBHOOK_SECRET");
    return null;
  }

  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") || "",
    "svix-timestamp": request.headers.get("svix-timestamp") || "",
    "svix-signature": request.headers.get("svix-signature") || "",
  };

  try {
    const wh = new Webhook(webhookSecret);
    return wh.verify(payload, headers) as WebhookEvent;
  } catch (error) {
    console.error("[Webhook] Verification failed:", error);
    return null;
  }
}

/**
 * Handle user.created event
 * - Track signup in PostHog
 * - Set initial user properties
 */
async function handleUserCreated(userData: ClerkUserData) {
  const email = userData.email_addresses[0]?.email_address;
  const fullName = [userData.first_name, userData.last_name]
    .filter(Boolean)
    .join(" ");

  // Track user created event
  captureServerEvent(userData.id, "user_created", {
    source: "webhook",
    email_domain: email?.split("@")[1],
    has_name: !!fullName,
    has_image: !!userData.image_url,
    signup_timestamp: new Date(userData.created_at).toISOString(),
  });

  // Set initial user properties in PostHog
  setServerUserProperties(userData.id, {
    email,
    name: fullName || null,
    created_at: new Date(userData.created_at).toISOString(),
    signup_source: "webhook",
    has_profile_image: !!userData.image_url,
  });

  console.log("[Webhook] Processed user.created for:", userData.id);
}

/**
 * Handle user.updated event
 * - Update user record in Supabase
 * - Sync updated properties to PostHog
 */
async function handleUserUpdated(userData: ClerkUserData) {
  const email = userData.email_addresses[0]?.email_address;
  const fullName = [userData.first_name, userData.last_name]
    .filter(Boolean)
    .join(" ");

  // Update user in Supabase if they exist
  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userData.id),
  });

  if (existingUser) {
    await db
      .update(users)
      .set({
        email: email || null,
        displayName: fullName || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userData.id));
  }

  // Update user properties in PostHog
  setServerUserProperties(userData.id, {
    email,
    name: fullName || null,
    updated_at: new Date(userData.updated_at).toISOString(),
    has_profile_image: !!userData.image_url,
  });

  // Track the update event
  captureServerEvent(userData.id, "user_profile_updated", {
    source: "webhook",
    fields_updated: ["email", "name", "image"].filter((field) => {
      if (field === "email") return !!email;
      if (field === "name") return !!fullName;
      if (field === "image") return !!userData.image_url;
      return false;
    }),
  });

  console.log("[Webhook] Processed user.updated for:", userData.id);
}

/**
 * Handle user.deleted event
 * - Remove user data from Supabase (GDPR compliance)
 * - Track deletion in PostHog
 */
async function handleUserDeleted(userData: ClerkUserData) {
  // Track deletion before removing data
  captureServerEvent(userData.id, "user_deleted", {
    source: "webhook",
    deletion_timestamp: new Date().toISOString(),
  });

  // Delete user data from Supabase
  // Delete film statuses first (foreign key constraint)
  await db
    .delete(userFilmStatuses)
    .where(eq(userFilmStatuses.userId, userData.id));

  // Delete user preferences
  await db
    .delete(userPreferences)
    .where(eq(userPreferences.userId, userData.id));

  // Delete user record
  await db.delete(users).where(eq(users.id, userData.id));

  console.log("[Webhook] Processed user.deleted for:", userData.id);
}

/**
 * Handle session.created event
 * - Track login events
 */
async function handleSessionCreated(sessionData: ClerkSessionData) {
  captureServerEvent(sessionData.user_id, "session_created", {
    source: "webhook",
    session_id: sessionData.id,
    login_timestamp: new Date(sessionData.created_at).toISOString(),
  });

  console.log("[Webhook] Processed session.created for:", sessionData.user_id);
}

/**
 * POST /api/webhooks/clerk
 * Receives and processes Clerk webhook events
 */
export async function POST(request: NextRequest) {
  // Verify webhook signature
  const event = await verifyWebhook(request);

  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    switch (event.type) {
      case "user.created":
        await handleUserCreated(event.data as ClerkUserData);
        break;

      case "user.updated":
        await handleUserUpdated(event.data as ClerkUserData);
        break;

      case "user.deleted":
        await handleUserDeleted(event.data as ClerkUserData);
        break;

      case "session.created":
        await handleSessionCreated(event.data as ClerkSessionData);
        break;

      default:
        console.log("[Webhook] Unhandled event type:", event.type);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Webhook] Error processing event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
