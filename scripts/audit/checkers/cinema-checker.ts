/**
 * Cinema Checker
 * Tests cinema directory and individual cinema pages for data quality.
 *
 * Checks:
 * - No duplicate cinemas in directory
 * - Each cinema has screenings
 * - Screening dates extend to end of March minimum
 * - Cinema detail pages load successfully
 */

import type { Page } from "playwright";
import type { AuditIssue, CinemaListEntry, CinemaDetailData } from "../types";

const BASE_URL = "https://pictures.london";

/**
 * Extract all cinemas from the /cinemas directory page.
 */
export async function extractCinemaList(page: Page): Promise<CinemaListEntry[]> {
  await page.goto(`${BASE_URL}/cinemas`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("h1", { timeout: 10000 });

  return page.evaluate(() => {
    const entries: Array<{
      name: string;
      slug: string;
      area?: string;
      screeningCount: number;
    }> = [];

    // Each cinema is a link card with h2 name and screening count
    const links = Array.from(document.querySelectorAll('a[href^="/cinemas/"]'));
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      // Skip breadcrumb/nav links — only match /cinemas/SLUG pattern
      if (href === "/cinemas" || !href.match(/^\/cinemas\/[a-z0-9-]+$/)) continue;

      const slug = href.replace("/cinemas/", "");
      const nameEl = link.querySelector("h2");
      const name = nameEl?.textContent?.trim() || slug;

      // Extract area from the MapPin-adjacent text
      const addressEl = link.querySelector("p.text-sm.text-text-secondary");
      const area = addressEl?.textContent?.trim().replace(/^\s*/, "") || undefined;

      // Screening count is in the font-mono span
      const countEl = link.querySelector(".font-mono");
      const screeningCount = parseInt(countEl?.textContent?.trim() || "0", 10);

      entries.push({ name, slug, area, screeningCount });
    }

    return entries;
  });
}

/**
 * Check the /cinemas directory for duplicates and missing data.
 */
export function checkCinemaDirectory(cinemas: CinemaListEntry[]): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Check for duplicate cinemas
  const seen = new Map<string, CinemaListEntry>();
  for (const cinema of cinemas) {
    const key = cinema.name.toLowerCase();
    if (seen.has(key)) {
      issues.push({
        severity: "critical",
        category: "duplicate_cinema",
        message: `Duplicate cinema: "${cinema.name}" appears twice in directory`,
        entity: cinema.name,
        details: { slug1: seen.get(key)!.slug, slug2: cinema.slug },
        url: `${BASE_URL}/cinemas`,
      });
    }
    seen.set(key, cinema);
  }

  // Check for cinemas with 0 screenings
  for (const cinema of cinemas) {
    if (cinema.screeningCount === 0) {
      issues.push({
        severity: "critical",
        category: "no_screenings",
        message: `Cinema "${cinema.name}" has 0 upcoming screenings`,
        entity: cinema.name,
        details: { slug: cinema.slug },
        url: `${BASE_URL}/cinemas/${cinema.slug}`,
      });
    }
  }

  return issues;
}

/**
 * Visit a single cinema detail page and extract data + find issues.
 */
export async function checkCinemaDetail(
  page: Page,
  cinema: CinemaListEntry
): Promise<{ data: CinemaDetailData; issues: AuditIssue[] }> {
  const issues: AuditIssue[] = [];
  const url = `${BASE_URL}/cinemas/${cinema.slug}`;

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });

    if (!response || response.status() >= 400) {
      issues.push({
        severity: "critical",
        category: "broken_page",
        message: `Cinema page returned ${response?.status() || "no response"}`,
        entity: cinema.name,
        details: { slug: cinema.slug, status: response?.status() },
        url,
      });
      return {
        data: {
          name: cinema.name,
          slug: cinema.slug,
          screeningCount: 0,
          screeningDates: [],
          bookingUrls: [],
        },
        issues,
      };
    }

    // Wait for content to render
    await page.waitForSelector("h1", { timeout: 10000 });

    // Extract screening data
    const detailData = await page.evaluate((cinemaSlug: string) => {
      const screeningCount = (() => {
        // Look for "X screenings" text in the What's On header
        const headerSpan = document.querySelector("h2 .font-mono");
        if (headerSpan) {
          const match = headerSpan.textContent?.match(/(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
        return 0;
      })();

      // Extract all screening dates
      const dates: string[] = [];
      const dateHeaders = Array.from(document.querySelectorAll("h3.text-lg"));
      for (const h of dateHeaders) {
        const text = h.textContent?.trim() || "";
        if (text) dates.push(text);
      }

      // Extract all booking URLs
      const bookingUrls: string[] = [];
      const bookingLinks = Array.from(document.querySelectorAll('a[target="_blank"][rel="noopener noreferrer"]'));
      for (const link of bookingLinks) {
        const href = link.getAttribute("href") || "";
        // Filter out non-booking links (website link, etc.)
        if (href && !href.includes(`/cinemas/${cinemaSlug}`) && !href.includes("pictures.london")) {
          bookingUrls.push(href);
        }
      }

      return { screeningCount, dates, bookingUrls };
    }, cinema.slug);

    // Determine latest screening date
    const latestDate = detailData.dates.length > 0
      ? detailData.dates[detailData.dates.length - 1]
      : undefined;

    const data: CinemaDetailData = {
      name: cinema.name,
      slug: cinema.slug,
      screeningCount: detailData.screeningCount,
      latestScreeningDate: latestDate,
      screeningDates: detailData.dates,
      bookingUrls: detailData.bookingUrls,
    };

    // Check if screenings extend to end of March (at least)
    // The page only shows first 50 screenings, so we check date coverage
    if (detailData.screeningCount > 0 && detailData.dates.length > 0) {
      // Parse the last date to see if it reaches end of March
      // Format is like "Saturday, 1 March" or "Monday, 31 March"
      const lastDateStr = detailData.dates[detailData.dates.length - 1];
      const marchPattern = /march/i;
      const aprilOrLater = /april|may|june|july/i;

      // If last visible date doesn't reach March, flag it
      // (Note: page limits to 50 screenings, so large cinemas may truncate)
      if (!marchPattern.test(lastDateStr) && !aprilOrLater.test(lastDateStr)) {
        // Only flag if total screenings are low (not truncated)
        if (detailData.screeningCount <= 50) {
          issues.push({
            severity: "warning",
            category: "screening_gap",
            message: `Cinema "${cinema.name}" screenings don't reach end of March (last visible: "${lastDateStr}")`,
            entity: cinema.name,
            details: {
              slug: cinema.slug,
              lastDate: lastDateStr,
              screeningCount: detailData.screeningCount,
            },
            url,
          });
        }
      }
    }

    return { data, issues };
  } catch (error) {
    issues.push({
      severity: "critical",
      category: "broken_page",
      message: `Cinema page failed to load: ${error instanceof Error ? error.message : "Unknown error"}`,
      entity: cinema.name,
      details: { slug: cinema.slug, error: String(error) },
      url,
    });
    return {
      data: {
        name: cinema.name,
        slug: cinema.slug,
        screeningCount: 0,
        screeningDates: [],
        bookingUrls: [],
      },
      issues,
    };
  }
}
