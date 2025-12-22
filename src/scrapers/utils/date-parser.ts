/**
 * Date parsing utilities for cinema scrapers
 * Handles various date formats used by UK cinemas
 */

import { parse, setYear, addYears, isAfter } from "date-fns";

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
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try UK date format: 22/12/2024
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [day, month, year] = cleaned.split("/").map(Number);
    return new Date(year, month - 1, day);
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
    let year = yearMatch ? parseInt(yearMatch[1], 10) : referenceDate.getFullYear();

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

    let parsed = new Date(year, month, day);

    // If no year was specified and the date is in the past, assume next year
    if (!yearMatch && isAfter(referenceDate, parsed)) {
      parsed = addYears(parsed, 1);
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

    return new Date(year, monthMap[monthStr], day);
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
 * Combine date and time into a full datetime
 */
export function combineDateAndTime(
  date: Date,
  time: { hours: number; minutes: number }
): Date {
  const combined = new Date(date);
  combined.setHours(time.hours, time.minutes, 0, 0);
  return combined;
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
