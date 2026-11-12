/**
 * Screening Classification & Dedup
 *
 * Handles event classification (type, format, accessibility) and
 * duplicate detection for screenings. Extracted from the scraper
 * pipeline to keep insertScreening() focused on DB operations.
 */

import { db } from "@/db";
import { films, screenings as screeningsTable } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  classifyEvent,
  likelyNeedsClassification,
} from "@/lib/event-classifier";
import type { EventType, ScreeningFormat } from "@/types/screening";
import type { RawScreening } from "../types";
import { listingEventNote, programmeStrandNote, strandSeasonNote } from "./film-title-cleaner";

// ============================================================================
// Screening Metadata
// ============================================================================

/** Resolved screening metadata after classification. */
interface ScreeningMetadata {
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
  // A scraper that names the type itself skips title classification below.
  let isRelaxedScreening = screening.eventType === "relaxed";
  let season: string | null = null;

  // If scraper didn't provide event data, try to classify the title
  const needsClassification =
    !screening.eventType &&
    !screening.format &&
    likelyNeedsClassification(screening.filmTitle);

  if (needsClassification) {
    try {
      const classification = await classifyEvent(screening.filmTitle);

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
    } catch (error) {
      console.warn(`[Pipeline] Event classification failed:`, error);
      // Continue with scraper-provided data
    }
  } else if (likelyNeedsClassification(screening.filmTitle)) {
    // The scraper already named a format or event type, so the block above
    // does not run. Accessibility is still read off the title: BFI IMAX keeps
    // its screen format and a title like "Disclosure Day (with subtitles for
    // the D/deaf and those experiencing hearing loss)".
    try {
      const classification = await classifyEvent(screening.filmTitle);
      if (classification.hasSubtitles) {
        hasSubtitles = true;
        subtitleLanguage = classification.subtitleLanguage;
      }
      if (classification.hasAudioDescription) hasAudioDescription = true;
      if (classification.isRelaxedScreening) isRelaxedScreening = true;
      if (classification.is3D) is3D = true;
    } catch (error) {
      console.warn(`[Pipeline] Accessibility classification failed:`, error);
    }
  }

  // A preview, festival, club, or hospitality label peeled off the title is
  // the screening note. The scraper wins when it already wrote one. The
  // classifier does not: for "cocktails, intro + Ennio" it keeps the film
  // title as the description and drops the extras.
  // Castle appends " - Trans Awareness programme 2026" to the film instead;
  // that strand is the note when no label came first.
  if (!screening.eventDescription) {
    const note =
      listingEventNote(screening.filmTitle) ||
      programmeStrandNote(screening.filmTitle);
    if (note) eventDescription = note;
  }

