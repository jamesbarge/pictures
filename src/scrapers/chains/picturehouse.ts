/**
 * Picturehouse Cinemas Scraper
 * Uses Picturehouse API for showtime data
 *
 * API: POST https://www.picturehouses.com/api/scheduled-movies-ajax
 * Params: cinema_id
 *
 * To add a new Picturehouse venue:
 * 1. Add venue config to PICTUREHOUSE_VENUES array below
 * 2. Find the cinema_id from network requests on their website
 */

import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";

// ============================================================================
// Picturehouse Venue Configurations
// Add new venues here
// ============================================================================

export const PICTUREHOUSE_VENUES: VenueConfig[] = [
  {
    id: "picturehouse-central",
    name: "Picturehouse Central",
    shortName: "PH Central",
    slug: "picturehouse-central",
    area: "West End",
    postcode: "W1D 7DH",
    address: "Corner of Great Windmill Street & Shaftesbury Avenue",
    chainVenueId: "022", // Verified from website
    features: ["bar", "restaurant", "cafe", "members_bar"],
    active: true,
  },
  {
    id: "picturehouse-east-dulwich",
    name: "East Dulwich Picturehouse",
    shortName: "East Dulwich",
    slug: "east-dulwich",
    area: "East Dulwich",
    postcode: "SE22 8EW",
    address: "Lordship Lane",
    chainVenueId: "009", // Verified from website
    features: ["bar", "cafe"],
    active: true,
  },
  {
    id: "picturehouse-hackney",
    name: "Hackney Picturehouse",
    shortName: "Hackney PH",
    slug: "hackney-picturehouse",
    area: "Hackney",
    postcode: "E8 1EJ",
    address: "270 Mare Street",
    chainVenueId: "010", // Verified from website
    features: ["bar", "cafe"],
    active: true,
  },
  {
    id: "ritzy-brixton",
    name: "The Ritzy",
    shortName: "Ritzy",
    slug: "the-ritzy",
    area: "Brixton",
    postcode: "SW2 1JG",
    address: "Brixton Oval, Coldharbour Lane",
    chainVenueId: "004", // Verified from website
    features: ["bar", "cafe", "historic"],
    active: true,
  },
  {
    id: "gate-notting-hill",
    name: "The Gate",
    shortName: "The Gate",
    slug: "the-gate",
    area: "Notting Hill",
    postcode: "W11 3JE",
    address: "87 Notting Hill Gate",
    chainVenueId: "016", // Verified from website
    features: ["historic", "single_screen"],
    active: true,
  },
  {
    id: "picturehouse-greenwich",
    name: "Greenwich Picturehouse",
    shortName: "Greenwich PH",
    slug: "greenwich-picturehouse",
    area: "Greenwich",
    postcode: "SE10 9HB",
    address: "180 Greenwich High Road",
    chainVenueId: "021", // Verified from website
    features: ["bar"],
    active: true,
  },
  {
    id: "picturehouse-clapham",
    name: "Clapham Picturehouse",
    shortName: "Clapham PH",
    slug: "clapham-picturehouse",
    area: "Clapham",
    postcode: "SW4 7UL",
    address: "76 Venn Street",
    chainVenueId: "020", // Verified from website
    features: ["bar"],
    active: true,
  },
  {
    id: "picturehouse-crouch-end",
    name: "Crouch End Picturehouse",
    shortName: "Crouch End",
    slug: "crouch-end-picturehouse",
    area: "Crouch End",
    postcode: "N8 8HP",
    address: "165 Tottenham Lane",
    chainVenueId: "024", // Verified from website
    features: ["bar"],
    active: true,
  },
  {
    id: "picturehouse-finsbury-park",
    name: "Finsbury Park Picturehouse",
    shortName: "Finsbury Park",
    slug: "finsbury-park",
    area: "Finsbury Park",
    postcode: "N4 3FP",
    address: "Unit B, Finsbury Park Station",
    chainVenueId: "029", // Verified from website
    features: ["bar"],
    active: true,
  },
  {
    id: "picturehouse-west-norwood",
    name: "West Norwood Picturehouse",
    shortName: "West Norwood",
    slug: "west-norwood-picturehouse",
    area: "West Norwood",
    postcode: "SE27 9NX",
    address: "The Old Library, 14-16 Knight's Hill",
    chainVenueId: "023", // Verified from website
    features: ["bar", "library_building"],
    active: true,
  },
  {
    id: "picturehouse-ealing",
    name: "Ealing Picturehouse",
    shortName: "Ealing PH",
    slug: "ealing-picturehouse",
    area: "Ealing",
    postcode: "W5 2PA",
    address: "The Ealing Cinema, Ealing Green",
    chainVenueId: "031", // Verified from website
    features: ["bar"],
    active: true,
  },
];

