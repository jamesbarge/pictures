/**
 * Admin Scrape API
 * Runs the scraper for a specific cinema in-process via the local job runner.
 * POST /api/admin/scrape
 *
 * Fire-and-forget: returns 202 immediately while the scraper runs in the same
 * Node process. Errors are logged but never block the response.
 */

import { withAdminAuth } from "@/lib/auth";
import {
  getCinemaById,
  getCanonicalId,
} from "@/config/cinema-registry";
import { getTriggerTaskId } from "@/scrapers/task-registry";
import { getScraperByTaskId } from "@/scrapers/registry";
import { runScraper } from "@/scrapers/runner-factory";

export const POST = withAdminAuth(async (request, admin) => {
  try {
    const { cinemaId: rawCinemaId } = await request.json();

    if (!rawCinemaId || typeof rawCinemaId !== "string") {
      return Response.json({ error: "Missing cinemaId" }, { status: 400 });
    }

    // Resolve any legacy IDs to canonical IDs for validation
    const canonicalId = getCanonicalId(rawCinemaId);

    // Get cinema info from registry using canonical ID
    const cinema = getCinemaById(canonicalId);
    if (!cinema) {
      return Response.json(
        { error: `Unknown cinema: ${rawCinemaId}` },
        { status: 400 },
      );
    }

    // Map cinema → scraper-registry task ID (e.g. "scraper-bfi", "scraper-chain-curzon")
    const taskId = getTriggerTaskId(canonicalId);
    if (!taskId) {
      return Response.json(
        { error: `No scraper task for cinema: ${canonicalId}` },
        { status: 400 },
      );
    }

    const entry = getScraperByTaskId(taskId);
    if (!entry) {
      return Response.json(
        { error: `No registry entry for task: ${taskId}` },
        { status: 400 },
      );
    }

    // Fire-and-forget — runs in the same Node process. For long-running jobs,
    // log errors but don't block the response.
    runScraper(entry.buildConfig(), { useValidation: true }).catch((err) => {
      console.error(
        `[api/admin/scrape] runScraper failed for ${taskId}:`,
        err,
      );
    });

    return Response.json(
      {
        status: "started",
        success: true,
        message: `Scraper started for ${cinema.name}`,
        cinemaId: canonicalId,
        cinemaName: cinema.name,
        taskId,
        triggeredBy: admin.userId,
        orchestrator: "local",
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("Error starting scraper:", error);
    return Response.json(
      { error: "Failed to start scraper" },
      { status: 500 },
    );
  }
});
