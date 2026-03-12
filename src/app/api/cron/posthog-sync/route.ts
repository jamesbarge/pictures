/**
 * PostHog User Sync Cron Job
 *
 * Batch syncs all user product data from Supabase to PostHog.
 * This ensures PostHog person profiles stay up-to-date with:
 * - Watchlist counts
 * - Engagement tiers
 * - Favorite cinemas
 *
 * Runs daily via Vercel Cron (suggested: 5am UK time, after cleanup)
 */

import { NextRequest, NextResponse } from "next/server";
import { syncAllUsersToPostHog } from "@/lib/posthog-supabase-sync";

/**
 * Verify the request is from Vercel Cron
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const result = await syncAllUsersToPostHog();
    const duration = Date.now() - startTime;

    console.log(
      `[PostHog Sync] Completed: ${result.synced} synced, ${result.failed} failed (${duration}ms)`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      results: {
        usersSynced: result.synced,
        usersFailed: result.failed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[PostHog Sync] Cron job failed:", error);

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: message,
      },
      { status: 500 }
    );
  }
}

// Vercel Cron requires the GET method
export const dynamic = "force-dynamic";
