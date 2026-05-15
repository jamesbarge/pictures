/**
 * Write-site guards for the `films` table.
 *
 * Centralises sanitization that `/data-check` would otherwise have to apply
 * after the fact on every patrol cycle. Each guard is conservative — when the
 * input is suspect, return a safe null/empty value rather than persist a row
 * that we know will be rewritten by the next patrol.
 *
 * Background: see `.claude/commands/data-check.md` lines 105–113 for the
 * canonical SQL the patrol used to re-fix these rows hundreds of times.
 */

/**
 * Year sanitiser.
 *
 *   - `Number("")` returns `0`. Without this guard the year column ends up
 *     with `0`, which slips past the `WHERE year IS NULL` enrichment filter
 *     forever — the same film re-matches every run.
 *   - Years before cinema existed (~1888) are almost always corrupt parses,
 *     not real silent shorts. The patrol uses 1900 as the floor.
 *   - Future years > 5y out are typically scraper noise; clamp upward at
 *     "current year + 5" to allow legitimate festival announcements.
 */
export function sanitizeYear(year: unknown): number | null {
  if (year === null || year === undefined) return null;
  const n = typeof year === "number" ? year : Number(year);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1900) return null;
  const ceiling = new Date().getUTCFullYear() + 5;
  if (n > ceiling) return null;
  return Math.trunc(n);
}

/**
 * Directors sanitiser.
 *
 * Scrapers occasionally concatenate the directors string with the cast list,
 * producing entries like "Bryan Singer Starring Ian McKellen, Patrick Stewart".
 * The patrol's SQL refuses any row where directors contain " Starring " —
 * mirror that at write time.
 *
 * Logs to stderr when a noisy scraper is detected so the upstream gets
 * surfaced rather than silently swallowed.
 */
export function sanitizeDirectors(directors: unknown, context?: string): string[] {
  if (!Array.isArray(directors)) return [];
  const out: string[] = [];
  let rejectedCount = 0;
  for (const d of directors) {
    if (typeof d !== "string") continue;
    const trimmed = d.trim();
    if (!trimmed) continue;
    if (/\sStarring\s/i.test(trimmed)) {
      rejectedCount++;
      continue;
    }
    out.push(trimmed);
  }
  if (rejectedCount > 0) {
    console.warn(
      `[film-write-guards] dropped ${rejectedCount} director entry/entries containing " Starring " — ${context ?? "<no context>"}`
    );
    // Preserve the salvageable directors. The patrol's SQL rejected the whole
    // row because it couldn't isolate good entries; we can. Returning the
    // valid slice lets the user see correct credits immediately while the
    // empty/missing case still triggers enrichment via daily-sweep.
  }
  return out;
}
