import { inngest } from "./client";
import { saveScreenings, ensureCinemaExists } from "@/scrapers/pipeline";
import type { RawScreening } from "@/scrapers/types";
import { captureServerException } from "@/lib/posthog-server";

// Venue definition with required website for Inngest scrapers
interface InnggestVenueDefinition {
  id: string;
  name: string;
  shortName: string;
  website: string;
  address: { street: string; area: string; postcode: string };
  features: string[];
}

/**
 * Scraper Registry
 * Maps cinema IDs to their scraper configurations
 *
 * Note: Playwright-based scrapers require a browser runtime.
 * On Vercel serverless, only API/Cheerio-based scrapers will work.
 * For Playwright scrapers, use a dedicated server or cloud browser service.
 */

interface ScraperResult {
  venueId: string;
  added: number;
  updated: number;
  failed: number;
}

interface ScraperEntry {
  venue: InnggestVenueDefinition;
  /** Whether this scraper requires Playwright (won't work on Vercel serverless) */
  requiresPlaywright: boolean;
  /** The scrape function */
  scrape: () => Promise<ScraperResult[]>;
}

// Helper to create a scraper entry for independent cinemas
function createIndependentEntry(
  venue: InnggestVenueDefinition,
  requiresPlaywright: boolean,
  scraperFactory: () => Promise<{ scrape: () => Promise<RawScreening[]> }>
): ScraperEntry {
  return {
    venue,
    requiresPlaywright,
    scrape: async () => {
      await ensureCinemaExists(venue);
      const scraper = await scraperFactory();
      const screenings = await scraper.scrape();
      const result = await saveScreenings(venue.id, screenings);
      return [{
        venueId: venue.id,
        added: result.added,
        updated: result.updated,
        failed: result.failed,
      }];
    },
  };
}

// Cheerio-based cinemas that can run on Vercel serverless (no browser required)
const CHEERIO_CINEMAS = [
  "rio-dalston",
  "prince-charles",
  "ica",
  "genesis",
  "peckhamplex",
  "nickel",
  "garden",
  "castle",
  "rich-mix",
  // Additional Cheerio-based cinemas
  "close-up-cinema",
  "cine-lumiere",
  "castle-sidcup",
  "arthouse-crouch-end",
  "coldharbour-blue",
  "olympic-studios",
  "david-lean-cinema",
  "riverside-studios",
  // Note: "phoenix" and "regent-street" removed - they use Playwright
];

