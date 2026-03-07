/**
 * ArtHouse Crouch End Scraper
 * Scrapes film listings from the Savoy Systems booking page
 *
 * Cinema: ArtHouse Crouch End
 * Address: 159A Tottenham Lane, London N8 9BT
 * Website: https://www.arthousecrouchend.co.uk
 * Booking: https://arthousecrouchend.savoysystems.co.uk/ArtHouseCrouchEnd.dll/
 *
 * HTML Structure:
 * - Each film is in a <div class="programme"> container
 * - Film title: <h1 class="title"><a href="...TcsProgramme_...">Title</a></h1>
 * - Showtimes in <div class="showtimes"> containing table rows:
 *   - <td class="PeformanceListDate">Tuesday 30 Dec 2025</td>
 *   - <td class="PeformanceListTimes"> with <a href="...TcsPerformance_...">11:45am</a>
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseScreeningDate, combineDateAndTime } from "../utils/date-parser";
import type { CheerioAPI } from "../utils/cheerio-types";

export class ArtHouseCrouchEndScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "arthouse-crouch-end",
    baseUrl: "https://arthousecrouchend.savoysystems.co.uk",
    requestsPerMinute: 6,
    delayBetweenRequests: 2000,
  };

  protected async fetchPages(): Promise<string[]> {
    const url = this.config.baseUrl + "/ArtHouseCrouchEnd.dll/";
    console.log("[" + this.config.cinemaId + "] Fetching listings: " + url);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];

    for (const html of htmlPages) {
      try {
        const $ = this.parseHtml(html);
        const performances = this.extractPerformances($);
        screenings.push(...performances);
      } catch (error) {
        console.error("[" + this.config.cinemaId + "] Error parsing page:", error);
      }
    }

    console.log(
      "[" + this.config.cinemaId + "] Found " + screenings.length + " screenings total"
    );
    return screenings;
  }

  private extractPerformances($: CheerioAPI): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    // Find all programme containers (each contains one film)
    const programmes = $("div.programme");
    console.log("[" + this.config.cinemaId + "] Found " + programmes.length + " films");

    programmes.each((_, prog) => {
      const $prog = $(prog);

      // Get film title from the TcsProgramme link
      const titleLink = $prog.find('a[href*="TcsProgramme_"]').first();
      const rawTitle = titleLink.text().trim();
      if (!rawTitle) return;

      const filmTitle = this.cleanTitle(rawTitle);

      // Find all date cells in the showtimes section
      const dateCells = $prog.find("td.PeformanceListDate");

      dateCells.each((_, dateCell) => {
        const dateText = $(dateCell).text().trim();
        const parsedDate = parseScreeningDate(dateText);

        if (!parsedDate) {
          console.warn("[" + this.config.cinemaId + "] Could not parse date: " + dateText);
          return;
        }

        // Find performance links in the sibling td.PeformanceListTimes
        const timeCell = $(dateCell).siblings("td.PeformanceListTimes");
        const perfLinks = timeCell.find('a[href*="TcsPerformance"]');

        perfLinks.each((_, perfLink) => {
          const $perf = $(perfLink);
          const timeText = $perf.text().trim(); // e.g., "11:45am", "2:30pm"
          const bookingUrl = $perf.attr("href") || "";

          // Parse the time (format: "11:45am" or "2:30pm")
          const datetime = this.parseTimeWithAmPm(parsedDate, timeText);

          if (!datetime) {
            console.warn("[" + this.config.cinemaId + "] Could not parse time: " + timeText);
            return;
          }

          // Skip past screenings
          if (datetime < now) return;

          // Check for "(Closed for Booking)" status in parent span
          const parentText = $perf.parent().text().toLowerCase();
          if (parentText.includes("closed for booking")) return;

          screenings.push({
            filmTitle,
            datetime,
            bookingUrl: bookingUrl || this.config.baseUrl + "/ArthouseCrouchEnd.dll/",
            sourceId: "arthouse-" + filmTitle.toLowerCase().replace(/\s+/g, "-") + "-" + datetime.toISOString(),
          });
        });
      });
    });

    return screenings;
  }

  /**
   * Parse time in format "11:45am" or "2:30pm" and combine with date
   */
  private parseTimeWithAmPm(date: Date, timeStr: string): Date | null {
    // Match "11:45am", "2:30pm", etc.
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toLowerCase();

    // Convert to 24-hour format
    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    return combineDateAndTime(date, { hours, minutes });
  }

  private cleanTitle(title: string): string {
    // Remove certificate ratings like (15), (12A), (PG), (U), (18), (TBC)
    return title
      .replace(/\s*\((?:U|PG|12A?|15|18|TBC)\)\s*/gi, "")
      .replace(/\s*Cert\.?\s*(?:U|PG|12A?|15|18|TBC)\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export function createArtHouseCrouchEndScraper(): ArtHouseCrouchEndScraper {
  return new ArtHouseCrouchEndScraper();
}
