/**
 * Shared constants for scrapers
 */

/** Chrome-like User-Agent for fetch requests (short form) */
export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/** Full Chrome User-Agent for sites that validate the complete UA string */
export const CHROME_USER_AGENT_FULL =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Bot-identified User-Agent for polite scraping */
export const BOT_USER_AGENT = "Mozilla/5.0 (compatible; PicturesBot/1.0)";

/**
 * Generic calendar-client User-Agent for fetching public iCal feeds.
 *
 * Used by the Cinema Museum scraper. Its SiteGround WAF (verified live
 * 2026-06-12) returns 403 to BOTH browser-fingerprint UAs (anything containing
 * "Chrome" / a full desktop UA string) AND the old self-identifying
 * "pictures-cinema-museum-scraper/1.0" UA, but returns 200 to plain
 * non-browser calendar-client UAs like this one (the same class of UA that
 * Google/Apple Calendar subscribers send). Do NOT swap this for a Chrome UA —
 * that is now blocked.
 */
export const CALENDAR_CLIENT_USER_AGENT = "Google-Calendar-Importer";