// Lazy-loaded scraper registry
const getScraperRegistry = (): Record<string, () => Promise<ScraperEntry>> => ({
  // ============================================================================
  // Independent Cinemas (Cheerio-based - work on Vercel)
  // ============================================================================
  "rio-dalston": async () => {
    const { createRioScraper } = await import("@/scrapers/cinemas/rio");
    return createIndependentEntry(
      {
        id: "rio-dalston",
        name: "Rio Cinema",
        shortName: "Rio",
        website: "https://riocinema.org.uk",
        address: { street: "107 Kingsland High Street", area: "Dalston", postcode: "E8 2PB" },
        features: ["independent", "repertory", "bar", "35mm", "art-deco"],
      },
      false,
      async () => createRioScraper()
    );
  },

  "prince-charles": async () => {
    const { createPrinceCharlesScraper } = await import("@/scrapers/cinemas/prince-charles");
    return createIndependentEntry(
      {
        id: "prince-charles",
        name: "Prince Charles Cinema",
        shortName: "PCC",
        website: "https://princecharlescinema.com",
        address: { street: "7 Leicester Place", area: "Leicester Square", postcode: "WC2H 7BY" },
        features: ["independent", "repertory", "sing-along", "marathons", "35mm", "70mm"],
      },
      false,
      async () => createPrinceCharlesScraper()
    );
  },

  "ica": async () => {
    const { createICAScraper } = await import("@/scrapers/cinemas/ica");
    return createIndependentEntry(
      {
        id: "ica",
        name: "Institute of Contemporary Arts",
        shortName: "ICA",
        website: "https://www.ica.art",
        address: { street: "The Mall", area: "St James's", postcode: "SW1Y 5AH" },
        features: ["independent", "repertory", "art-house", "gallery"],
      },
      false,
      async () => createICAScraper()
    );
  },

  "genesis": async () => {
    const { createGenesisScraper } = await import("@/scrapers/cinemas/genesis");
    return createIndependentEntry(
      {
        id: "genesis",
        name: "Genesis Cinema",
        shortName: "Genesis",
        website: "https://genesiscinema.co.uk",
        address: { street: "93-95 Mile End Road", area: "Mile End", postcode: "E1 4UJ" },
        features: ["independent", "affordable", "5-screens"],
      },
      false,
      async () => createGenesisScraper()
    );
  },

  "peckhamplex": async () => {
    const { createPeckhamplexScraper } = await import("@/scrapers/cinemas/peckhamplex");
    return createIndependentEntry(
      {
        id: "peckhamplex",
        name: "Peckhamplex",
        shortName: "Plex",
        website: "https://peckhamplex.london",
        address: { street: "95A Rye Lane", area: "Peckham", postcode: "SE15 4ST" },
        features: ["independent", "affordable", "community"],
      },
      false,
      async () => createPeckhamplexScraper()
    );
  },

  "nickel": async () => {
    const { createNickelScraper } = await import("@/scrapers/cinemas/the-nickel");
    return createIndependentEntry(
      {
        id: "nickel",
        name: "The Nickel",
        shortName: "Nickel",
        website: "https://thenickel.co.uk",
        address: { street: "194 Upper Street", area: "Islington", postcode: "N1 1RQ" },
        features: ["independent", "bar", "restaurant"],
      },
      false,
      async () => createNickelScraper()
    );
  },

  "garden": async () => {
    const { createGardenCinemaScraper } = await import("@/scrapers/cinemas/garden");
    return createIndependentEntry(
      {
        id: "garden",
        name: "Garden Cinema",
        shortName: "Garden",
        website: "https://thegardencinema.co.uk",
        address: { street: "39-41 Parker Street", area: "Covent Garden", postcode: "WC2B 5PQ" },
        features: ["independent", "art-house", "bar", "luxury"],
      },
      false,
      async () => createGardenCinemaScraper()
    );
  },

  "castle": async () => {
    const { createCastleScraper } = await import("@/scrapers/cinemas/castle");
    return createIndependentEntry(
      {
        id: "castle",
        name: "Castle Cinema",
        shortName: "Castle",
        website: "https://thecastlecinema.com",
        address: { street: "64-66 Brooksby's Walk", area: "Hackney", postcode: "E9 6DA" },
        features: ["independent", "community", "cafe-bar"],
      },
      false,
      async () => createCastleScraper()
    );
  },

  "phoenix": async () => {
    const { createPhoenixScraper } = await import("@/scrapers/cinemas/phoenix");
    return createIndependentEntry(
      {
        id: "phoenix",
        name: "Phoenix Cinema",
        shortName: "Phoenix",
        website: "https://phoenixcinema.co.uk",
        address: { street: "52 High Road", area: "East Finchley", postcode: "N2 9PJ" },
        features: ["independent", "historic", "repertory", "art-deco"],
      },
      true, // Requires Playwright
      async () => createPhoenixScraper()
    );
  },

  "rich-mix": async () => {
    const { createRichMixScraper } = await import("@/scrapers/cinemas/rich-mix");
    return createIndependentEntry(
      {
        id: "rich-mix",
        name: "Rich Mix",
        shortName: "Rich Mix",
        website: "https://richmix.org.uk",
        address: { street: "35-47 Bethnal Green Road", area: "Shoreditch", postcode: "E1 6LA" },
        features: ["independent", "arts-centre", "community", "world-cinema"],
      },
      false,
      async () => createRichMixScraper()
    );
  },

  "close-up-cinema": async () => {
    const { CloseUpCinemaScraper } = await import("@/scrapers/cinemas/close-up");
    return createIndependentEntry(
      {
        id: "close-up-cinema",
        name: "Close-Up Cinema",
        shortName: "Close-Up",
        website: "https://www.closeupfilmcentre.com",
        address: { street: "97 Sclater Street", area: "Shoreditch", postcode: "E1 6HR" },
        features: ["independent", "repertory", "filmmaker-seasons"],
      },
      false,
      async () => new CloseUpCinemaScraper()
    );
  },

  "cine-lumiere": async () => {
    const { CineLumiereScraper } = await import("@/scrapers/cinemas/cine-lumiere");
    return createIndependentEntry(
      {
        id: "cine-lumiere",
        name: "Cine Lumiere",
        shortName: "Cine Lumiere",
        website: "https://www.institut-francais.org.uk/cine-lumiere/",
        address: { street: "17 Queensberry Place", area: "South Kensington", postcode: "SW7 2DT" },
        features: ["independent", "french-cinema", "world-cinema"],
      },
      false,
      async () => new CineLumiereScraper()
    );
  },

  "castle-sidcup": async () => {
    const { createCastleSidcupScraper } = await import("@/scrapers/cinemas/castle-sidcup");
    return createIndependentEntry(
      {
        id: "castle-sidcup",
        name: "Castle Sidcup",
        shortName: "Castle Sidcup",
        website: "https://thecastlecinema.com/sidcup",
        address: { street: "44 Main Road", area: "Sidcup", postcode: "DA14 6NJ" },
        features: ["independent", "community"],
      },
      false,
      async () => createCastleSidcupScraper()
    );
  },

  "arthouse-crouch-end": async () => {
    const { createArtHouseCrouchEndScraper } = await import("@/scrapers/cinemas/arthouse-crouch-end");
    return createIndependentEntry(
      {
        id: "arthouse-crouch-end",
        name: "ArtHouse Crouch End",
        shortName: "ArtHouse",
        website: "https://arthousecrouchend.co.uk",
        address: { street: "159a Tottenham Lane", area: "Crouch End", postcode: "N8 9BT" },
        features: ["independent", "community", "single-screen"],
      },
      false,
      async () => createArtHouseCrouchEndScraper()
    );
  },

  "coldharbour-blue": async () => {
    const { createColdharbourBlueScraper } = await import("@/scrapers/cinemas/coldharbour-blue");
    return createIndependentEntry(
      {
        id: "coldharbour-blue",
        name: "Coldharbour Blue",
        shortName: "Coldharbour",
        website: "https://www.coldharbourblue.com",
        address: { street: "259-260 Hardess Street", area: "Loughborough Junction", postcode: "SE24 0HN" },
        features: ["independent", "community", "bar"],
      },
      false,
      async () => createColdharbourBlueScraper()
    );
  },

  "olympic-studios": async () => {
    const { createOlympicScraper } = await import("@/scrapers/cinemas/olympic");
    return createIndependentEntry(
      {
        id: "olympic-studios",
        name: "Olympic Studios",
        shortName: "Olympic",
        website: "https://olympiccinema.co.uk",
        address: { street: "117-123 Church Road", area: "Barnes", postcode: "SW13 9HL" },
        features: ["independent", "luxury", "bar", "restaurant"],
      },
      false,
      async () => createOlympicScraper()
    );
  },

  "david-lean-cinema": async () => {
    const { createDavidLeanScraper } = await import("@/scrapers/cinemas/david-lean");
    return createIndependentEntry(
      {
        id: "david-lean-cinema",
        name: "The David Lean Cinema",
        shortName: "David Lean",
        website: "https://www.davidleancinema.org.uk",
        address: { street: "Croydon Clocktower", area: "Croydon", postcode: "CR9 1ET" },
        features: ["independent", "community", "repertory"],
      },
      false,
      async () => createDavidLeanScraper()
    );
  },

  "riverside-studios": async () => {
    const { createRiversideStudiosScraper } = await import("@/scrapers/cinemas/riverside-studios");
    return createIndependentEntry(
      {
        id: "riverside-studios",
        name: "Riverside Studios",
        shortName: "Riverside",
        website: "https://riversidestudios.co.uk",
        address: { street: "101 Queen Caroline Street", area: "Hammersmith", postcode: "W6 9BN" },
        features: ["arts-centre", "independent", "theatre"],
      },
      false,
      async () => createRiversideStudiosScraper()
    );
  },

  // ============================================================================
  // Playwright-based Cinemas (require browser - won't work on Vercel serverless)
  // ============================================================================
  "bfi-southbank": async () => {
    const { createBFIScraper } = await import("@/scrapers/cinemas/bfi");
    return createIndependentEntry(
      {
        id: "bfi-southbank",
        name: "BFI Southbank",
        shortName: "BFI",
        website: "https://www.bfi.org.uk/bfi-southbank",
        address: { street: "Belvedere Road", area: "South Bank", postcode: "SE1 8XT" },
        features: ["independent", "repertory", "archive", "world-cinema"],
      },
      true, // Requires Playwright
      async () => createBFIScraper("bfi-southbank")
    );
  },

  "bfi-imax": async () => {
    const { createBFIScraper } = await import("@/scrapers/cinemas/bfi");
    return createIndependentEntry(
      {
        id: "bfi-imax",
        name: "BFI IMAX",
        shortName: "IMAX",
        website: "https://www.bfi.org.uk/bfi-imax",
        address: { street: "1 Charlie Chaplin Walk", area: "South Bank", postcode: "SE1 8XR" },
        features: ["imax", "blockbusters"],
      },
      true, // Requires Playwright
      async () => createBFIScraper("bfi-imax")
    );
  },

  "barbican": async () => {
    const { createBarbicanScraper } = await import("@/scrapers/cinemas/barbican");
    return createIndependentEntry(
      {
        id: "barbican",
        name: "Barbican Cinema",
        shortName: "Barbican",
        website: "https://www.barbican.org.uk",
        address: { street: "Silk Street", area: "City of London", postcode: "EC2Y 8DS" },
        features: ["arts-centre", "repertory", "world-cinema", "accessible"],
      },
      true, // Requires Playwright
      async () => createBarbicanScraper()
    );
  },

  "electric-portobello": async () => {
    const { createElectricScraper } = await import("@/scrapers/cinemas/electric");
    return createIndependentEntry(
      {
        id: "electric-portobello",
        name: "Electric Cinema Portobello",
        shortName: "Electric",
        website: "https://www.electriccinema.co.uk",
        address: { street: "191 Portobello Road", area: "Notting Hill", postcode: "W11 2ED" },
        features: ["independent", "luxury", "historic", "bar"],
      },
      true, // Requires Playwright
      async () => createElectricScraper()
    );
  },

  "lexi": async () => {
    const { createLexiScraper } = await import("@/scrapers/cinemas/lexi");
    return createIndependentEntry(
      {
        id: "lexi",
        name: "The Lexi Cinema",
        shortName: "Lexi",
        website: "https://thelexicinema.co.uk",
        address: { street: "194B Chamberlayne Road", area: "Kensal Rise", postcode: "NW10 3JU" },
        features: ["independent", "community", "charity", "art-deco"],
      },
      true, // Requires Playwright
      async () => createLexiScraper()
    );
  },

  "romford-lumiere": async () => {
    const { createRomfordLumiereScraper } = await import("@/scrapers/cinemas/romford-lumiere");
    return createIndependentEntry(
      {
        id: "romford-lumiere",
        name: "Lumiere Cinema Romford",
        shortName: "Lumiere",
        website: "https://lumiere-cinema.co.uk",
        address: { street: "The Sapphire Ice and Leisure", area: "Romford", postcode: "RM1 3RL" },
        features: ["independent", "modern"],
      },
      true, // Requires Playwright
      async () => createRomfordLumiereScraper()
    );
  },
});

