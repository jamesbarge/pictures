/**
 * Date parsing utilities for cinema scrapers
 * Handles various date formats used by UK cinemas
 *
 * IMPORTANT: All dates are constructed as UTC and corrected for UK timezone (GMT/BST).
 * Scrapers run on UTC servers (the cloud orchestrator), so we must explicitly account for BST
 * (last Sunday of March 01:00 UTC through last Sunday of October 01:00 UTC).
 */

/**
 * Find the last Sunday of a given month (0-indexed).
 * Used to compute BST start (March) and end (October) boundaries.
 */
export function lastSundayOfMonth(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = lastDay; d >= 1; d--) {
    if (new Date(Date.UTC(year, month, d)).getUTCDay() === 0) return d;
  }
  return lastDay;
}

/**
 * Check if a UK local datetime falls within British Summer Time (BST = UTC+1).
 * BST runs from the last Sunday of March at 01:00 UTC to the last Sunday of October at 01:00 UTC.
 *
 * @param year - Full year
 * @param month - 0-indexed month (0=Jan, 11=Dec)
 * @param day - Day of month
 * @param hours - Hour in UK local time (0-23)
 */
export function isUKSummerTime(year: number, month: number, day: number, hours: number): boolean {
  if (month < 2 || month > 9) return false;
  if (month > 2 && month < 9) return true;

  const bstStartDay = lastSundayOfMonth(year, 2);
  const bstEndDay = lastSundayOfMonth(year, 9);

  if (month === 2) {
    if (day > bstStartDay) return true;
    if (day < bstStartDay) return false;
    return hours >= 1;
  }

  // month === 9 (October)
  if (day < bstEndDay) return true;
  if (day > bstEndDay) return false;
  return hours < 2;
}

/**
 * Convert UK local time components to a UTC Date.
 *
 * Cinema websites display times in UK local time. During BST (UTC+1),
 * "18:00" means 17:00 UTC. This function handles that conversion.
 */
export function ukLocalToUTC(year: number, month: number, day: number, hours: number, minutes: number): Date {
  const utc = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  if (isUKSummerTime(year, month, day, hours)) {
    utc.setUTCHours(utc.getUTCHours() - 1);
  }
  return utc;
}

/**
 * Read a UTC instant's clock fields as they appear in Europe/London,
 * independent of the host timezone.
 *
 * Hosts can use different timezones, while cinema policy (opening hours,
 * holiday closures) is expressed in London local time. Reading `getHours()` off
 * a Date answers "what hour is this on the host clock", which is a different
 * question and gives a different answer for most of the year.
 *
 * `month` is 0-indexed, matching ukLocalToUTC() and isUKSummerTime() above.
 *
 * Uses Intl (IANA-backed) because the BST arithmetic above runs the opposite
 * direction: UK-local components in, UTC instant out.
 *
 * Requires a valid Date. Intl throws RangeError on an invalid time value, so
 * callers must screen with isNaN(date.getTime()) first, as validateScreening does.
 */
const londonPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23 keeps midnight as hour 0. Some ICU versions report it as 24 under
  // hour12: false, which silently breaks hour-range comparisons.
  hourCycle: "h23",
});

export function londonParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} {
  const parts = londonPartsFormatter.formatToParts(date);
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    // Unreachable with the options above. Throwing keeps it that way: an
    // optional chain here would yield NaN, and NaN < MIN_SCREENING_HOUR is
    // false, so a missing part would silently accept every screening.
    if (!part) throw new Error(`londonParts: Intl returned no "${type}" part`);
    return Number(part.value);
  };

  return {
    year: field("year"),
    month: field("month") - 1,
    day: field("day"),
    hours: field("hour"),
    minutes: field("minute"),
  };
}

/**
 * Parse an ISO-like datetime string that represents UK local time.
 *
 * IMPORTANT: Use this when an API returns "2025-12-27T20:30" meaning UK local time
 * but WITHOUT a timezone indicator.
 *
 * This function always parses the datetime components directly and converts
 * to UTC accounting for BST.
 *
 * @param isoString - ISO-like string e.g. "2025-12-27T20:30"
 * @returns Date object in UTC, correctly offset for BST when applicable
 */
export function parseUKLocalDateTime(isoString: string): Date {
  const [datePart, timePart] = isoString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = (timePart || "00:00").split(":").map(Number);
  return ukLocalToUTC(year, month - 1, day, hours, minutes);
}

/** A calendar day, month 0-indexed, as returned by londonParts(). */
interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** Is `a` strictly earlier than `b` on the calendar? Order-only, no instants. */
function isBeforeLondonDay(a: CalendarDay, b: CalendarDay): boolean {
  return (
    a.year * 10000 + a.month * 100 + a.day <
    b.year * 10000 + b.month * 100 + b.day
  );
}

/**
 * Parse a date string in various UK cinema formats
 * Examples:
 * - "Sun 22 Dec" (BFI style)
 * - "22 December 2024"
 * - "22/12/2024"
 * - "2024-12-22"
 */
