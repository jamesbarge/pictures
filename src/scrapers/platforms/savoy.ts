/**
 * Savoy Systems platform client — MODERN JSON template.
 *
 * These venues embed `var Events = {"Events":[...]};` as inline JSON on their
 * homepage (root redirects to `/{Dll}.dll/Home`). Shared by Rio, Lexi, and The
 * Arzner. Each film carries `Performances[]` with `StartDate` + `StartTime`
 * (HHMM, UK-local).
 *
 * NOT for the LEGACY HTML-table Savoy installs (Ciné Lumière, ArtHouse Crouch
 * End) — those render server-side `div.programme` tables with NO `var Events`
 * blob and need a separate table parser.
 *
 * Per-venue variation is injected via the SavoyVenue config (sourceId + booking
 * URL builders, optional TypeDescription==="Film" filter) so the parser stays
 * shared while each venue keeps its exact sourceId scheme.
 */

import type { RawScreening } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";
import { combineDateAndTime } from "../utils/date-parser";
import { sanitizeRuntime } from "../utils/metadata-parser";

export interface SavoyPerformance {
  /** Savoy performance id — used in Lexi/Arzner sourceIds (`{event.ID}-{perf.ID}`). */
  ID?: number;
  StartDate: string; // "2026-07-18"
  StartTime: string; // "1800" (HHMM)
  AuditoriumName?: string;
  URL?: string;
  /** Present on Lexi/Arzner (e.g. "Film"); absent on Rio. */
  TypeDescription?: string;
}

export interface SavoyEvent {
  ID: number;
  Title: string;
  Director?: string;
  Year?: string;
  /** Runtime in minutes — observed as a JSON number, tolerate strings. */
  RunningTime?: number | string;
  URL?: string;
  Performances: SavoyPerformance[];
}

interface SavoyEventsData {
  Events: SavoyEvent[];
}

export interface SavoyVenue {
  cinemaId: string;
  baseUrl: string;
  /** Keep only performances whose TypeDescription is "Film" (skips theatre/live
   * events at mixed-programme venues). Off for Rio (no TypeDescription field). */
  filmTypeOnly?: boolean;
  buildSourceId: (event: SavoyEvent, perf: SavoyPerformance, datetime: Date) => string;
  buildBookingUrl: (event: SavoyEvent, perf: SavoyPerformance, baseUrl: string) => string;
}

/**
 * Extract the `var Events = {...};` JSON object from a Savoy homepage. The blob
 * is large and contains HTML, so boundaries are found by brace-matching (string
 * literals + escapes respected). THROWS if the blob is missing or unbalanced —
 * never swallowed as an empty result (SCRAPING_PLAYBOOK.md failure semantics).
 */
export function extractSavoyEventsJson(html: string, cinemaId: string): SavoyEventsData {
  const startMarker = "var Events = ";
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`[${cinemaId}] Savoy 'var Events' blob not found on page`);
  }

  const jsonStart = startIdx + startMarker.length;
  let jsonEnd = jsonStart;
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\" && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") braceCount++;
      if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
  }

  if (braceCount !== 0) {
    throw new Error(`[${cinemaId}] Failed to extract Savoy Events JSON (unbalanced braces)`);
  }
  return JSON.parse(html.slice(jsonStart, jsonEnd)) as SavoyEventsData;
}

/** Savoy StartDate ("2026-07-18") + StartTime ("1800", HHMM, UK-local) → UTC Date. */
function parseSavoyDateTime(dateStr: string, timeStr: string): Date {
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = parseInt(timeStr.substring(2, 4), 10);
  const [year, month, day] = dateStr.split("-").map(Number);
  // combineDateAndTime treats the time as UK-local and applies BST.
  return combineDateAndTime(new Date(Date.UTC(year, month - 1, day)), { hours, minutes });
}

/**
 * Parse a Savoy modern-JSON homepage into future RawScreenings. Throws on a
 * missing/malformed Events blob (via extractSavoyEventsJson) — never empty-as-
 * success. Skips past screenings and (when filmTypeOnly) non-film performances.
 */
export async function parseSavoyEvents(
  html: string,
  venue: SavoyVenue,
  now: Date = new Date(),
): Promise<RawScreening[]> {
  await FestivalDetector.preload();
  const data = extractSavoyEventsJson(html, venue.cinemaId);
  const screenings: RawScreening[] = [];

  for (const event of data.Events) {
    for (const perf of event.Performances) {
      // Keeps a performance when TypeDescription is ABSENT (only drops an
      // explicit non-"Film"). Inert for Rio (no TypeDescription field).
      // TODO(lexi/arzner): confirm TypeDescription is always present on a real
      // fetch before trusting keep-on-absent — else non-film events leak in.
      if (venue.filmTypeOnly && perf.TypeDescription && perf.TypeDescription !== "Film") {
        continue;
      }
      const datetime = parseSavoyDateTime(perf.StartDate, perf.StartTime);
      if (isNaN(datetime.getTime()) || datetime < now) continue;

      const bookingUrl = venue.buildBookingUrl(event, perf, venue.baseUrl);
      screenings.push({
        filmTitle: event.Title,
        datetime,
        screen: perf.AuditoriumName || undefined,
        bookingUrl,
        sourceId: venue.buildSourceId(event, perf, datetime),
        year: event.Year ? parseInt(event.Year, 10) : undefined,
        director: event.Director || undefined,
        runtime: sanitizeRuntime(event.RunningTime),
        ...FestivalDetector.detect(venue.cinemaId, event.Title, datetime, bookingUrl),
      });
    }
  }

  return screenings;
}