// Chain cinema IDs map to their chain scraper
const CHAIN_CINEMA_MAPPING: Record<string, string> = {
  // Curzon venues
  "curzon-soho": "curzon",
  "curzon-mayfair": "curzon",
  "curzon-bloomsbury": "curzon",
  "curzon-victoria": "curzon",
  "curzon-hoxton": "curzon",
  "curzon-kingston": "curzon",
  "curzon-aldgate": "curzon",
  // Picturehouse venues
  "picturehouse-central": "picturehouse",
  "hackney-picturehouse": "picturehouse",
  "crouch-end-picturehouse": "picturehouse",
  "east-dulwich-picturehouse": "picturehouse",
  "greenwich-picturehouse": "picturehouse",
  "finsbury-park-picturehouse": "picturehouse",
  "gate-picturehouse": "picturehouse",
  "picturehouse-ritzy": "picturehouse",
  "clapham-picturehouse": "picturehouse",
  "west-norwood-picturehouse": "picturehouse",
  "ealing-picturehouse": "picturehouse",
  // Everyman venues
  "everyman-belsize-park": "everyman",
  "everyman-baker-street": "everyman",
  "everyman-barnet": "everyman",
  "everyman-borough-yards": "everyman",
  "everyman-broadgate": "everyman",
  "everyman-canary-wharf": "everyman",
  "everyman-chelsea": "everyman",
  "everyman-crystal-palace": "everyman",
  "everyman-hampstead": "everyman",
  "everyman-kings-cross": "everyman",
  "everyman-maida-vale": "everyman",
  "everyman-muswell-hill": "everyman",
  "everyman-screen-on-the-green": "everyman",
  "everyman-stratford": "everyman",
};