export function parseScreeningDate(dateStr: string, referenceDate = new Date()): Date | null {
  const cleaned = dateStr.trim();

  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    if (cleaned.includes("T")) {
      return parseUKLocalDateTime(cleaned);
    }
    const [year, month, day] = cleaned.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Try UK date format: 22/12/2024
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [day, month, year] = cleaned.split("/").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Try "Sun 22 Dec" or "Sunday 22 December" or "Friday 19th December" format
  // Handle ordinal suffixes (st, nd, rd, th)
  const dayMonthMatch = cleaned.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)/i
  );

  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const monthStr = dayMonthMatch[2];

    // Check if year is included
    const yearMatch = cleaned.match(/(\d{4})/);
    // Default the year from the reference instant's LONDON calendar day, so the
    // inference does not depend on the host timezone (scrapers and CI run UTC).
    // Resolved lazily: an explicit year needs no reference at all, and
    // londonParts() throws on an invalid Date.
    let londonToday: CalendarDay | undefined;
    const today = (): CalendarDay => (londonToday ??= londonParts(referenceDate));
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today().year;

    const monthMap: Record<string, number> = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11,
    };

    const month = monthMap[monthStr.toLowerCase()];
    if (month === undefined) return null;

    let parsed = new Date(Date.UTC(year, month, day));

    // If no year was specified and the date is in the past, assume next year.
    //
    // Compare CALENDAR DAYS in Europe/London, not instants. The old check
    // compared the reference instant against the parsed day's UTC midnight, so
    // for the whole of today after 00:00 today looked past: a listing for
    // "Wednesday 9th September" read at 17:00 on 9 September resolved to the
    // following year, and the horizon then discarded that day's screenings
    // (worst at New Year's Eve, which jumped a full year). Same-day is now
    // kept; a genuinely earlier day still rolls forward, as before.
    if (!yearMatch && isBeforeLondonDay({ year, month, day }, today())) {
      // Roll with UTC calendar arithmetic. date-fns addYears() works in LOCAL
      // time, so across a DST boundary it moves the UTC day: under
      // TZ=Europe/London it turned 2026-03-29T00:00Z into 2027-03-28T23:00Z,
      // and combineDateAndTime() reads UTC components, so the screening landed
      // on the wrong day. Deriving from `parsed` keeps the pre-existing
      // Date.UTC overflow behaviour for 29 February.
      const rolledYear = parsed.getUTCFullYear() + 1;
      const rolledMonth = parsed.getUTCMonth();
      // Clamp to the last day of the target month, matching date-fns addYears:
      // a real 29 February rolls to 28 February, it does not spill into March.
      // (Distinct from an already-invalid "29 February" in a non-leap year,
      // which Date.UTC has by then overflowed to 1 March above.)
      const lastDayOfMonth = new Date(Date.UTC(rolledYear, rolledMonth + 1, 0)).getUTCDate();
      parsed = new Date(
        Date.UTC(rolledYear, rolledMonth, Math.min(parsed.getUTCDate(), lastDayOfMonth)),
      );
    }

    return parsed;
  }

  // Try "22 December 2024" format
  const fullDateMatch = cleaned.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );

  if (fullDateMatch) {
    const day = parseInt(fullDateMatch[1], 10);
    const monthStr = fullDateMatch[2].toLowerCase();
    const year = parseInt(fullDateMatch[3], 10);

    const monthMap: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3,
      may: 4, june: 5, july: 6, august: 7,
      september: 8, october: 9, november: 10, december: 11,
    };

    return new Date(Date.UTC(year, monthMap[monthStr], day));
  }

  return null;
}

/**
 * Parse a time string
 * Examples: "18:30", "6:30pm", "6.30 PM"
 */
export function parseScreeningTime(timeStr: string): { hours: number; minutes: number } | null {
  const cleaned = timeStr.trim().toLowerCase();

  // 24-hour format: 18:30
  // NOTE: If time is ambiguous (1:00-9:59 without AM/PM), assume PM
  // since cinema showtimes are typically afternoon/evening, not early morning
  const time24Match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    let hours = parseInt(time24Match[1], 10);
    const minutes = parseInt(time24Match[2], 10);

    // If hour is 1-9 (ambiguous 12-hour format without AM/PM), assume PM
    // Cinema screenings at 2:00 mean 14:00, not 02:00
    if (hours >= 1 && hours <= 9) {
      hours += 12;
    }

    return { hours, minutes };
  }

  // 12-hour format: 6:30pm, 6.30 PM
  const time12Match = cleaned.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)$/);
  if (time12Match) {
    let hours = parseInt(time12Match[1], 10);
    const minutes = parseInt(time12Match[2], 10);
    const period = time12Match[3];

    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    return { hours, minutes };
  }

  // Just hours: 6pm
  const hourOnlyMatch = cleaned.match(/^(\d{1,2})\s*(am|pm)$/);
  if (hourOnlyMatch) {
    let hours = parseInt(hourOnlyMatch[1], 10);
    const period = hourOnlyMatch[2];

    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    return { hours, minutes: 0 };
  }

  return null;
}

/**
 * Combine date and time into a full datetime, correctly handling BST.
 * Uses the date's UTC components and converts the time via ukLocalToUTC.
 */
export function combineDateAndTime(
  date: Date,
  time: { hours: number; minutes: number }
): Date {
  return ukLocalToUTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time.hours,
    time.minutes,
  );
}

/**
 * Parse a combined date/time string
 */
export function parseDateTime(dateTimeStr: string): Date | null {
  // Try to split into date and time parts
  // Common patterns: "Sun 22 Dec, 18:30" or "22/12/2024 6:30pm"

  const parts = dateTimeStr.split(/[,\s]+at\s+|,\s+|\s{2,}/);

  if (parts.length >= 2) {
    const datePart = parts.slice(0, -1).join(" ");
    const timePart = parts[parts.length - 1];

    const date = parseScreeningDate(datePart);
    const time = parseScreeningTime(timePart);

    if (date && time) {
      return combineDateAndTime(date, time);
    }
  }

  // Try parsing as ISO datetime
  const isoDate = new Date(dateTimeStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
}
