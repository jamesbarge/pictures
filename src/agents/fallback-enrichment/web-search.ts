/**
 * Web Search + AI Extraction for Fallback Enrichment
 *
 * Uses Claude Haiku to search the web for film data and extract
 * structured metadata when TMDB matching fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CastMember } from "@/types/film";

export interface FilmSearchInput {
  title: string;
  year: number | null;
  cinemaName?: string;
  bookingUrl?: string;
}

export interface ExtractedFilmData {
  title: string;
  originalTitle?: string;
  year: number | null;
  directors: string[];
  cast: CastMember[];
  genres: string[];
  runtime: number | null;
  certification: string | null;
  synopsis: string | null;
  posterUrl: string | null;
  imdbId: string | null;
  letterboxdUrl: string | null;
  letterboxdRating: number | null;
  countries: string[];
  languages: string[];
  /** Number of independent sources that provided data */
  sourceCount: number;
  /** Raw search context for debugging */
  searchContext?: string;
}

const EXTRACTION_PROMPT = `You are a film data extraction assistant. Given a film title (and optionally year/cinema), search your knowledge to provide structured metadata about this film.

Return a JSON object with these fields. Use null for unknown values - DO NOT guess or make up data:

{
  "title": "Canonical English title",
  "originalTitle": "Original language title if different, or null",
  "year": 2024,
  "directors": ["Director Name"],
  "cast": [{"name": "Actor Name", "character": "Character Name"}],
  "genres": ["Drama", "Thriller"],
  "runtime": 120,
  "certification": "15",
  "synopsis": "Brief 1-2 sentence synopsis",
  "posterUrl": null,
  "imdbId": "tt1234567",
  "letterboxdUrl": "https://letterboxd.com/film/film-slug/",
  "letterboxdRating": 3.8,
  "countries": ["GB", "US"],
  "languages": ["en"],
  "sourceCount": 2,
  "confidence_notes": "Brief explanation of confidence level"
}

Rules:
- For "certification", use UK BBFC ratings: U, PG, 12A, 12, 15, 18
- For "imdbId", use the tt-prefixed IMDb ID (e.g., "tt1234567")
- For "letterboxdUrl", use the canonical Letterboxd URL format
- For "letterboxdRating", use the 0-5 scale (e.g., 3.8)
- For "countries" and "languages", use ISO codes
- For "cast", include up to 5 main cast members
- For "genres", use standard genres: Drama, Comedy, Thriller, Horror, Action, Sci-Fi, Romance, Documentary, Animation, etc.
- "sourceCount" = how many independent sources you can confirm data from (Wikipedia, IMDB, Letterboxd, review sites)
- If this is a well-known film, you should know most fields
- If this is an obscure film, provide what you can and set sourceCount accordingly
- For very obscure films or non-film events, return minimal data with sourceCount: 0

IMPORTANT: Return ONLY valid JSON, no markdown formatting or extra text.`;

/**
 * Search for film data using Claude Haiku
 * Returns extracted structured data or null if film not found
 */
export async function searchAndExtractFilmData(
  input: FilmSearchInput,
  anthropicClient?: Anthropic
): Promise<{ data: ExtractedFilmData | null; tokensUsed: number }> {
  const client = anthropicClient || new Anthropic();

  const searchQuery = buildSearchQuery(input);

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1500,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: searchQuery,
        },
      ],
    });

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { data: null, tokensUsed };
    }

    const responseText = textBlock.text.trim();

    // Parse JSON from response
    const parsed = parseJsonResponse(responseText);
    if (!parsed) {
      return { data: null, tokensUsed };
    }

    // Validate and clean the extracted data
    const data = validateExtractedData(parsed, input);

    return { data, tokensUsed };
  } catch (error) {
    console.error(`  Failed to search for "${input.title}":`, error);
    return { data: null, tokensUsed: 0 };
  }
}

/**
 * Build the search query for the AI
 */
function buildSearchQuery(input: FilmSearchInput): string {
  let query = `Film: "${input.title}"`;

  if (input.year) {
    query += ` (${input.year})`;
  }

  if (input.cinemaName) {
    query += `\nScreening at: ${input.cinemaName}`;
  }

  if (input.bookingUrl) {
    query += `\nBooking page: ${input.bookingUrl}`;
  }

  query +=
    "\n\nProvide structured metadata for this film. If you're uncertain about the film, say so in confidence_notes.";

  return query;
}

