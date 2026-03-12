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