// ============================================================================
// Chain Configuration
// ============================================================================

export const PICTUREHOUSE_CONFIG: ChainConfig = {
  chainId: "picturehouse",
  chainName: "Picturehouse",
  baseUrl: "https://www.picturehouses.com",
  apiUrl: "https://www.picturehouses.com/api/scheduled-movies-ajax",
  venues: PICTUREHOUSE_VENUES,
  requestsPerMinute: 20,
  delayBetweenRequests: 1500,
};

// ============================================================================
// Picturehouse API Types (matched to actual API response)
// ============================================================================

interface PicturehouseShowTime {
  CinemaId: string;
  ScheduledFilmId: string;
  Showtime: string; // ISO format: "2025-12-21T18:30:00"
  SessionId: string;
  ScreenName: string;
  SessionAttributesNames: string[]; // ["2D", "Audio D"]
  SoldoutStatus: number; // 0 = available, 1 = sold out
  date_f: string; // "2025-12-21"
  time: string; // "18:30"
  attributes?: Array<{
    attribute: string;
    attribute_full: string;
    description: string;
  }>;
}

interface PicturehouseMovie {
  ID: string; // "022-HO00017386"
  ScheduledFilmId: string;
  Title: string;
  CinemaId: string;
  TrailerUrl?: string;
  image_url?: string;
  show_times: PicturehouseShowTime[];
}

interface PicturehouseApiResponse {
  response: string; // "success"
  movies: PicturehouseMovie[];
}

// ============================================================================
// Picturehouse Scraper Implementation
// ============================================================================

export class PicturehouseScraper implements ChainScraper {
  chainConfig = PICTUREHOUSE_CONFIG;

