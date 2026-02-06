/**
 * Daily Health Check Cron
 *
 * Runs at 7am UTC daily (after 6am scheduled scrapers)
 * Checks health of all cinema scrapers and sends alerts if issues found.
 *
 * Endpoint: POST /api/cron/health-check
 * Protected by CRON_SECRET
 */

import { runFullHealthCheck, saveHealthSnapshot } from "@/lib/scraper-health";
import { sendHealthAlerts, generateHealthSummary } from "@/lib/scraper-health/alerts";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[health-check] Starting daily health check...");
  const startTime = Date.now();

  try {
    // Run health check for all cinemas
    const result = await runFullHealthCheck();

    // Save snapshots for all cinemas
    for (const metrics of result.metrics) {
      await saveHealthSnapshot(metrics);
    }

    // Send alerts if any issues
    await sendHealthAlerts(result);

    // Log summary
    const summary = generateHealthSummary(result);
    console.log(summary);

    const durationMs = Date.now() - startTime;

    return Response.json({
      success: true,
      timestamp: result.timestamp.toISOString(),
      durationMs,
      summary: {
        totalCinemas: result.totalCinemas,
        healthy: result.healthyCinemas,
        warning: result.warnCinemas,
        critical: result.criticalCinemas,
        alertCount: result.alerts.length,
      },
    });
  } catch (error) {
    console.error("[health-check] Error:", error);
    return Response.json(
      {
        error: "Health check failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing (still requires CRON_SECRET)
export async function GET(request: Request) {
  return POST(request);
}
