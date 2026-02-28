/**
 * Admin Scrape All API
 * Triggers ALL scrapers via Inngest (including Playwright ones that may fail on Vercel)
 *
 * POST /api/admin/scrape/all
 */

import { withAdminAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { getActiveCinemas, getInngestCinemaId } from "@/config/cinema-registry";

function buildScrapeAllEvents(triggeredBy: string) {
  const events: Array<{
    name: "scraper/run";
    data: { cinemaId: string; scraperId: string; triggeredBy: string };
  }> = [];
  const queuedCinemas: string[] = [];

  const queuedChains = new Set<string>();
  let queuedBfiPdf = false;

  for (const cinema of getActiveCinemas()) {
    // For non-BFI chains, trigger one representative venue to run the full chain scraper.
    if (cinema.chain && cinema.chain !== "bfi") {
      if (queuedChains.has(cinema.chain)) continue;
      queuedChains.add(cinema.chain);

      const cinemaId = getInngestCinemaId(cinema.id);
      events.push({
        name: "scraper/run",
        data: {
          cinemaId,
          scraperId: cinema.chain,
          triggeredBy,
        },
      });
      queuedCinemas.push(cinema.id);
      continue;
    }

    // BFI is PDF-first now; queue one import event for both Southbank + IMAX.
    if (cinema.chain === "bfi") {
      if (queuedBfiPdf) continue;
      queuedBfiPdf = true;

      events.push({
        name: "scraper/run",
        data: {
          cinemaId: "bfi-southbank",
          scraperId: "bfi-southbank",
          triggeredBy,
        },
      });
      queuedCinemas.push("bfi-southbank");
      continue;
    }

    const cinemaId = getInngestCinemaId(cinema.id);
    events.push({
      name: "scraper/run",
      data: {
        cinemaId,
        scraperId: cinemaId,
        triggeredBy,
      },
    });
    queuedCinemas.push(cinema.id);
  }

  return { events, queuedCinemas };
}

export const POST = withAdminAuth(async (_req, admin) => {
  try {
    const { events, queuedCinemas } = buildScrapeAllEvents(admin.userId);

    // Send all events to Inngest
    const { ids } = await inngest.send(events);

    return Response.json({
      success: true,
      message: `Queued ${events.length} scrapers`,
      count: events.length,
      eventIds: ids,
      cinemas: queuedCinemas,
    });
  } catch (error) {
    console.error("Error triggering all scrapers:", error);
    return Response.json(
      { error: "Failed to trigger scrapers" },
      { status: 500 }
    );
  }
});