  /**
   * Fetch showtimes from Picturehouse API for a specific venue
   */
  private async fetchVenueShowtimes(venue: VenueConfig): Promise<PicturehouseApiResponse | null> {
    const formData = new FormData();
    formData.append("cinema_id", venue.chainVenueId || "");

    try {
      const response = await fetch(this.chainConfig.apiUrl!, {
        method: "POST",
        body: formData,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        console.error(`[picturehouse] API error for ${venue.name}: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`[picturehouse] Failed to fetch ${venue.name}:`, error);
      return null;
    }
  }

  /**
   * Parse API response into RawScreenings
   */
  private parseShowtimes(data: PicturehouseApiResponse, venue: VenueConfig): RawScreening[] {
    const screenings: RawScreening[] = [];

    if (data.response !== "success" || !data.movies) {
      return screenings;
    }

    for (const movie of data.movies) {
      for (const showTime of movie.show_times) {
        // Parse datetime from ISO format Showtime field
        const datetime = new Date(showTime.Showtime);
        if (isNaN(datetime.getTime())) continue;

        // Skip sold out screenings (optional - might want to show them)
        // if (showTime.SoldoutStatus === 1) continue;

        // Detect format from SessionAttributesNames
        let format: string | undefined;
        const attrs = showTime.SessionAttributesNames || [];
        if (attrs.some(a => /imax/i.test(a))) format = "imax";
        else if (attrs.some(a => /70mm/i.test(a))) format = "70mm";
        else if (attrs.some(a => /35mm/i.test(a))) format = "35mm";
        else if (attrs.some(a => /4k|dcp/i.test(a))) format = "dcp_4k";
        else if (attrs.some(a => /3d/i.test(a))) format = "3d";

        // Detect event type
        let eventType: string | undefined;
        let eventDescription: string | undefined;
        if (attrs.some(a => /q\s*&?\s*a/i.test(a))) eventType = "q_and_a";
        else if (attrs.some(a => /preview/i.test(a))) eventType = "preview";
        else if (attrs.some(a => /premiere/i.test(a))) eventType = "premiere";
        else if (attrs.some(a => /big\s*scream/i.test(a))) {
          eventType = "special_event";
          eventDescription = "Big Scream - babies welcome";
        } else if (attrs.some(a => /kids/i.test(a))) {
          eventType = "special_event";
          eventDescription = "Kids' Club";
        } else if (attrs.some(a => /silver\s*screen/i.test(a))) {
          eventType = "special_event";
          eventDescription = "Silver Screen - over 60s";
        }

        // Build booking URL
        // Format: https://www.picturehouses.com/movie-details/{cinema-id}/{film-id}/{film-slug}
        const filmSlug = movie.Title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const bookingUrl = `${this.chainConfig.baseUrl}/movie-details/${venue.chainVenueId}/${movie.ScheduledFilmId}/${filmSlug}`;

        screenings.push({
          filmTitle: movie.Title,
          datetime,
          screen: showTime.ScreenName,
          format,
          bookingUrl,
          eventType,
          eventDescription,
          sourceId: `picturehouse-${venue.id}-${showTime.SessionId}`,
          // Availability status from API: 0 = available, 1 = sold out
          availabilityStatus: showTime.SoldoutStatus === 1 ? "sold_out" : "available",
        });
      }
    }

    return screenings;
  }

  /**
   * Scrape all active venues
   */
  async scrapeAll(): Promise<Map<string, RawScreening[]>> {
    const activeVenues = this.chainConfig.venues.filter(v => v.active !== false);
    return this.scrapeVenues(activeVenues.map(v => v.id));
  }

  /**
   * Scrape specific venues by ID
   */
  async scrapeVenues(venueIds: string[]): Promise<Map<string, RawScreening[]>> {
    const results = new Map<string, RawScreening[]>();

    for (const venueId of venueIds) {
      const venue = this.chainConfig.venues.find(v => v.id === venueId);
      if (!venue) {
        console.warn(`[picturehouse] Unknown venue: ${venueId}`);
        continue;
      }

      console.log(`[picturehouse] Scraping ${venue.name}...`);
      const screenings = await this.scrapeVenue(venueId);
      results.set(venueId, screenings);

      // Rate limiting
      await new Promise(r => setTimeout(r, this.chainConfig.delayBetweenRequests));
    }

    return results;
  }

  /**
   * Scrape single venue
   */
  async scrapeVenue(venueId: string): Promise<RawScreening[]> {
    const venue = this.chainConfig.venues.find(v => v.id === venueId);
    if (!venue) {
      console.error(`[picturehouse] Venue not found: ${venueId}`);
      return [];
    }

    const data = await this.fetchVenueShowtimes(venue);
    if (!data) return [];

    const screenings = this.parseShowtimes(data, venue);
    console.log(`[picturehouse] ${venue.name}: ${screenings.length} screenings`);

    return screenings;
  }

  /**
   * Health check - verify API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testVenue = this.chainConfig.venues[0];
      const response = await fetch(this.chainConfig.apiUrl!, {
        method: "POST",
        body: new URLSearchParams({ cinema_id: testVenue.chainVenueId || "" }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createPicturehouseScraper(): PicturehouseScraper {
  return new PicturehouseScraper();
}

// Get active venues
export function getActivePicturehouseVenues(): VenueConfig[] {
  return PICTUREHOUSE_VENUES.filter(v => v.active !== false);
}

// Get all London venues
export function getLondonPicturehouseVenues(): VenueConfig[] {
  return PICTUREHOUSE_VENUES; // All are in London
}
