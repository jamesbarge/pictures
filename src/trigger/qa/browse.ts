/**
 * QA Browse Task — Playwright Front-End Extraction
 *
 * Visits pictures.london, extracts structured data for today + tomorrow,
 * verifies a sample of booking links. Runs on medium-1x machine.
 */

import { task } from "@trigger.dev/sdk/v3";
import { getBrowser, closeBrowser } from "@/scrapers/utils/browser";
import { db } from "@/db";
import { screenings } from "@/db/schema";
import { gte, lte, and } from "drizzle-orm";
import { extractFrontEndData, checkCompleteness } from "./utils/front-end-extractor";
import { checkBookingLinks } from "./utils/booking-checker";
import type { QaBrowseOutput, BrowseError } from "./types";

export const qaBrowse = task({
  id: "qa-browse",
  machine: { preset: "medium-1x" },
  maxDuration: 1800, // 30 min
  retry: { maxAttempts: 0 },
  run: async (payload: { dryRun: boolean }): Promise<QaBrowseOutput> => {
    const startTime = Date.now();
    const errors: BrowseError[] = [];

    // Determine date range: today + tomorrow in UTC
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().split("T")[0];
    const dayAfterTomorrow = new Date(now.getTime() + 2 * 86_400_000).toISOString().split("T")[0];

    console.log(`[qa-browse] Starting for ${today} and ${tomorrow}, dryRun=${payload.dryRun}`);

    // Pre-check: expected film count from DB
    const expectedScreenings = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(
        and(
          gte(screenings.datetime, new Date(`${today}T00:00:00Z`)),
          lte(screenings.datetime, new Date(`${dayAfterTomorrow}T00:00:00Z`))
        )
      );
    const expectedFilmCount = new Set(expectedScreenings.map(() => "film")).size; // rough estimate
    const expectedScreeningCount = expectedScreenings.length;
    console.log(`[qa-browse] DB expects ~${expectedScreeningCount} screenings for today+tomorrow`);

    // Extract front-end data
    const browser = await getBrowser();
    let extractResult;
    try {
      extractResult = await extractFrontEndData(browser, [today, tomorrow]);
      errors.push(...extractResult.errors);
    } catch (err) {
      console.error("[qa-browse] Extraction failed:", err);
      await closeBrowser();
      throw err;
    }

    // Completeness guard
    const completeness = checkCompleteness(
      extractResult.films.length,
      Math.max(expectedFilmCount, 1)
    );
    if (!completeness.ok) {
      console.warn(
        `[qa-browse] Completeness check FAILED: extracted ${extractResult.films.length} films, ` +
        `expected ~${expectedFilmCount} (ratio: ${completeness.ratio.toFixed(2)}). Aborting.`
      );
      await closeBrowser();
      return {
        extractedAt: new Date().toISOString(),
        dates: [today, tomorrow],
        expectedFilmCount,
        films: [],
        screenings: [],
        bookingChecks: [],
        errors: [
          ...errors,
          { message: `Completeness guard: ratio ${completeness.ratio.toFixed(2)} < 0.7` },
        ],
        stats: {
          filmsExtracted: 0,
          screeningsExtracted: 0,
          bookingsChecked: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }

    console.log(
      `[qa-browse] Extracted ${extractResult.films.length} films, ` +
      `${extractResult.screenings.length} screenings`
    );

    // Sample booking links for verification (up to 30)
    const urlsToCheck = extractResult.screenings
      .filter((s) => s.bookingUrl)
      .slice(0, 30)
      .map((s) => ({
        url: s.bookingUrl,
        cinemaId: s.cinemaId ?? "unknown",
        expectedTitle: s.filmTitle,
        expectedTime: s.datetime,
      }));

    let bookingChecks: Awaited<ReturnType<typeof checkBookingLinks>> = [];
    try {
      bookingChecks = await checkBookingLinks({ urls: urlsToCheck });
    } catch (err) {
      console.error("[qa-browse] Booking check failed:", err);
      errors.push({ message: `Booking check error: ${err instanceof Error ? err.message : String(err)}` });
    }

    await closeBrowser();

    const output: QaBrowseOutput = {
      extractedAt: new Date().toISOString(),
      dates: [today, tomorrow],
      expectedFilmCount,
      films: extractResult.films,
      screenings: extractResult.screenings,
      bookingChecks,
      errors,
      stats: {
        filmsExtracted: extractResult.films.length,
        screeningsExtracted: extractResult.screenings.length,
        bookingsChecked: bookingChecks.length,
        durationMs: Date.now() - startTime,
      },
    };

    console.log(
      `[qa-browse] Complete in ${Math.round(output.stats.durationMs / 1000)}s: ` +
      `${output.stats.filmsExtracted} films, ${output.stats.screeningsExtracted} screenings, ` +
      `${output.stats.bookingsChecked} booking checks`
    );

    return output;
  },
});
