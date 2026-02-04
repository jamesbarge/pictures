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
  getInngestCinemaId,
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

    // Get the scraper ID for Inngest
    const scraperId = CINEMA_TO_SCRAPER[rawCinemaId] || CINEMA_TO_SCRAPER[canonicalId];
    if (!scraperId) {
      return Response.json(
        { error: `No scraper configured for cinema: ${rawCinemaId}` },
        { status: 400 }
      );
    }

    // Get the cinema ID that Inngest expects (may differ from canonical ID)
    // Inngest's CHAIN_CINEMA_MAPPING and SCRAPER_REGISTRY still use some legacy IDs
    const inngestCinemaId = getInngestCinemaId(canonicalId);

    // Send event to Inngest with the ID it expects
    const { ids } = await inngest.send({
      name: "scraper/run",
      data: {
        cinemaId: inngestCinemaId,
        scraperId,
        triggeredBy: userId,
      },
    });

    return Response.json({
      success: true,
      message: `Scraper queued for ${cinema.name}`,
      cinemaId: canonicalId, // Return canonical ID in response
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
