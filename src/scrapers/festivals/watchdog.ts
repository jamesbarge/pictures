/**
 * Festival Programme Watchdog
 *
 * Monitors festival websites for programme availability.
 * Runs on a cron schedule (every 6 hours) and probes each festival's
 * programme page to detect when content appears.
 *
 * When a programme is detected:
 * 1. Updates festivals.programmAnnouncedDate with actual date
 * 2. Logs the detection for monitoring
 *
 * Only checks festivals where NOW is within the watch window:
 * programmAnnouncedDate - 14 days to startDate.
 */

import { db } from "@/db";
import { festivals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { WATCHDOG_PROBES } from "./festival-config";
import type { WatchdogProbe } from "./types";

const LOG_PREFIX = "[FestivalWatchdog]";

export interface WatchdogResult {
  festivalSlug: string;
  probeUrl: string;
  detected: boolean;
  contentHash?: string;
  error?: string;
}

/**
 * Check all festivals for programme availability.
 */
export async function checkProgrammeAvailability(): Promise<WatchdogResult[]> {
  const results: WatchdogResult[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  // Load active festivals
  const activeFestivals = await db
    .select({
      id: festivals.id,
      slug: festivals.slug,
      name: festivals.name,
      startDate: festivals.startDate,
      programmAnnouncedDate: festivals.programmAnnouncedDate,
      scrapedAt: festivals.scrapedAt,
    })
    .from(festivals)
    .where(eq(festivals.isActive, true));

  for (const probe of WATCHDOG_PROBES) {
    // Find matching festival for this probe
    const festival = activeFestivals.find((f) => {
      const slugBase = f.slug.replace(/-\d{4}$/, "");
      return slugBase === probe.slugBase;
    });

    if (!festival) continue;

    // Check if we're within the watch window
    const estimatedAnnounce = festival.programmAnnouncedDate
      ? new Date(festival.programmAnnouncedDate)
      : null;
    const festivalStart = new Date(festival.startDate);

    // Watch window: 14 days before estimated announce to festival start
    const watchStart = estimatedAnnounce
      ? new Date(estimatedAnnounce.getTime() - 14 * 24 * 60 * 60 * 1000)
      : new Date(festivalStart.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days before if no estimate

    if (now < watchStart || now > festivalStart) continue;

    // Already detected — skip
    if (festival.scrapedAt) continue;

    const probeUrl =
      typeof probe.probeUrl === "function"
        ? probe.probeUrl(currentYear)
        : probe.probeUrl;

    console.log(`${LOG_PREFIX} Probing ${festival.name}: ${probeUrl}`);

    const result = await probeForProgramme(probe, probeUrl, festival.slug);
    results.push(result);

    if (result.detected) {
      console.log(
        `${LOG_PREFIX} Programme DETECTED for ${festival.name}!`
      );

      // Update the festival record
      await db
        .update(festivals)
        .set({
          programmAnnouncedDate: now.toISOString().split("T")[0],
          scrapedAt: now,
          updatedAt: now,
        })
        .where(eq(festivals.id, festival.id));
    }
  }

  const detected = results.filter((r) => r.detected).length;
  console.log(
    `${LOG_PREFIX} Checked ${results.length} festivals, ${detected} programmes detected`
  );

  return results;
}

/**
 * Probe a single festival's programme page.
 */
async function probeForProgramme(
  probe: WatchdogProbe,
  url: string,
  festivalSlug: string
): Promise<WatchdogResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      if (probe.signal === "page-exists") {
        // 404 means programme not yet live
        return { festivalSlug, probeUrl: url, detected: false };
      }
      return {
        festivalSlug,
        probeUrl: url,
        detected: false,
        error: `HTTP ${response.status}`,
      };
    }

    const body = await response.text();

    switch (probe.signal) {
      case "page-exists":
        // If we got a 200, the page exists — programme is live
        // Verify it has meaningful content (not just a placeholder)
        return {
          festivalSlug,
          probeUrl: url,
          detected: body.length > 1000,
          contentHash: hashContent(body),
        };

      case "content-hash":
        // Check if page has substantial content (not just a shell/placeholder)
        // A programme page typically has many film titles and show times
        const hash = hashContent(body);
        const hasContent = body.length > 5000;
        return {
          festivalSlug,
          probeUrl: url,
          detected: hasContent,
          contentHash: hash,
        };

      case "element-count":
        // Count specific elements on the page
        if (probe.selector) {
          const pattern = new RegExp(probe.selector, "gi");
          const matches = body.match(pattern);
          const count = matches?.length ?? 0;
          return {
            festivalSlug,
            probeUrl: url,
            detected: count >= (probe.minCount ?? 5),
            contentHash: hashContent(body),
          };
        }
        return { festivalSlug, probeUrl: url, detected: false };

      default:
        return { festivalSlug, probeUrl: url, detected: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} Probe failed for ${festivalSlug}: ${message}`);
    return {
      festivalSlug,
      probeUrl: url,
      detected: false,
      error: message,
    };
  }
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex").slice(0, 12);
}
