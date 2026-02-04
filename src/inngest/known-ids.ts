/**
 * Inngest Known Cinema IDs
 *
 * This module exports the sets of cinema IDs that Inngest can resolve.
 * Separated from functions.ts to allow importing without side effects.
 *
 * Used for:
 * - Contract tests to verify registry coverage
 * - Admin API validation before sending to Inngest
 */

/**
 * Independent cinema IDs that have entries in getScraperRegistry().
 * These are directly runnable by Inngest (some require Playwright).
 */
export const SCRAPER_REGISTRY_IDS = new Set([
  // Cheerio-based (work on Vercel serverless)
  "rio-dalston",
  "prince-charles",
  "ica",
  "genesis",
  "peckhamplex",
  "nickel",
  "garden",
  "castle",
  "phoenix",
  "rich-mix",
  "close-up-cinema",
  "cine-lumiere",
  "castle-sidcup",
  "arthouse-crouch-end",
  "coldharbour-blue",
  "olympic-studios",
  "david-lean-cinema",
  "riverside-studios",
  // Playwright-based (require browser runtime)
  "bfi-southbank",
  "bfi-imax",
  "barbican",
  "electric-portobello",
  "lexi",
  "romford-lumiere",
]);

/**
 * Chain cinema ID to chain scraper mapping.
 * Maps venue IDs to their parent chain for Inngest routing.
 * Single source of truth - consumed by functions.ts at runtime.
 */
export const CHAIN_CINEMA_MAPPING: Record<string, string> = {
  // Curzon venues
  "curzon-soho": "curzon",
  "curzon-mayfair": "curzon",
  "curzon-bloomsbury": "curzon",
  "curzon-victoria": "curzon",
  "curzon-hoxton": "curzon",
  "curzon-kingston": "curzon",
  "curzon-aldgate": "curzon",
  // Picturehouse venues
  "picturehouse-central": "picturehouse",
  "hackney-picturehouse": "picturehouse",
  "crouch-end-picturehouse": "picturehouse",
  "east-dulwich-picturehouse": "picturehouse",
  "greenwich-picturehouse": "picturehouse",
  "finsbury-park-picturehouse": "picturehouse",
  "gate-picturehouse": "picturehouse",
  "picturehouse-ritzy": "picturehouse",
  "clapham-picturehouse": "picturehouse",
  "west-norwood-picturehouse": "picturehouse",
  "ealing-picturehouse": "picturehouse",
  // Everyman venues
  "everyman-belsize-park": "everyman",
  "everyman-baker-street": "everyman",
  "everyman-barnet": "everyman",
  "everyman-borough-yards": "everyman",
  "everyman-broadgate": "everyman",
  "everyman-canary-wharf": "everyman",
  "everyman-chelsea": "everyman",
  "everyman-crystal-palace": "everyman",
  "everyman-hampstead": "everyman",
  "everyman-kings-cross": "everyman",
  "everyman-maida-vale": "everyman",
  "everyman-muswell-hill": "everyman",
  "everyman-screen-on-the-green": "everyman",
  "everyman-stratford": "everyman",
};

/**
 * Derived set of chain cinema IDs for quick lookup.
 */
export const CHAIN_CINEMA_IDS = new Set(Object.keys(CHAIN_CINEMA_MAPPING));

/**
 * Get all cinema IDs that Inngest can resolve.
 * Returns the union of scraper registry IDs and chain cinema IDs.
 */
export function getInngestKnownCinemaIds(): Set<string> {
  return new Set([...SCRAPER_REGISTRY_IDS, ...CHAIN_CINEMA_IDS]);
}
