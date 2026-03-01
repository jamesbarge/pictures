/**
 * Screening Classification & Dedup
 *
 * Handles event classification (type, format, accessibility) and
 * duplicate detection for screenings. Extracted from the scraper
 * pipeline to keep insertScreening() focused on DB operations.
 */

import { db } from "@/db";
import { films, screenings as screeningsTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  classifyEventCached,
  likelyNeedsClassification,
} from "@/lib/event-classifier";
import type { EventType, ScreeningFormat } from "@/types/screening";
import type { RawScreening } from "../types";

// ============================================================================
// Screening Metadata
// ============================================================================

/** Resolved screening metadata after classification. */
export interface ScreeningMetadata {
  eventType: EventType | undefined;
  eventDescription: string | undefined;
  format: ScreeningFormat | undefined;
  isSpecialEvent: boolean;
  is3D: boolean;
  hasSubtitles: boolean;
  subtitleLanguage: string | null;
  hasAudioDescription: boolean;
  isRelaxedScreening: boolean;
  season: string | null;
}

/**
 * Classify a screening's event type, format, and accessibility.
 * Uses AI classification when the scraper didn't provide event data
 * and the title looks like it needs classification.
 */
export async function classifyScreening(
  screening: RawScreening
): Promise<ScreeningMetadata> {
  let eventType = screening.eventType as EventType | undefined;
  let eventDescription = screening.eventDescription;
  let format = screening.format as ScreeningFormat | undefined;
  let isSpecialEvent = false;
  let is3D = false;
  let hasSubtitles = false;
  let subtitleLanguage: string | null = null;
  let hasAudioDescription = false;
  let isRelaxedScreening = false;
  let season: string | null = null;

  // If scraper didn't provide event data, try to classify the title
  const needsClassification =
    !screening.eventType &&
    !screening.format &&
    likelyNeedsClassification(screening.filmTitle);

  if (needsClassification) {
    try {
      const classification = await classifyEventCached(screening.filmTitle);

      if (classification.eventTypes.length > 0 || classification.format) {
        console.log(
          `[Pipeline] Classified: "${screening.filmTitle}" → ${classification.eventTypes.join(", ") || classification.format || "accessibility"}`
        );
      }

      // Apply classification results
      isSpecialEvent = classification.isSpecialEvent;
      eventType = classification.eventTypes[0] || null;
      eventDescription =
        classification.eventTypes.length > 1
          ? `Also: ${classification.eventTypes.slice(1).join(", ")}`
          : classification.eventDescription ?? undefined;
      format = classification.format || format;
      is3D = classification.is3D;
      hasSubtitles = classification.hasSubtitles;
      subtitleLanguage = classification.subtitleLanguage;
      hasAudioDescription = classification.hasAudioDescription;
      isRelaxedScreening = classification.isRelaxedScreening;
      season = classification.season;
    } catch (e) {
      console.warn(`[Pipeline] Event classification failed:`, e);
      // Continue with scraper-provided data
    }
  }

  return {
    eventType,
    eventDescription,
    format,
    isSpecialEvent,
    is3D,
    hasSubtitles,
    subtitleLanguage,
    hasAudioDescription,
    isRelaxedScreening,
    season,
  };
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/** Result of a duplicate check. */
export interface DuplicateCheckResult {
  /** The existing screening record, or null if no exact duplicate. */
  duplicate: typeof screeningsTable.$inferSelect | null;
  /** Whether this screening should be skipped (same time, different filmId but same normalized title). */
  shouldSkip: boolean;
}

/**
 * Check for duplicate screenings.
 *
 * Two-layer dedup:
 * 1. Exact composite key (filmId + cinemaId + datetime)
 * 2. Same (cinemaId + datetime) with a different filmId but same normalized title
 *    (catches duplicate film records creating duplicate screenings)
 */
export async function checkForDuplicate(
  filmId: string,
  cinemaId: string,
  datetime: Date,
  normalizeTitle: (title: string) => string
): Promise<DuplicateCheckResult> {
  // Check for existing screening using exact composite key
  const [duplicate] = await db
    .select()
    .from(screeningsTable)
    .where(
      and(
        eq(screeningsTable.filmId, filmId),
        eq(screeningsTable.cinemaId, cinemaId),
        eq(screeningsTable.datetime, datetime)
      )
    )
    .limit(1);

  if (duplicate) {
    return { duplicate, shouldSkip: false };
  }

  // Secondary dedup guard: check for same (cinemaId, datetime) with a different filmId
  const [sameTimeDifferentFilm] = await db
    .select({ filmId: screeningsTable.filmId })
    .from(screeningsTable)
    .where(
      and(
        eq(screeningsTable.cinemaId, cinemaId),
        eq(screeningsTable.datetime, datetime)
      )
    )
    .limit(1);

  if (sameTimeDifferentFilm && sameTimeDifferentFilm.filmId !== filmId) {
    // Look up both film titles and compare normalized versions
    const [existingFilm] = await db
      .select({ title: films.title })
      .from(films)
      .where(eq(films.id, sameTimeDifferentFilm.filmId))
      .limit(1);
    const [newFilm] = await db
      .select({ title: films.title })
      .from(films)
      .where(eq(films.id, filmId))
      .limit(1);

    if (existingFilm && newFilm) {
      const existingNorm = normalizeTitle(existingFilm.title);
      const newNorm = normalizeTitle(newFilm.title);
      if (existingNorm === newNorm) {
        console.warn(
          `[Pipeline] Skipping duplicate screening: "${newFilm.title}" at ${cinemaId} ${datetime.toISOString()} ` +
          `(already exists under different filmId with title "${existingFilm.title}")`
        );
        return { duplicate: null, shouldSkip: true };
      }
    }
  }

  return { duplicate: null, shouldSkip: false };
}
