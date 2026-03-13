/**
 * Scraper Health Agent API
 * Runs health checks on all cinema scrapers
 *
 * POST /api/admin/agents/health
 */

import { withAdminAuth } from "@/lib/auth";
import { geminiKeyMissingResponse, agentErrorResponse } from "../shared";

export const maxDuration = 60;

export const POST = withAdminAuth(async () => {
  if (!process.env.GEMINI_API_KEY) {
    return geminiKeyMissingResponse();
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
    return agentErrorResponse("Scraper health", "Health check", error);
  }
});
