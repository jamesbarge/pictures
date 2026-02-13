/**
 * Festival Reverse-Tagger
 *
 * Tags EXISTING screenings in the database as belonging to festivals.
 * Runs as a daily batch job after venue scrapers complete.
 *
 * For each active festival within its watch window:
 * 1. Query all screenings at registered venues between startDate and endDate
 * 2. Skip screenings that already have a festival_screenings row
 * 3. Apply per-festival confidence rules to decide what to tag
 *
 * Follows the season-linker.ts pattern: cached lookups + junction inserts + onConflictDoNothing.
 */

import { db } from "@/db";
import {
  festivals,
  festivalScreenings,
  screenings,
  films,
} from "@/db/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { FESTIVAL_CONFIGS } from "./festival-config";
import type {
  FestivalTaggingConfig,
  FestivalRecord,
  TaggingResult,
} from "./types";

const LOG_PREFIX = "[FestivalTagger]";

/**
 * Run reverse-tagging for all festivals within the watch window.
 * Watch window: startDate - 14 days to endDate + 7 days.
 */
export async function reverseTagFestivals(): Promise<TaggingResult[]> {
  const now = new Date();
  const results: TaggingResult[] = [];

  // Load all active festivals
  const activeFestivals = await db
    .select({
      id: festivals.id,
      slug: festivals.slug,
      name: festivals.name,
      shortName: festivals.shortName,
      startDate: festivals.startDate,
      endDate: festivals.endDate,
      venues: festivals.venues,
    })
    .from(festivals)
    .where(eq(festivals.isActive, true));

  console.log(
    `${LOG_PREFIX} Found ${activeFestivals.length} active festivals`
  );

  for (const festival of activeFestivals) {
    // Check if this festival is within the watch window
    const start = new Date(festival.startDate);
    const end = new Date(festival.endDate);
    const watchStart = new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000);
    const watchEnd = new Date(end.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (now < watchStart || now > watchEnd) {
      continue;
    }

    console.log(
      `${LOG_PREFIX} Processing ${festival.name} (${festival.slug})`
    );

    const result = await reverseTagFestival(festival);
    results.push(result);
  }

  const totalTagged = results.reduce((sum, r) => sum + r.screeningsTagged, 0);
  console.log(
    `${LOG_PREFIX} Complete. Tagged ${totalTagged} screenings across ${results.length} festivals.`
  );

  return results;
}

/**
 * Run reverse-tagging for a single festival.
 */
export async function reverseTagFestival(
  festival: FestivalRecord
): Promise<TaggingResult> {
  const result: TaggingResult = {
    festivalSlug: festival.slug,
    festivalName: festival.name,
    screeningsChecked: 0,
    screeningsTagged: 0,
    alreadyTagged: 0,
  };

  // Find the matching config by slugBase
  const slugBase = festival.slug.replace(/-\d{4}$/, "");
  const config = FESTIVAL_CONFIGS[slugBase];

  if (!config) {
    console.warn(
      `${LOG_PREFIX} No tagging config for festival: ${festival.slug} (slugBase: ${slugBase})`
    );
    return result;
  }

  const venueList = festival.venues ?? config.venues;
  if (venueList.length === 0) {
    console.warn(`${LOG_PREFIX} No venues for festival: ${festival.slug}`);
    return result;
  }

  // Query all screenings at this festival's venues during the festival window
  const festivalStart = new Date(festival.startDate);
  const festivalEnd = new Date(festival.endDate);
  // Set end to end-of-day
  festivalEnd.setHours(23, 59, 59, 999);

  const venueScreenings = await db
    .select({
      screeningId: screenings.id,
      filmTitle: films.title,
      cinemaId: screenings.cinemaId,
      datetime: screenings.datetime,
      bookingUrl: screenings.bookingUrl,
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(
        inArray(screenings.cinemaId, venueList),
        gte(screenings.datetime, festivalStart),
        lte(screenings.datetime, festivalEnd)
      )
    );

  result.screeningsChecked = venueScreenings.length;

  if (venueScreenings.length === 0) {
    console.log(
      `${LOG_PREFIX} No screenings found at ${venueList.join(", ")} during ${festival.slug} window`
    );
    return result;
  }

  // Get existing festival_screenings for this festival to skip already-tagged
  const existingLinks = await db
    .select({ screeningId: festivalScreenings.screeningId })
    .from(festivalScreenings)
    .where(eq(festivalScreenings.festivalId, festival.id));

  const alreadyTaggedIds = new Set(existingLinks.map((l) => l.screeningId));
  result.alreadyTagged = alreadyTaggedIds.size;

  // Filter and tag based on confidence strategy
  const toTag: { screeningId: string; filmTitle: string }[] = [];

  for (const s of venueScreenings) {
    if (alreadyTaggedIds.has(s.screeningId)) continue;

    if (config.confidence === "AUTO") {
      // AUTO: tag all screenings at exclusive venues during the window
      toTag.push({ screeningId: s.screeningId, filmTitle: s.filmTitle });
    } else {
      // TITLE: require keyword or URL pattern match
      if (matchesTitleSignals(s.filmTitle, s.bookingUrl, config)) {
        toTag.push({ screeningId: s.screeningId, filmTitle: s.filmTitle });
      }
    }
  }

  // Batch insert into festival_screenings
  if (toTag.length > 0) {
    const values = toTag.map((s) => ({
      festivalId: festival.id,
      screeningId: s.screeningId,
    }));

    // Insert in batches of 100 to avoid oversized queries
    for (let i = 0; i < values.length; i += 100) {
      const batch = values.slice(i, i + 100);
      await db.insert(festivalScreenings).values(batch).onConflictDoNothing();
    }

    // Also update isFestivalScreening flag on the screenings themselves
    const taggedIds = toTag.map((s) => s.screeningId);
    for (let i = 0; i < taggedIds.length; i += 100) {
      const batch = taggedIds.slice(i, i + 100);
      await db
        .update(screenings)
        .set({ isFestivalScreening: true })
        .where(inArray(screenings.id, batch));
    }

    result.screeningsTagged = toTag.length;

    console.log(
      `${LOG_PREFIX} Tagged ${toTag.length} screenings for ${festival.name} ` +
        `(${result.alreadyTagged} already tagged, ${result.screeningsChecked} checked)`
    );
  } else {
    console.log(
      `${LOG_PREFIX} No new screenings to tag for ${festival.name} ` +
        `(${result.alreadyTagged} already tagged, ${result.screeningsChecked} checked)`
    );
  }

  return result;
}

/**
 * Check if a screening matches title keywords or URL patterns for a TITLE-strategy festival.
 */
function matchesTitleSignals(
  filmTitle: string,
  bookingUrl: string,
  config: FestivalTaggingConfig
): boolean {
  const titleLower = filmTitle.toLowerCase();

  // Check title keywords
  if (config.titleKeywords) {
    for (const keyword of config.titleKeywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }

  // Check URL patterns
  if (config.urlPatterns && bookingUrl) {
    for (const pattern of config.urlPatterns) {
      if (pattern.test(bookingUrl)) {
        return true;
      }
    }
  }

  return false;
}
