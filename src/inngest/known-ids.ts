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
 * Chain venue IDs that Inngest routes to chain scrapers.
 * These return "requires Playwright" message since chains need browser runtime.
 */
export const CHAIN_CINEMA_IDS = new Set([
  // Curzon
  "curzon-soho",
  "curzon-mayfair",
  "curzon-bloomsbury",
  "curzon-victoria",
  "curzon-hoxton",
  "curzon-kingston",
  "curzon-aldgate",
  // Picturehouse
  "picturehouse-central",
  "hackney-picturehouse",
  "crouch-end-picturehouse",
  "east-dulwich-picturehouse",
  "greenwich-picturehouse",
  "finsbury-park-picturehouse",
  "gate-picturehouse",
  "picturehouse-ritzy",
  "clapham-picturehouse",
  "west-norwood-picturehouse",
  "ealing-picturehouse",
  // Everyman
  "everyman-belsize-park",
  "everyman-baker-street",
  "everyman-barnet",
  "everyman-borough-yards",
  "everyman-broadgate",
  "everyman-canary-wharf",
  "everyman-chelsea",
  "everyman-crystal-palace",
  "everyman-hampstead",
  "everyman-kings-cross",
  "everyman-maida-vale",
  "everyman-muswell-hill",
  "everyman-screen-on-the-green",
  "everyman-stratford",
]);

/**
 * Get all cinema IDs that Inngest can resolve.
 * Returns the union of scraper registry IDs and chain cinema IDs.
 */
export function getInngestKnownCinemaIds(): Set<string> {
  return new Set([...SCRAPER_REGISTRY_IDS, ...CHAIN_CINEMA_IDS]);
}
