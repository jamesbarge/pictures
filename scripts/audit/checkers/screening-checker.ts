/**
 * Screening Checker
 * Tests screening data patterns from cinema detail pages.
 *
 * Checks:
 * - Suspicious patterns (3+ screenings of same film on one day)
 * - Unreasonable times (2am-5am — likely timezone bugs)
 * - Past screenings displayed
 */

import type { Page } from "playwright";
import type { AuditIssue } from "../types";

const BASE_URL = "https://pictures.london";

interface ScreeningEntry {
  filmTitle: string;
  time: string;
  date: string;
  format?: string;
  bookingUrl: string;
}

/**
 * Extract screening entries from a cinema detail page.
 */
export async function extractScreenings(
  page: Page,
  cinemaSlug: string
): Promise<ScreeningEntry[]> {
  const url = `${BASE_URL}/cinemas/${cinemaSlug}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForSelector("h1", { timeout: 10000 });

  return page.evaluate(() => {
    const screenings: Array<{
      filmTitle: string;
      time: string;
      date: string;
      format?: string;
      bookingUrl: string;
    }> = [];

    let currentDate = "";

    // Walk through the screening list structure
    const container = document.querySelector(".space-y-8");
    if (!container) return screenings;

    // Each date group has an h3 header followed by screening cards
    const dateGroups = Array.from(container.children);
    for (const group of dateGroups) {
      const dateHeader = group.querySelector("h3");
      if (dateHeader) {
        currentDate = dateHeader.textContent?.trim() || "";
      }

      const cards = Array.from(group.querySelectorAll('a[target="_blank"]'));
      for (const card of cards) {
        const href = card.getAttribute("href") || "";

        // Time is in the font-mono div
        const timeEl = card.querySelector(".font-mono");
        const time = timeEl?.textContent?.trim() || "";

        // Film title
        const titleEl = card.querySelector(".text-text-primary.font-medium");
        const filmTitle = titleEl?.childNodes[0]?.textContent?.trim() || "";

        // Format
        const formatEl = card.querySelector(".text-xs.text-text-tertiary.uppercase");
        const format = formatEl?.textContent?.trim() || undefined;

        screenings.push({
          filmTitle,
          time,
          date: currentDate,
          format: format && format !== "unknown" ? format : undefined,
          bookingUrl: href,
        });
      }
    }

    return screenings;
  });
}

/**
 * Check screenings for suspicious patterns.
 */
export function checkScreeningPatterns(
  screenings: ScreeningEntry[],
  cinemaName: string,
  cinemaSlug: string
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const url = `${BASE_URL}/cinemas/${cinemaSlug}`;

  // Group by date+film to find suspicious duplicates
  const dateFilmMap = new Map<string, ScreeningEntry[]>();
  for (const s of screenings) {
    const key = `${s.date}|||${s.filmTitle}`;
    if (!dateFilmMap.has(key)) dateFilmMap.set(key, []);
    dateFilmMap.get(key)!.push(s);
  }

  for (const [key, group] of Array.from(dateFilmMap.entries())) {
    if (group.length >= 3) {
      const [date, filmTitle] = key.split("|||");
      issues.push({
        severity: "info",
        category: "suspicious_screening_pattern",
        message: `"${filmTitle}" at ${cinemaName} has ${group.length} screenings on ${date}`,
        entity: filmTitle,
        details: {
          cinema: cinemaName,
          cinemaSlug,
          date,
          count: group.length,
          times: group.map((s) => s.time),
        },
        url,
      });
    }
  }

  // Check for unreasonable times (2am-5am)
  for (const s of screenings) {
    const hourMatch = s.time.match(/^(\d{1,2}):/);
    if (hourMatch) {
      const hour = parseInt(hourMatch[1], 10);
      if (hour >= 2 && hour <= 5) {
        issues.push({
          severity: "warning",
          category: "unreasonable_time",
          message: `Unreasonable screening time ${s.time} for "${s.filmTitle}" at ${cinemaName} (likely timezone bug)`,
          entity: s.filmTitle,
          details: {
            cinema: cinemaName,
            cinemaSlug,
            time: s.time,
            date: s.date,
          },
          url,
        });
      }
    }
  }

  return issues;
}