/**
 * Inngest Function: Run Cinema Scraper
 *
 * Triggered by the "scraper/run" event.
 * Runs the appropriate scraper for the given cinema.
 */
export const runCinemaScraper = inngest.createFunction(
  {
    id: "run-cinema-scraper",
    retries: 2,
  },
  { event: "scraper/run" },
  async ({ event, step }) => {
    const { cinemaId, scraperId, triggeredBy } = event.data;
    const startTime = Date.now();

    console.log(`[Inngest] Starting scraper for ${cinemaId} (triggered by ${triggeredBy})`);

    // Check if this is a chain cinema
    const chainId = CHAIN_CINEMA_MAPPING[cinemaId];
    if (chainId) {
      // Chain cinemas require Playwright, which doesn't work on Vercel serverless
      return {
        cinemaId,
        scraperId,
        triggeredBy,
        success: false,
        error: `Chain cinema ${cinemaId} requires Playwright which is not available on Vercel serverless. Run the chain scraper (${chainId}) from a local machine or dedicated server.`,
        requiresPlaywright: true,
        durationMs: Date.now() - startTime,
      };
    }

    // Get the scraper entry
    const registry = getScraperRegistry();
    const getEntry = registry[cinemaId];

    if (!getEntry) {
      return {
        cinemaId,
        scraperId,
        triggeredBy,
        success: false,
        error: `No scraper configured for cinema: ${cinemaId}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Load the scraper entry
    const entry = await step.run("load-scraper", async () => {
      const e = await getEntry();
      return {
        requiresPlaywright: e.requiresPlaywright,
        venueName: e.venue.name,
      };
    });

    // Check if Playwright is required
    if (entry.requiresPlaywright) {
      return {
        cinemaId,
        scraperId,
        triggeredBy,
        success: false,
        error: `${entry.venueName} scraper requires Playwright which is not available on Vercel serverless. Run this scraper from a local machine or dedicated server.`,
        requiresPlaywright: true,
        durationMs: Date.now() - startTime,
      };
    }

    // Run the scraper
    const result = await step.run("run-scraper", async () => {
      const scraperEntry = await getEntry();
      const results = await scraperEntry.scrape();
      const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
      const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
      const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
      return {
        venues: results,
        totalAdded,
        totalUpdated,
        totalFailed,
      };
    });

    console.log(`[Inngest] Scraper completed for ${cinemaId}:`, result);

    return {
      cinemaId,
      scraperId,
      triggeredBy,
      success: true,
      totalAdded: result.totalAdded,
      totalUpdated: result.totalUpdated,
      totalFailed: result.totalFailed,
      venues: result.venues,
      durationMs: Date.now() - startTime,
    };
  }
);

/**
 * Inngest Function: Scheduled Scrape All
 *
 * Runs daily at 6:00 AM UTC to scrape all Cheerio-based cinemas.
 * Fans out to individual scraper runs via events.
 */
export const scheduledScrapeAll = inngest.createFunction(
  {
    id: "scheduled-scrape-all",
    retries: 0, // Don't retry the scheduler itself - individual scrapers have their own retries
  },
  { cron: "0 6 * * *" }, // 6:00 AM UTC daily
  async ({ step }) => {
    console.log(`[Inngest] Starting scheduled scrape for ${CHEERIO_CINEMAS.length} cinemas`);

    // Create events for all Cheerio-based scrapers
    const events = CHEERIO_CINEMAS.map((cinemaId) => ({
      name: "scraper/run" as const,
      data: {
        cinemaId,
        scraperId: cinemaId,
        triggeredBy: "scheduled-cron",
      },
    }));

    // Fan out to individual scraper runs
    await step.sendEvent("trigger-scrapers", events);

    return {
      triggered: CHEERIO_CINEMAS.length,
      cinemas: CHEERIO_CINEMAS,
      scheduledAt: new Date().toISOString(),
    };
  }
);

/**
 * Inngest Function: Handle Function Failures
 *
 * Global handler for all Inngest function failures.
 * Reports to PostHog and optionally sends Slack notifications.
 */
export const handleFunctionFailure = inngest.createFunction(
  {
    id: "handle-function-failure",
    retries: 0, // Don't retry failure handlers
  },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    const { function_id, run_id, error } = event.data;
    const originalEvent = event.data.event;

    // Skip alerting for expected Playwright failures (they're informational, not errors)
    const errorMessage = error?.message || "";
    if (errorMessage.includes("requires Playwright")) {
      console.log(`[Inngest] Skipping alert for expected Playwright limitation: ${function_id}`);
      return { skipped: true, reason: "playwright-limitation" };
    }

    console.error(`[Inngest] Function failed: ${function_id}`, {
      run_id,
      error,
      originalEvent,
    });

    // Step 1: Report to PostHog
    await step.run("report-to-posthog", async () => {
      captureServerException(
        new Error(`Inngest function failed: ${function_id}`),
        undefined, // No distinct_id for background jobs
        {
          inngest_function: function_id,
          inngest_run_id: run_id,
          error_message: error?.message,
          error_stack: error?.stack,
          original_event: originalEvent,
          source: "inngest-failure-handler",
        }
      );
    });

    // Step 2: Send Slack notification (if configured)
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhookUrl) {
      await step.run("send-slack-notification", async () => {
        const cinemaId = originalEvent?.data?.cinemaId || "unknown";
        const triggeredBy = originalEvent?.data?.triggeredBy || "unknown";

        const payload = {
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "🚨 Scraper Failure Alert",
                emoji: true,
              },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Function:*\n${function_id}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Cinema:*\n${cinemaId}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Triggered By:*\n${triggeredBy}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Run ID:*\n\`${run_id}\``,
                },
              ],
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Error:*\n\`\`\`${errorMessage.slice(0, 500)}\`\`\``,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "View in Inngest",
                    emoji: true,
                  },
                  url: `https://app.inngest.com/env/production/runs/${run_id}`,
                },
              ],
            },
          ],
        };

        const response = await fetch(slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          console.error("[Inngest] Failed to send Slack notification:", response.status);
        }

        return { sent: response.ok };
      });
    }

    return {
      handled: true,
      function_id,
      run_id,
      reportedToPostHog: true,
      slackNotified: !!slackWebhookUrl,
    };
  }
);

