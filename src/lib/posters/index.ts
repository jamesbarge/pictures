/**
 * Multi-Source Poster Service
 *
 * Provides redundant poster fetching with multiple fallback sources:
 * 1. TMDB - Primary source (best mainstream coverage)
 * 2. OMDB - Fallback using IMDb data
 * 3. Fanart.tv - Artistic/alternative posters
 * 4. Scraper-provided - Extracted from cinema websites
 * 5. Generated placeholder - Last resort
 */

export { getPosterService } from "./service";
