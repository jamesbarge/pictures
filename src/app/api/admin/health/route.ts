/**
 * Admin Health Dashboard API
 *
 * Returns current health status of all cinema scrapers.
 * Used by admin dashboard to show scraper health.
 *
 * Endpoint: GET /api/admin/health
 * Requires Clerk authentication
 */

import { requireAdmin } from "@/lib/auth";
import { runFullHealthCheck, getRecentHealthSnapshots, getCinemaHealthMetrics } from "@/lib/scraper-health";
import { HEALTH_THRESHOLDS } from "@/db/schema/health-snapshots";

export async function GET(request: Request) {
  // Verify admin auth
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  const url = new URL(request.url);
  const cinemaId = url.searchParams.get("cinemaId");
  const includeHistory = url.searchParams.get("history") === "true";
  const historyDays = parseInt(url.searchParams.get("historyDays") || "7", 10);

  try {
    // If specific cinema requested, return detailed view
    if (cinemaId) {
      const metrics = await getCinemaHealthMetrics(cinemaId);
      if (!metrics) {
        return Response.json({ error: "Cinema not found" }, { status: 404 });
      }

      const response: Record<string, unknown> = { metrics };

      if (includeHistory) {
        const history = await getRecentHealthSnapshots(cinemaId, historyDays);
        response.history = history;
      }

      return Response.json(response);
    }

    // Otherwise, return full health check
    const result = await runFullHealthCheck();

    // Sort metrics by health score (worst first)
    const sortedMetrics = [...result.metrics].sort(
      (a, b) => a.overallHealthScore - b.overallHealthScore
    );

    return Response.json({
      timestamp: result.timestamp.toISOString(),
      summary: {
        totalCinemas: result.totalCinemas,
        healthy: result.healthyCinemas,
        warning: result.warnCinemas,
        critical: result.criticalCinemas,
        alertCount: result.alerts.length,
      },
      thresholds: HEALTH_THRESHOLDS,
      metrics: sortedMetrics,
      alerts: result.alerts,
    });
  } catch (error) {
    console.error("[admin/health] Error:", error);
    return Response.json(
      {
        error: "Health check failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
