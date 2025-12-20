/**
 * ICA Cinema Scraper
 * Scrapes film listings from ica.art
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseScreeningDate, parseScreeningTime, combineDateAndTime } from "../utils/date-parser";
import type { CheerioAPI, CheerioSelection } from "../utils/cheerio-types";

interface FilmInfo {
  title: string;
  url: string;
  director?: string;
  year?: number;
  runtime?: number;
  country?: string;
}

export class ICAScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "ica",
    baseUrl: "https://www.ica.art",
    requestsPerMinute: 6,
    delayBetweenRequests: 3000,
  };

  protected async fetchPages(): Promise<string[]> {
    // First, get the main films page to find all film URLs
    const mainUrl = `${this.config.baseUrl}/films`;
    console.log(`[${this.config.cinemaId}] Fetching film listing: ${mainUrl}`);

    const mainHtml = await this.fetchUrl(mainUrl);
    const $ = this.parseHtml(mainHtml);

    // Extract film URLs from the listing page
    const filmUrls: string[] = [];
    $(".item.films > a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("/films/") && !this.isExcludedUrl(href)) {
        filmUrls.push(`${this.config.baseUrl}${href}`);
      }
    });

    console.log(`[${this.config.cinemaId}] Found ${filmUrls.length} film pages to scrape`);

    // Fetch each film's detail page with rate limiting
    const pages: string[] = [];
    for (const url of filmUrls.slice(0, 50)) { // Limit to 50 films for now
      try {
        console.log(`[${this.config.cinemaId}] Fetching: ${url}`);
        const html = await this.fetchUrl(url);
        pages.push(html);
        await this.delay(this.config.delayBetweenRequests);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to fetch ${url}:`, error);
      }
    }

    return pages;
  }

  private isExcludedUrl(href: string): boolean {
    // Exclude category/season pages that don't have screenings
    const excludes = [
      "/films/distribution",
      "/films/about",
      "/films/2024",
      "/films/2023",
      "/films/2022",
      "/films/2021",
      "/films/2020",
      "/films/2019",
      "/films/2018",
      "/films/today",
      "/films/tomorrow",
      "/films/next-7-days",
    ];
    return excludes.some((ex) => href === ex || href.startsWith(ex + "/"));
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];

    for (const html of htmlPages) {
      try {
        const $ = this.parseHtml(html);
        const filmInfo = this.extractFilmInfo($);

        if (!filmInfo.title) continue;

        const filmScreenings = this.parseFilmScreenings($, filmInfo);
        screenings.push(...filmScreenings);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Error parsing film page:`, error);
      }
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
    return screenings;
  }

  private extractFilmInfo($: CheerioAPI): FilmInfo {
    // Get title from the page title or span.title
    let title = $("span.title").first().text().trim();
    if (!title) {
      // Fallback to page title
      const pageTitle = $("title").text();
      title = pageTitle.replace(/^ICA \| /, "").trim();
    }

    // Parse metadata from #colophon
    // Format: "<i>Title</i>, dir Director Name, Country Year, Runtime mins."
    const colophon = $("#colophon").text().trim();
    const info: FilmInfo = { title, url: "" };

    if (colophon) {
      // Extract director: "dir Name"
      const dirMatch = colophon.match(/dir\.?\s+([^,]+)/i);
      if (dirMatch) {
        info.director = dirMatch[1].trim();
      }

      // Extract year (4-digit number)
      const yearMatch = colophon.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) {
        info.year = parseInt(yearMatch[1], 10);
      }

      // Extract runtime: "XX mins"
      const runtimeMatch = colophon.match(/(\d+)\s*mins?\.?/i);
      if (runtimeMatch) {
        info.runtime = parseInt(runtimeMatch[1], 10);
      }

      // Extract country (common patterns)
      const countryMatch = colophon.match(/,\s*(USA|UK|France|Germany|Japan|Italy|Spain|Portugal|Belgium|Austria|Morocco|Lebanon|Mexico|Bulgaria)\b/i);
      if (countryMatch) {
        info.country = countryMatch[1];
      }
    }

    return info;
  }

  private parseFilmScreenings($: CheerioAPI, filmInfo: FilmInfo): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Get booking URL base
    let bookingBase = "";
    const bookLink = $("[onclick*='/book/']").first().attr("onclick");
    if (bookLink) {
      const bookMatch = bookLink.match(/\/book\/(\d+)/);
      if (bookMatch) {
        bookingBase = `${this.config.baseUrl}/book/${bookMatch[1]}`;
      }
    }

    // Parse each performance in the list
    $(".performance-list .performance").each((_, el) => {
      const $perf = $(el);

      // Get time (format: "04:15 pm")
      const timeText = $perf.find(".time").text().trim();
      const time = parseScreeningTime(timeText);

      // Get date (format: "Fri, 19 Dec 2025")
      const dateText = $perf.find(".date").text().trim();
      const date = parseScreeningDate(dateText);

      // Get venue/screen
      const venue = $perf.find(".venue").text().trim();

      if (time && date) {
        const datetime = combineDateAndTime(date, time);

        // Skip past screenings
        if (datetime < new Date()) return;

        screenings.push({
          filmTitle: filmInfo.title,
          datetime,
          bookingUrl: bookingBase || filmInfo.url,
          screen: venue || undefined,
          sourceId: `ica-${filmInfo.title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
        });
      }
    });

    if (screenings.length > 0) {
      console.log(`[${this.config.cinemaId}] ${filmInfo.title}: ${screenings.length} screenings`);
    }

    return screenings;
  }
}

export function createICAScraper(): ICAScraper {
  return new ICAScraper();
}