/**
 * Inngest Function: Scheduled BFI PDF Import
 *
 * Runs weekly on Sundays at 6:00 AM UTC to import from BFI PDFs.
 * This is a full import that parses the monthly guide PDF and programme changes.
 */
export const scheduledBFIPDFImport = inngest.createFunction(
  {
    id: "scheduled-bfi-pdf-import",
    retries: 2,
  },
  { cron: "0 6 * * 0" }, // 6:00 AM UTC every Sunday
  async ({ step }) => {
    console.log("[Inngest] Starting scheduled BFI PDF import...");

    const result = await step.run("import-bfi-pdf", async () => {
      const { runBFIImport } = await import("@/scrapers/bfi-pdf");
      return runBFIImport();
    });

    console.log("[Inngest] BFI PDF import complete:", result);

    return {
      success: result.success,
      pdfScreenings: result.pdfScreenings,
      changesScreenings: result.changesScreenings,
      totalScreenings: result.totalScreenings,
      saved: result.savedScreenings,
      durationMs: result.durationMs,
      errors: result.errors,
    };
  }
);

/**
 * Inngest Function: Scheduled BFI Programme Changes
 *
 * Runs daily at 10:00 AM UTC to check for programme changes.
 * This is a lighter import that only fetches the programme changes page.
 */