  // screenings.season holds a programme name ("Hitchcock: Master of Suspense").
  // SLA and the Bubblegum club land here when the classifier found none.
  if (!season) {
    const strand = strandSeasonNote(screening.filmTitle);
    if (strand) season = strand;
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
interface DuplicateCheckResult {
  /** The existing screening record, or null if no exact duplicate. */
  duplicate: typeof screeningsTable.$inferSelect | null;
  /** Whether this screening should be skipped (same time, different filmId but same normalized title). */
  shouldSkip: boolean;
}

/** How far apart two clocks can be and still be the same showing. */
const TICKET_WINDOW_MS = 120_000;

function normalizeScreenLabel(screen: string | null | undefined): string {
  return (screen ?? "").trim().toLowerCase();
}

/**
 * A booking link that names one showing or one film, not a cinema homepage.
 * A UUID, a 4+ digit id, or a Picturehouse `HO00018763` code counts. A shared
 * `/whats-on` page does not, so two films starting together are left alone.
 */
export function bookingUrlIdentifiesAShowing(url: string | null | undefined): boolean {
  if (!url || url.length < 12) return false;
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4,}|HO\d{5,}/i.test(url);
}

/**
 * Same cinema is the caller's job. This is the rest of one ticket slot:
 * the same showing-specific link, the same screen (both blank counts), and
 * clocks within two minutes.
 */
export function isSameTicketSlot(
  existing: { bookingUrl: string; datetime: Date; screen: string | null },
  incoming: { bookingUrl: string; datetime: Date; screen?: string | null },
  windowMs = TICKET_WINDOW_MS,
): boolean {
  if (!bookingUrlIdentifiesAShowing(incoming.bookingUrl)) return false;
  if (existing.bookingUrl !== incoming.bookingUrl) return false;
  if (normalizeScreenLabel(existing.screen) !== normalizeScreenLabel(incoming.screen)) return false;
  return Math.abs(existing.datetime.getTime() - incoming.datetime.getTime()) <= windowMs;
}

/**
 * Check for duplicate screenings.
 *
 * Layers:
 * 0. Same (cinemaId + sourceId) regardless of filmId. The cinema's source_id
 *    is the operational identity of a showing — if we've seen the same
 *    source_id before, it IS the same showing, even if a previous scrape
 *    resolved it to a different film. Returning the existing row lets the
 *    caller refresh its filmId.
 * 0.5. Same showing-specific booking URL, screen, and time, when the two
 *    film titles normalize to one film. Everyman files "Festive Fun with
 *    Peppa" and "... Cinema Experience" as two movies that share a ticketing
 *    UUID. Different films that share a link (Garden's bilingual cards) are
 *    not merged here.
 * 1. Exact composite key (filmId + cinemaId + datetime)
 * 2. Same (cinemaId + datetime) with a different filmId but same normalized title
 */
export async function checkForDuplicate(
  filmId: string,
  cinemaId: string,
  datetime: Date,
  normalizeTitle: (title: string) => string,
  sourceId?: string,
  bookingUrl?: string,
  screen?: string | null,
): Promise<DuplicateCheckResult> {
  // Layer 0: same (cinemaId, sourceId) regardless of filmId or datetime.
  //
  // Datetime is intentionally NOT in the WHERE clause — if it were, a re-scrape
  // with a corrected datetime (e.g. after a BST timezone-conversion regression
  // is fixed) would miss the existing row and insert a fresh one, leaving the
  // old (wrong-hour) row stranded. Without the datetime filter, the caller can
  // UPDATE the existing row's datetime in place. The companion unique index
  // `idx_screenings_cinema_source` enforces this invariant at the DB level.
  if (sourceId) {
    const [bySource] = await db
      .select()
      .from(screeningsTable)
      .where(
        and(
          eq(screeningsTable.cinemaId, cinemaId),
          eq(screeningsTable.sourceId, sourceId)
        )
      )
      .limit(1);

    if (bySource) {
      return { duplicate: bySource, shouldSkip: false };
    }
  }

  // Layer 0.5: one ticketing link at this cinema and clock is one showing,
  // once the cleaner agrees the two titles are the same film. A different
  // film on the same link is left in place (Garden's bilingual pair).
  if (bookingUrl && bookingUrlIdentifiesAShowing(bookingUrl)) {
    const ticketWindowStart = new Date(datetime.getTime() - TICKET_WINDOW_MS);
    const ticketWindowEnd = new Date(datetime.getTime() + TICKET_WINDOW_MS);
    const ticketRows = await db
      .select({ screening: screeningsTable, title: films.title })
      .from(screeningsTable)
      .innerJoin(films, eq(films.id, screeningsTable.filmId))
      .where(
        and(
          eq(screeningsTable.cinemaId, cinemaId),
          eq(screeningsTable.bookingUrl, bookingUrl),
          gte(screeningsTable.datetime, ticketWindowStart),
          lte(screeningsTable.datetime, ticketWindowEnd),
        ),
      )
      .limit(8);

    const [incomingFilm] = await db
      .select({ title: films.title })
      .from(films)
      .where(eq(films.id, filmId))
      .limit(1);
    const incomingNorm = incomingFilm ? normalizeTitle(incomingFilm.title) : null;

    for (const row of ticketRows) {
      if (!isSameTicketSlot(row.screening, { bookingUrl, datetime, screen })) continue;
      const sameFilm =
        row.screening.filmId === filmId ||
        (incomingNorm !== null && normalizeTitle(row.title) === incomingNorm);
      if (!sameFilm) continue;
      console.warn(
        `[Pipeline] Same ticket link at ${cinemaId} ${datetime.toISOString()} ` +
          `already stored as ${row.screening.id} ("${row.title}")`,
      );
      return { duplicate: row.screening, shouldSkip: false };
    }
  }

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

  // Layer 1.5: Same filmId + cinemaId within ±2 minutes (catches sub-minute timestamp drift)
  const windowStart = new Date(datetime.getTime() - TICKET_WINDOW_MS);
  const windowEnd = new Date(datetime.getTime() + TICKET_WINDOW_MS);
  const [nearDuplicate] = await db
    .select()
    .from(screeningsTable)
    .where(
      and(
        eq(screeningsTable.filmId, filmId),
        eq(screeningsTable.cinemaId, cinemaId),
        gte(screeningsTable.datetime, windowStart),
        lte(screeningsTable.datetime, windowEnd)
      )
    )
    .limit(1);

  if (nearDuplicate) {
    return { duplicate: nearDuplicate, shouldSkip: false };
  }

  // Secondary dedup guard: check for same (cinemaId, ±2min window) with a different filmId
  // Widened from exact datetime to catch sub-minute timestamp drift across duplicate film records
  const [sameTimeDifferentFilm] = await db
    .select({ filmId: screeningsTable.filmId })
    .from(screeningsTable)
    .where(
      and(
        eq(screeningsTable.cinemaId, cinemaId),
        gte(screeningsTable.datetime, windowStart),
        lte(screeningsTable.datetime, windowEnd)
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
