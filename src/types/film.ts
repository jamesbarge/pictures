/**
 * Film types and interfaces
 */

export type ReleaseStatus =
  | "theatrical"
  | "restoration"
  | "revival"
  | "preview";

/**
 * Content type classification for cinema listings
 * - film: Traditional movie (can be matched to TMDB)
 * - concert: Music performance, album screening
 * - live_broadcast: NT Live, Met Opera, ballet broadcasts
 * - event: Quiz nights, Q&As, special events
 */
export type ContentType = "film" | "concert" | "live_broadcast" | "event";

export interface CastMember {
  name: string;
  character?: string;
  order: number;
  tmdbId?: number;
}
