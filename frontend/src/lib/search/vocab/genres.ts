/**
 * Genre token dictionary.
 *
 * Canonical values include the values in `GENRE_OPTIONS` from
 * `$lib/constants/filters.ts` plus the long-tail genres present
 * in the films table (countries/genres arrays are populated from
 * TMDB which uses lowercase forms like "science fiction", "noir").
 *
 * Maps user-typed tokens (lowercase, including common abbreviations
 * and synonyms) to the canonical genre string used in filters.genres
 * and in films.genres[] for exact-array-membership filtering.
 */

export const GENRE_TOKENS: Record<string, string> = {
  // From GENRE_OPTIONS
  drama: "drama",
  comedy: "comedy",
  horror: "horror",
  documentary: "documentary",
  doc: "documentary",
  docs: "documentary",
  "sci-fi": "science fiction",
  scifi: "science fiction",
  action: "action",
  thriller: "thriller",
  romance: "romance",
  animation: "animation",
  // Long tail (TMDB genre vocabulary)
  noir: "noir",
  anime: "animation",
  fantasy: "fantasy",
  mystery: "mystery",
  war: "war",
  western: "western",
  family: "family",
  kids: "family",
  history: "history",
  music: "music",
  crime: "crime",
  biography: "biography",
  biopic: "biography",
  art: "art",
  experimental: "experimental",
  adventure: "adventure",
};

export const GENRE_PHRASES_BY_LENGTH: Record<number, string[]> = {
  2: ["sci fi", "science fiction"],
};

// Phrase-form variants that should map to the same canonical value.
// "sci fi" (space) is the most-typed.
export const GENRE_PHRASE_MAP: Record<string, string> = {
  "sci fi": "science fiction",
  "science fiction": "science fiction",
};
