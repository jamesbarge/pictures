/**
 * Admin Scrape API
 * Triggers a scraper for a specific cinema via Inngest or Trigger.dev
 * POST /api/admin/scrape
 */

import { withAdminAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import {
  getCinemaById,
  getCinemaToScraperMap,
  getCanonicalId,
  getInngestCinemaId,
} from "@/config/cinema-registry";
import { USE_TRIGGER_DEV } from "@/config/feature-flags";

// Get the cinema-to-scraper mapping from the canonical registry
const CINEMA_TO_SCRAPER = getCinemaToScraperMap();

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
        { status: 400 }
      );
    }

    if (USE_TRIGGER_DEV) {
      const { tasks } = await import("@trigger.dev/sdk/v3");
      const { getTriggerTaskId } = await import("@/trigger/task-registry");

      const taskId = getTriggerTaskId(canonicalId);
      if (!taskId) {
        return Response.json(
          { error: `No Trigger.dev task for cinema: ${canonicalId}` },
          { status: 400 }
        );
      }

      const handle = await tasks.trigger(taskId, {
        cinemaId: canonicalId,
        triggeredBy: admin.userId,
      });

      return Response.json({
        success: true,
        message: `Scraper queued for ${cinema.name}`,
        cinemaId: canonicalId,
        cinemaName: cinema.name,
        taskId,
        runId: handle.id,
        orchestrator: "trigger.dev",
      });
    }

    // --- Inngest path (default) ---
    const scraperId = CINEMA_TO_SCRAPER[rawCinemaId] || CINEMA_TO_SCRAPER[canonicalId];
    if (!scraperId) {
      return Response.json(
        { error: `No scraper configured for cinema: ${rawCinemaId}` },
        { status: 400 }
      );
    }

    const inngestCinemaId = getInngestCinemaId(canonicalId);

    const { ids } = await inngest.send({
      name: "scraper/run",
      data: {
        cinemaId: inngestCinemaId,
        scraperId,
        triggeredBy: admin.userId,
      },
    });

    return Response.json({
      success: true,
      message: `Scraper queued for ${cinema.name}`,
      cinemaId: canonicalId,
      cinemaName: cinema.name,
      scraperId,
      eventId: ids[0],
      orchestrator: "inngest",
    });
  } catch (error) {
    console.error("Error triggering scraper:", error);
    return Response.json(
      { error: "Failed to trigger scraper" },
      { status: 500 }
    );
  }
});
