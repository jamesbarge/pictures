/**
 * Lexi Cinema Scraper (v2 - extends BaseScraper)
 *
 * Social enterprise cinema - profits go to charity
 * Website: https://thelexicinema.co.uk
 *
 * Uses Savoy Systems platform which embeds a complete JSON data structure
 * in the homepage: var Events = {"Events": [...]}
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

// Re-export config and venue for compatibility
export { LEXI_CONFIG, LEXI_VENUE } from "./lexi";

// Types for the embedded JSON structure
interface LexiPerformance {
  ID: number;
  StartDate: string;
  StartTime: string;
  StartTimeAndNotes: string;
  ReadableDate: string;
  URL: string;
  IsSoldOut: string;
  IsOpenForSale: boolean;
  AuditoriumName: string;
  Notes: string;
}

interface LexiEvent {
  ID: number;
  Title: string;
  URL: string;
  Type: number;
  TypeDescription: string;
  RunningTime: number;
  Performances: LexiPerformance[];
}

interface LexiEventsData {
  Events: LexiEvent[];
}

export class LexiScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "lexi",
    baseUrl: "https://thelexicinema.co.uk",
    requestsPerMinute: 10,
    delayBetweenRequests: 500,
  };

  protected async fetchPages(): Promise<string[]> {
    const url = `${this.config.baseUrl}/TheLexiCinema.dll/Home`;
    console.log(`[lexi] Fetching homepage: ${url}`);
    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const html = htmlPages[0];
    const eventsData = this.extractEventsJson(html);

    if (!eventsData) {
      throw new Error("Could not find Events JSON in page");
    }

    console.log(`[lexi] Found ${eventsData.Events.length} events in JSON`);

    const films = eventsData.Events.filter((e) => e.TypeDescription === "Film");
    console.log(`[lexi] Found ${films.length} films`);

    return this.extractScreenings(films);
  }

  private extractEventsJson(html: string): LexiEventsData | null {
    const match = html.match(/var Events\s*=\s*(\{[\s\S]*?\});/);
    if (!match) {
      console.error("[lexi] Could not find Events JSON in page");
      return null;
    }

    try {
      const jsonStr = match[1];
      return JSON.parse(jsonStr) as LexiEventsData;
    } catch (error) {
      console.error("[lexi] Failed to parse Events JSON:", error);
      return null;
    }
  }

  private extractScreenings(films: LexiEvent[]): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    for (const film of films) {
      if (!film.Performances || film.Performances.length === 0) continue;

      const cleanedTitle = this.cleanTitle(film.Title);

      for (const perf of film.Performances) {
        if (perf.IsSoldOut === "Y") continue;
        if (!perf.IsOpenForSale) continue;

        const datetime = this.parseDateTime(perf.StartDate, perf.StartTime);
        if (!datetime) continue;
        if (datetime < now) continue;

        const bookingUrl = perf.URL.startsWith("http")
          ? perf.URL
          : `${this.config.baseUrl}/TheLexiCinema.dll/${perf.URL}`;

        screenings.push({
          filmTitle: cleanedTitle,
          datetime,
          bookingUrl,
          sourceId: `lexi-${film.ID}-${perf.ID}`,
        });
      }
    }

    return screenings;
  }

  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    if (!dateStr || !timeStr) return null;

    const dateParts = dateStr.split("-");
    if (dateParts.length !== 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);

    let hours: number;
    let minutes: number;

    if (timeStr.length === 4) {
      hours = parseInt(timeStr.substring(0, 2), 10);
      minutes = parseInt(timeStr.substring(2, 4), 10);
    } else if (timeStr.length === 3) {
      hours = parseInt(timeStr.substring(0, 1), 10);
      minutes = parseInt(timeStr.substring(1, 3), 10);
    } else {
      return null;
    }

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return null;
    }

    return new Date(year, month, day, hours, minutes, 0);
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\(\d{4}\)\s*$/, "")
      .replace(/\s*\((?:U|PG|12A?|15|18|TBC)\)\s*/gi, "")
      .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion).*$/i, "")
      .trim();
  }

  protected validate(screenings: RawScreening[]): RawScreening[] {
    const baseValidated = super.validate(screenings);
    const seen = new Set<string>();

    return baseValidated.filter((s) => {
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);
      return true;
    });
  }
}

export function createLexiScraperV2(): LexiScraperV2 {
  return new LexiScraperV2();
}
