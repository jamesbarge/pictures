/**
 * Pure parser for the BFI AudienceView "Online" search payload.
 *
 * Extracted from bfi.ts so it can be unit-tested without pulling in the
 * Playwright/scraper machinery. The BFI site is server-rendered .asp with the
 * data inline as `searchResults : [ [..], [..] ]` (a colon-assigned object
 * property, NOT a window global, NOT `= ...;`-assigned). See SCRAPING_PLAYBOOK.
 */

/** A row from the embedded `searchResults` array. */
export type SearchRow = (string | number | null)[];

/**
 * Bracket-match and JSON.parse the embedded `searchResults : [ ... ]` array
 * out of a BFI Online HTML page.
 *
 * The array contains nested arrays and no terminating `;`, so a non-greedy
 * regex can't handle it: we find the opening `[` after the `searchResults :`
 * token and walk to its matching close bracket, ignoring brackets that appear
 * inside quoted strings (with escape handling). Returns null if the token is
 * absent, the brackets are unbalanced, or the slice isn't valid JSON.
 */
export function parseSearchResultsArray(html: string): SearchRow[] | null {
  const keyMatch = html.match(/searchResults\s*:\s*\[/);
  if (!keyMatch || keyMatch.index === undefined) return null;

  const start = html.indexOf("[", keyMatch.index);
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(html.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as SearchRow[]) : null;
  } catch {
    return null;
  }
}
