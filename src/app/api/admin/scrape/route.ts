/**
 * Admin Scrape API
 * Triggers a scraper for a specific cinema via Inngest
 * POST /api/admin/scrape
 */

import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";
import {
  getCinemaById,
  getCinemaToScraperMap,
  getCanonicalId,
} from "@/config/cinema-registry";

// Get the cinema-to-scraper mapping from the canonical registry
const CINEMA_TO_SCRAPER = getCinemaToScraperMap();

export async function POST(request: Request) {
  // Verify admin auth
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Use the ORIGINAL ID for Inngest - Inngest registry still uses original scraper IDs
    // TODO: Once Inngest functions are updated to use canonical registry, switch to canonicalId
    const scraperId = CINEMA_TO_SCRAPER[rawCinemaId] || CINEMA_TO_SCRAPER[canonicalId];
    if (!scraperId) {
      return Response.json(
        { error: `No scraper configured for cinema: ${rawCinemaId}` },
        { status: 400 }
      );
    }

    // Send event to Inngest with the original ID (not canonicalized)
    // This ensures compatibility with the existing Inngest scraper registry
    const { ids } = await inngest.send({
      name: "scraper/run",
      data: {
        cinemaId: rawCinemaId,
        scraperId,
        triggeredBy: userId,
      },
    });

    return Response.json({
      success: true,
      message: `Scraper queued for ${cinema.name}`,
      cinemaId: rawCinemaId,
      cinemaName: cinema.name,
      scraperId,
      eventId: ids[0],
    });
  } catch (error) {
    console.error("Error triggering scraper:", error);
    return Response.json(
      { error: "Failed to trigger scraper" },
      { status: 500 }
    );
  }
}
