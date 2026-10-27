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

/**
 * A parenthetical that describes the print, not an English translation.
 * "The Godfather (Part II)" and "Cabaret (1972 Restoration)" stay whole.
 */
const NOT_AN_ENGLISH_TITLE =
  /\b(?:parts?|volumes?|chapters?|cuts?|restorations?|anniversar(?:y|ies)|premieres?|subtitled|dubbed|remasters?|remastered|editions?|versions?|16mm|35mm|70mm|imax|4k|screenings?)\b/i;

/**
 * ASCII originals need a function word that is not an ordinary English title
 * word. "de" covers "El canto de las manos" and "La guitarra flamenca de …".
 * "la" / "el" / "die" are not in the list: "La La Land" and "Die Hard" are
 * English titles.
 */
const ROMANCE_FUNCTION_WORD = /\b(?:de|del|los|las|une|gli)\b/iu;

function stripGardenDecoration(title: string): string {
  let current = title.trim();
  for (let pass = 0; pass < 2; pass++) {
    const next = current
      .replace(/\s+\((?:U|PG|12A?|15|18)\)\s*$/i, "")
      .replace(/\s+\((?:19|20)\d{2}\)\s*$/, "")
      .trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Garden's `Original title (English title)`, or null when the title is not
 * that shape.
 *
 * The booking page puts a strand in front of the same shape:
 * "In-Edit Cine-Documental: La guitarra flamenca de Yerai Cortés (The
 * Flamenco Guitar of Yerai Cortés) (PG)". The parenthetical is still the
 * English title. A trailing year — "El canto de las manos (Song of the
 * Hands) (2025)" — is decoration, not the translation.
 */
export function gardenEnglishTitle(title: string): string | null {
  const stripped = stripGardenDecoration(title);
  const match = stripped.match(/^(.+?)\s+\(([^()]+)\)\s*$/u);
  if (!match) return null;

  const original = match[1].trim();
  const english = match[2].trim();
  if (original.split(/\s+/).length < 2 || english.split(/\s+/).length < 2) return null;
  if (!/^\p{L}/u.test(english)) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s,:'’!?.&\-]*$/u.test(english)) return null;
  if (NOT_AN_ENGLISH_TITLE.test(english)) return null;
  if (looseTitle(original) === looseTitle(english)) return null;

  const foreign =
    /[^\u0000-\u007f]/u.test(original) || ROMANCE_FUNCTION_WORD.test(original);
  if (!foreign) return null;
  return english;
}

/** Film title to store: the English parenthetical when Garden printed one. */
export function gardenListingTitle(title: string): string {
  return gardenEnglishTitle(title) ?? title;
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
    looseTitle(gardenListingTitle(screening.filmTitle)) ===
      looseTitle(gardenListingTitle(heading.title)) &&
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
 *
 * A heading can match both the bilingual listing and the English title inside
 * it ("In-Edit Cine-Documental: … (The Flamenco Guitar of Yerai Cortés)").
 * The row whose title already is that English title is the one kept. Exact
 * equality used to match neither, because of the strand prefix, and the
 * empty-keep guard then left both rows in place.
 */
export function resolveSharedGardenPerformance<T extends { filmTitle: string; datetime: Date }>(
  group: T[],
  heading: GardenBookingHeading | null,
): SharedPerformancePlan<T> {
  if (group.length < 2 || !heading) return { keep: group, drop: [] };
  const keep = group.filter((screening) => screeningMatchesGardenHeading(screening, heading));
  if (keep.length === 0) return { keep: group, drop: [] };
  const wanted = looseTitle(gardenListingTitle(heading.title));
  const preferred = keep.filter((screening) => looseTitle(screening.filmTitle) === wanted);
  const chosen = preferred.length > 0 ? preferred : keep;
  const kept = new Set(chosen);
  return { keep: chosen, drop: group.filter((screening) => !kept.has(screening)) };
}

/**
 * Two listings of one performance that are the same film once Garden's
 * "Original (English)" parenthetical is read. The English title stays.
 * Different films that share an id (the booking page is what separates
 * those) are left for {@link resolveSharedGardenPerformance}.
 */
export function collapseGardenTranslationDuplicates<
  T extends { filmTitle: string; datetime: Date; bookingUrl?: string },
>(screenings: T[]): SharedPerformancePlan<T> {
  const drop = new Set<T>();
  const groups = new Map<string, T[]>();
  for (const screening of screenings) {
    const id = screening.bookingUrl ? gardenPerformanceId(screening.bookingUrl) : null;
    if (!id) continue;
    const key = `${id}\0${screening.datetime.toISOString()}`;
    const list = groups.get(key) ?? [];
    list.push(screening);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const translated = group.map((screening) => looseTitle(gardenListingTitle(screening.filmTitle)));
    if (new Set(translated).size !== 1) continue;
    const wanted = translated[0];
    const preferred = group.filter((screening) => looseTitle(screening.filmTitle) === wanted);
    const keep = preferred[0] ?? group[0];
    for (const screening of group) {
      if (screening !== keep) drop.add(screening);
    }
  }

  return {
    keep: screenings.filter((screening) => !drop.has(screening)),
    drop: screenings.filter((screening) => drop.has(screening)),
  };
}
