/**
 * Scraper Health Agent API
 * Runs health checks on all cinema scrapers
 *
 * POST /api/admin/agents/health
 */

import { requireAdmin } from "@/lib/auth";

export const maxDuration = 60;

export async function POST() {
  // Verify admin auth
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  // Check for API key before importing agent
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      success: false,
      summary: "Agent not configured",
      error: "ANTHROPIC_API_KEY environment variable is not set. Add it in Vercel project settings.",
    });
  }

  try {
    // Dynamic import to avoid loading SDK if API key missing
    const { runHealthCheckAllCinemas } = await import("@/agents");

    const result = await runHealthCheckAllCinemas();

    if (!result.success) {
      return Response.json({
        success: false,
        summary: "Health check failed",
        error: result.error,
      });
    }

    const reports = result.data || [];
    const healthy = reports.filter((r) => !r.anomalyDetected).length;
    const anomalies = reports.filter((r) => r.anomalyDetected);
    const blocked = reports.filter((r) => r.shouldBlockScrape).length;

    const details: string[] = [];

    // Add anomalies to details
    for (const report of anomalies) {
      const warnings = report.warnings.slice(0, 2).join("; ");
      details.push(`${report.cinemaName}: ${warnings}`);
    }

    return Response.json({
      success: true,
      summary: `Checked ${reports.length} cinemas: ${healthy} healthy, ${anomalies.length} anomalies, ${blocked} should block`,
      details: details.length > 0 ? details : undefined,
      tokensUsed: result.tokensUsed,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error) {
    console.error("Scraper health error:", error);
    return Response.json(
      {
        success: false,
        summary: "Health check failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