export const scheduledBFIChanges = inngest.createFunction(
  {
    id: "scheduled-bfi-changes",
    retries: 2,
  },
  { cron: "0 10 * * *" }, // 10:00 AM UTC daily
  async ({ step }) => {
    console.log("[Inngest] Starting scheduled BFI programme changes import...");

    const result = await step.run("import-bfi-changes", async () => {
      const { runProgrammeChangesImport } = await import("@/scrapers/bfi-pdf");
      return runProgrammeChangesImport();
    });

    console.log("[Inngest] BFI changes import complete:", result);

    return {
      success: result.success,
      screenings: result.changesScreenings,
      saved: result.savedScreenings,
      lastUpdated: result.changesInfo?.lastUpdated,
      durationMs: result.durationMs,
      errors: result.errors,
    };
  }
);

/**
 * Inngest Function: Scheduled Letterboxd Enrichment
 *
 * Runs daily at 8:00 AM UTC (after scrapers complete) to enrich films with Letterboxd ratings.
 * Processes films with upcoming screenings that don't have ratings yet.
 * Limited to 100 films per run to avoid hitting rate limits.
 */
export const scheduledLetterboxdEnrichment = inngest.createFunction(
  {
    id: "scheduled-letterboxd-enrichment",
    retries: 1,
  },
  { cron: "0 8 * * *" }, // 8:00 AM UTC daily (2 hours after scrapers)
  async ({ step }) => {
    console.log("[Inngest] Starting scheduled Letterboxd enrichment...");

    const result = await step.run("enrich-letterboxd", async () => {
      const { enrichLetterboxdRatings } = await import("@/db/enrich-letterboxd");
      // Process up to 100 films per run, prioritizing those with upcoming screenings
      return enrichLetterboxdRatings(100, true);
    });

    console.log("[Inngest] Letterboxd enrichment complete:", result);

    return {
      success: true,
      enriched: result.enriched,
      failed: result.failed,
      total: result.total,
    };
  }
);

// Export all functions for the serve handler
export const functions = [
  runCinemaScraper,
  scheduledScrapeAll,
  handleFunctionFailure,
  scheduledBFIPDFImport,
  scheduledBFIChanges,
  scheduledLetterboxdEnrichment,
];
