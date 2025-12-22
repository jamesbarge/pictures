/**
 * External URL Helpers
 * Generate URLs for external film databases (TMDB, IMDb, Letterboxd)
 */

/**
 * Generate TMDB URL from movie ID
 */
export function getTmdbUrl(tmdbId: number): string {
  return `https://www.themoviedb.org/movie/${tmdbId}`;
}

/**
 * Generate IMDb URL from title ID
 */
export function getImdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/${imdbId}/`;
}

/**
 * Generate Letterboxd URL from film title
 * Letterboxd uses kebab-case slugs with specific transformations
 */
export function generateLetterboxdUrl(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[''´`]/g, "")           // Remove apostrophes
    .replace(/[:\-–—]/g, " ")         // Replace colons/dashes with space
    .replace(/&/g, "and")             // & becomes "and"
    .replace(/[^a-z0-9\s]/g, "")      // Remove other special chars
    .trim()
    .replace(/\s+/g, "-");            // Spaces to hyphens

  return `https://letterboxd.com/film/${slug}/`;
}
