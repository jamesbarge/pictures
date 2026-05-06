/**
 * Shared calendar-page parser for The Castle Cinema (Hackney) and Castle Sidcup.
 *
 * Both venues run the same Wagtail-based booking system at <baseUrl>/calendar/.
 * The calendar page is the source of truth: it lists every published performance
 * across the whole programmed window (typically 6+ weeks), whereas the homepage
 * JSON-LD only surfaces the next ~7 days.
 *
 * DOM contract (verified 2026-05-06):
 *
 *   <h3 class="date">Wed, 6 May</h3>           ← date heading per day
 *   ...
 *     <h1>The Devil Wears Prada 2</h1>          ← film title
 *     ...
 *     <a class="performance-button button sm "
 *        data-perf-id="16468"
 *        data-start-time="2026-05-06T16:00:00"   ← UK local time, no TZ suffix
 *        href="/bookings/16468/">                ← booking page (date+time confirmed
 *                                                   on the booking page in
 *                                                   "Thursday 14 of May 2026 - 20:45"
 *                                                   form for spot-checks)
 *     </a>
 *
 * Each performance button maps 1:1 to a screening. The film title for a given
 * button is the most recent preceding <h1> in document order.
 */

import { CHROME_USER_AGENT } from "../constants";
import type { RawScreening } from "../types";
import { parseUKLocalDateTime } from "../utils/date-parser";

interface PerformanceButton {
  perfId: string;
  startTime: string;
  href: string;
  position: number;
}

/**
 * Fetch the calendar page HTML for a Castle-platform cinema.
 */
export async function fetchCalendarHtml(baseUrl: string): Promise<string> {
  const url = `${baseUrl}/calendar/`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": CHROME_USER_AGENT,
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Decode the small set of HTML entities that turn up in Wagtail-rendered
 * Castle film titles. We don't pull in a full entity library because (a) the
 * downstream pipeline (`cleanFilmTitleWithMetadata`) re-runs a richer decode
 * pass and (b) keeping this minimal makes it obvious what shapes we expect.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Parse calendar HTML into raw screenings.
 *
 * @param html - Calendar page HTML
 * @param sourceIdPrefix - Used to namespace screening source IDs across venues
 *   (e.g. "castle" for Hackney, "castle-sidcup" for Sidcup)
 * @param baseUrl - Used to build absolute booking URLs from relative hrefs
 *
 * @throws if the page contains performance-button elements but none of them
 *   match the expected attribute layout — that signals a Wagtail template
 *   change rather than a quiet site, and we want it to be loud not silent.
 */
export function parseCalendarPage(
  html: string,
  sourceIdPrefix: string,
  baseUrl: string,
): RawScreening[] {
  // Anchor: the calendar block always starts with the first <h3 class="date">.
  // Anything before that (page header, sidebar, banner) is ignored so a stray
  // <h1> in chrome can't be picked up as a film title.
  const calendarStart = html.search(/<h3\s+class="date"/i);
  if (calendarStart < 0) return [];

  // Index every <h1>...</h1> in the calendar block by document position so we
  // can resolve the nearest-preceding film title for each performance button.
  const filmTitles: { position: number; title: string }[] = [];
  for (const m of html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)) {
    if (m.index === undefined || m.index < calendarStart) continue;
    const title = decodeEntities(m[1].trim());
    if (title) filmTitles.push({ position: m.index, title });
  }

  // Find every performance button. The attribute order is fixed in the
  // template (class → data-perf-id → data-filters → data-start-time → href).
  const buttons: PerformanceButton[] = [];
  const pattern =
    /<a\s+class="performance-button[^"]*"[^>]*data-perf-id="(\d+)"[^>]*data-start-time="([^"]+)"[^>]*href="([^"]+)"/gi;
  for (const m of html.matchAll(pattern)) {
    if (m.index === undefined) continue;
    buttons.push({
      perfId: m[1],
      startTime: m[2],
      href: m[3],
      position: m.index,
    });
  }

  // Sentinel: if the page has any opening `class="performance-button"` tag
  // but the structured pattern above matched zero, the Wagtail template has
  // shifted attribute order. Surface that as a hard error so the scrape
  // fails loudly instead of looking like a quiet day at the cinema.
  const buttonOpeningTagCount = (
    html.match(/class="performance-button[^"]*"/g) ?? []
  ).length;
  if (buttonOpeningTagCount > 0 && buttons.length === 0) {
    throw new Error(
      `[castle-calendar] Detected ${buttonOpeningTagCount} performance-button tag(s) but parsed 0 — Wagtail template likely changed attribute order or markup`,
    );
  }

  const screenings: RawScreening[] = [];

  for (const button of buttons) {
    // Resolve the most recent preceding <h1> as the film title. Both <h1> and
    // performance buttons are ordered by document position, so we can scan
    // from the end of filmTitles backwards.
    let filmTitle: string | null = null;
    for (let i = filmTitles.length - 1; i >= 0; i--) {
      if (filmTitles[i].position < button.position) {
        filmTitle = filmTitles[i].title;
        break;
      }
    }

    if (!filmTitle) continue;

    const datetime = parseUKLocalDateTime(button.startTime);
    if (isNaN(datetime.getTime())) continue;

    const bookingUrl = button.href.startsWith("http")
      ? button.href
      : `${baseUrl}${button.href}`;

    screenings.push({
      filmTitle,
      datetime,
      bookingUrl,
      sourceId: `${sourceIdPrefix}-${button.perfId}`,
    });
  }

  return screenings;
}

/**
 * Validate and dedupe the parsed screenings.
 */
export function validateScreenings(screenings: RawScreening[]): RawScreening[] {
  const now = new Date();
  const seen = new Set<string>();

  return screenings.filter((s) => {
    if (!s.filmTitle || s.filmTitle.trim() === "") return false;
    if (!s.datetime || isNaN(s.datetime.getTime())) return false;
    if (!s.bookingUrl || s.bookingUrl.trim() === "") return false;
    if (s.datetime < now) return false;
    if (s.sourceId && seen.has(s.sourceId)) return false;
    if (s.sourceId) seen.add(s.sourceId);
    return true;
  });
}
