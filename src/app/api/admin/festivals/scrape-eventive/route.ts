/**
 * Admin Eventive Scraper API
 * POST /api/admin/festivals/scrape-eventive
 *
 * Manually triggers the Eventive scraper for a specific festival.
 * Body: { festival: "frightfest" | "ukjff", year?: number }
 */

import { requireAdmin } from "@/lib/auth";
import {
  scrapeEventiveFestival,
  EVENTIVE_FESTIVALS,
} from "@/scrapers/festivals/eventive-scraper";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  try {
    const body = await request.json().catch(() => ({}));
    const { festival, year } = body as {
      festival?: string;
      year?: number;
    };

    if (!festival) {
      return Response.json(
        {
          error: "Missing 'festival' field",
          available: EVENTIVE_FESTIVALS.map((f) => f.slugBase),
        },
        { status: 400 }
      );
    }

    const config = EVENTIVE_FESTIVALS.find((f) => f.slugBase === festival);
    if (!config) {
      return Response.json(
        {
          error: `Unknown festival: ${festival}`,
          available: EVENTIVE_FESTIVALS.map((f) => f.slugBase),
        },
        { status: 400 }
      );
    }

    const { screenings, skippedVenues } = await scrapeEventiveFestival(
      festival,
      year
    );

    return Response.json({
      success: true,
      festival: `${festival}-${year ?? new Date().getFullYear()}`,
      screenings: screenings.length,
      skippedVenues,
    });
  } catch (error) {
    console.error("Error running Eventive scraper:", error);
    return Response.json(
      {
        error: "Failed to scrape Eventive festival",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
