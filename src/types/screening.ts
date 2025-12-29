/**
 * Screening types and interfaces
 */

export type ScreeningFormat =
  | "35mm"
  | "70mm"
  | "70mm_imax"
  | "dcp"
  | "dcp_4k"
  | "imax"
  | "imax_laser"
  | "dolby_cinema"
  | "4dx"
  | "screenx"
  | "unknown";

export type EventType =
  | "q_and_a"
  | "intro"
  | "discussion"
  | "double_bill"
  | "marathon"
  | "singalong"
  | "quote_along"
  | "preview"
  | "premiere"
  | "restoration_premiere"
  | "anniversary"
  | "members_only"
  | "relaxed";

export type AvailabilityStatus =
  | "available"
  | "low"
  | "sold_out"
  | "returns"
  | "unknown";

export interface Screening {
  id: string;
  filmId: string;
  cinemaId: string;
  datetime: Date;
  screen: string | null;
  format: ScreeningFormat | null;
  is3D: boolean;
  isSpecialEvent: boolean;
  eventType: EventType | null;
  eventDescription: string | null;
  season: string | null;
  bookingUrl: string;
  isSoldOut: boolean;
  hasSubtitles: boolean;
  subtitleLanguage: string | null;
  hasAudioDescription: boolean;
  isRelaxedScreening: boolean;
  sourceId: string | null;
  scrapedAt: Date;
  updatedAt: Date;
  // Festival fields
  isFestivalScreening: boolean;
  availabilityStatus: AvailabilityStatus | null;
  availabilityCheckedAt: Date | null;
}

/**
 * Screening with joined film and cinema data for display
 */
export interface ScreeningWithDetails extends Screening {
  film: {
    id: string;
    title: string;
    year: number | null;
    directors: string[];
    runtime: number | null;
    posterUrl: string | null;
    isRepertory: boolean;
    genres: string[];
  };
  cinema: {
    id: string;
    name: string;
    shortName: string | null;
  };
}

/**
 * Raw screening data from scraper before enrichment
 */
export interface RawScreening {
  filmTitle: string;
  datetime: Date;
  screen?: string;
  format?: string;
  bookingUrl: string;
  eventType?: string;
  eventDescription?: string;
  sourceId?: string;
}
