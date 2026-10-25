/**
 * Garden Cinema books on Savoy. Each showing is a TcsPerformance id inside
 * the booking URL. The public site has listed one of those ids under two
 * films; the booking page names the real film and the London start time.
 */

import { londonDateString } from "@/lib/london-date";

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "TcsPerformance_6266328" from a Garden booking URL, or null. */
export function gardenPerformanceId(bookingUrl: string | undefined): string | null {
  const match = bookingUrl?.match(/TcsPerformance_(\d+)/);
  return match ? match[1] : null;
}

/** What the Savoy booking page says the performance is. */
export interface GardenBookingHeading {
  title: string;
  /** London civil date, YYYY-MM-DD. */
  date: string;
  /** London wall clock, 24-hour HH:MM. */
  time: string;
}

/**
 * Read `<h1 class="title">The Social Reckoning (15)</h1>` and
 * `<p class="perf-time">Tuesday 27 Oct 2026, 3:45pm</p>`.
 */
export function parseGardenBookingHeading(html: string): GardenBookingHeading | null {
  const titleRaw = html.match(/<h1 class="title">\s*([^<]+?)\s*<\/h1>/i)?.[1];
  const whenRaw = html.match(/<p class="perf-time">\s*([^<]+?)\s*<\/p>/i)?.[1];
  if (!titleRaw || !whenRaw) return null;

  const title = titleRaw.replace(/\s+\((?:U|PG|12A?|15|18)\)\s*$/i, "").trim();
  const when = whenRaw.match(
    /^[A-Za-z]+\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
  );
  if (!title || !when) return null;

  const month = MONTHS[when[2].slice(0, 3).toLowerCase()];
  if (!month) return null;

  let hour = parseInt(when[4], 10);
  const ampm = when[6].toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;

  return {
    title,
    date: `${when[3]}-${month}-${when[1].padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${when[5]}`,
  };
}

function looseTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function londonTime(date: Date): string {
  const parts = Object.fromEntries(
    LONDON_TIME.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute}`;
}

/** True when the stored row is the showing the booking page describes. */
export function screeningMatchesGardenHeading(
  screening: { filmTitle: string; datetime: Date },
  heading: GardenBookingHeading,
): boolean {
  return (
    looseTitle(screening.filmTitle) === looseTitle(heading.title) &&
    londonDateString(screening.datetime) === heading.date &&
    londonTime(screening.datetime) === heading.time
  );
}

export interface SharedPerformancePlan<T> {
  keep: T[];
  drop: T[];
}

/**
 * A performance id claimed by two different showings. When the booking page
 * names one of them, the others are dropped. When the page can't be read,
 * nothing is dropped.
 */
export function resolveSharedGardenPerformance<T extends { filmTitle: string; datetime: Date }>(
  group: T[],
  heading: GardenBookingHeading | null,
): SharedPerformancePlan<T> {
  if (group.length < 2 || !heading) return { keep: group, drop: [] };
  const keep = group.filter((screening) => screeningMatchesGardenHeading(screening, heading));
  if (keep.length === 0) return { keep: group, drop: [] };
  const kept = new Set(keep);
  return { keep, drop: group.filter((screening) => !kept.has(screening)) };
}