/**
 * Parse JSON from AI response, handling common formatting issues
 */
function parseJsonResponse(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try extracting first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Validate and clean extracted data
 */
function validateExtractedData(
  raw: Record<string, unknown>,
  input: FilmSearchInput
): ExtractedFilmData | null {
  // Title is required
  const title =
    typeof raw.title === "string" && raw.title.length > 0
      ? raw.title
      : input.title;

  // Year validation
  let year: number | null = null;
  if (typeof raw.year === "number" && raw.year >= 1888 && raw.year <= 2030) {
    year = raw.year;
  }

  // Directors
  const directors: string[] = [];
  if (Array.isArray(raw.directors)) {
    for (const d of raw.directors) {
      if (typeof d === "string" && d.length > 0) {
        directors.push(d);
      }
    }
  }

  // Cast
  const cast: CastMember[] = [];
  if (Array.isArray(raw.cast)) {
    for (const c of raw.cast) {
      if (
        c &&
        typeof c === "object" &&
        "name" in c &&
        typeof (c as { name: unknown }).name === "string"
      ) {
        cast.push({
          name: (c as { name: string }).name,
          character:
            "character" in c && typeof (c as { character: unknown }).character === "string"
              ? (c as { character: string }).character
              : undefined,
          order: cast.length,
        });
      }
    }
  }

  // Genres
  const genres: string[] = [];
  if (Array.isArray(raw.genres)) {
    for (const g of raw.genres) {
      if (typeof g === "string" && g.length > 0) {
        genres.push(g);
      }
    }
  }

  // Runtime
  let runtime: number | null = null;
  if (typeof raw.runtime === "number" && raw.runtime > 0 && raw.runtime < 1000) {
    runtime = raw.runtime;
  }

  // Certification
  const certification =
    typeof raw.certification === "string" ? raw.certification : null;

  // Synopsis
  let synopsis: string | null = null;
  if (typeof raw.synopsis === "string" && raw.synopsis.length > 10) {
    synopsis = raw.synopsis;
  }

  // Poster URL
  let posterUrl: string | null = null;
  if (typeof raw.posterUrl === "string") {
    try {
      const url = new URL(raw.posterUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        posterUrl = raw.posterUrl;
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  // IMDB ID
  let imdbId: string | null = null;
  if (typeof raw.imdbId === "string" && /^tt\d{7,}$/.test(raw.imdbId)) {
    imdbId = raw.imdbId;
  }

  // Letterboxd URL
  let letterboxdUrl: string | null = null;
  if (
    typeof raw.letterboxdUrl === "string" &&
    raw.letterboxdUrl.includes("letterboxd.com/film/")
  ) {
    letterboxdUrl = raw.letterboxdUrl;
  }

  // Letterboxd rating
  let letterboxdRating: number | null = null;
  if (
    typeof raw.letterboxdRating === "number" &&
    raw.letterboxdRating >= 0 &&
    raw.letterboxdRating <= 5
  ) {
    letterboxdRating = raw.letterboxdRating;
  }

  // Countries
  const countries: string[] = [];
  if (Array.isArray(raw.countries)) {
    for (const c of raw.countries) {
      if (typeof c === "string" && c.length >= 2 && c.length <= 3) {
        countries.push(c.toUpperCase());
      }
    }
  }

  // Languages
  const languages: string[] = [];
  if (Array.isArray(raw.languages)) {
    for (const l of raw.languages) {
      if (typeof l === "string" && l.length >= 2 && l.length <= 3) {
        languages.push(l.toLowerCase());
      }
    }
  }

  // Source count
  const sourceCount =
    typeof raw.sourceCount === "number"
      ? Math.max(0, Math.min(10, raw.sourceCount))
      : 0;

  // If sourceCount is 0 and we have very little data, this film wasn't found
  if (sourceCount === 0 && !synopsis && directors.length === 0 && !imdbId) {
    return null;
  }

  return {
    title,
    originalTitle:
      typeof raw.originalTitle === "string" ? raw.originalTitle : undefined,
    year,
    directors,
    cast,
    genres,
    runtime,
    certification,
    synopsis,
    posterUrl,
    imdbId,
    letterboxdUrl,
    letterboxdRating,
    countries,
    languages,
    sourceCount,
  };
}
