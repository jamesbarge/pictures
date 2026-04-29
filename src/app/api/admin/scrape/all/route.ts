/**
 * Admin Scrape-All API
 * Runs the daily scrape orchestrator in-process via the local job runner.
 *
 * POST /api/admin/scrape/all
 *
 * Fire-and-forget: returns 202 immediately while the orchestrator fans out
 * scrapers in 4 waves in the same Node process. Errors are logged but never
 * block the response.
 */

import { withAdminAuth } from "@/lib/auth";
import { runScrapeAll } from "@/lib/jobs/scrape-all";

export const POST = withAdminAuth(async (_req, admin) => {
  try {
    // Fire-and-forget — runs in the same Node process. For long-running jobs,
    // log errors but don't block the response.
    runScrapeAll().catch((err) => {
      console.error("[api/admin/scrape/all] runScrapeAll failed:", err);
    });

    return Response.json(
      {
        status: "started",
        success: true,
        message: "Scrape-all orchestrator started",
        triggeredBy: admin.userId,
        orchestrator: "local",
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("Error starting scrape-all:", error);
    return Response.json(
      { error: "Failed to start scrape-all" },
      { status: 500 },
    );
  }
});
