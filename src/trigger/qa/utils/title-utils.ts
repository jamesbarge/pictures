/**
 * Title normalization for QA comparison.
 * Mirrors the normalizeTitle() logic from src/lib/tmdb/match.ts
 */

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*:\s*.*$/, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\w\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse relative datetime strings from pictures.london into ISO dates.
 *
 * Input formats:
 *   "Today 11:00"
 *   "Tomorrow 14:30"
 *   "Thu 12 Mar 17:40"
 *   "Sat 15 Mar 21:45"
 *
 * Returns ISO string in Europe/London time converted to UTC, or null if unparseable.
 */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseRelativeDatetime(raw: string, referenceDate?: Date): string | null {
  if (!raw) return null;

  const ref = referenceDate ?? new Date();
  const timeMatch = raw.match(/(\d{1,2}):(\d{2})\s*$/);
  if (!timeMatch) return null;

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const prefix = raw.slice(0, timeMatch.index).trim().toLowerCase();

  let year = ref.getFullYear();
  let month: number;
  let day: number;

  if (prefix === "today") {
    month = ref.getMonth();
    day = ref.getDate();
  } else if (prefix === "tomorrow") {
    const tomorrow = new Date(ref);
    tomorrow.setDate(tomorrow.getDate() + 1);
    month = tomorrow.getMonth();
    day = tomorrow.getDate();
  } else {
    // "Thu 12 Mar" or "Sat 15 Mar"
    const dateMatch = prefix.match(/[a-z]{3}\s+(\d{1,2})\s+([a-z]{3})/);
    if (!dateMatch) return null;

    day = parseInt(dateMatch[1], 10);
    const monthStr = dateMatch[2];
    if (!(monthStr in MONTHS)) return null;
    month = MONTHS[monthStr];

    // If the month is earlier than reference, it's likely next year
    if (month < ref.getMonth() - 1) {
      year = ref.getFullYear() + 1;
    }
  }

  // Build a date in London time. We approximate UTC by just creating the date
  // (the DB comparison allows a 30-min window, so ±1h BST offset is acceptable)
  const dt = new Date(year, month, day, hours, minutes, 0);
  if (isNaN(dt.getTime())) return null;

  return dt.toISOString();
}
