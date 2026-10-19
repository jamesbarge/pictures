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

/** "180m." / "90 mins" stored as a director. Not "3h 21m" (that still bails upstream). */
const RUNTIME_CREDIT = /^\d{1,3}\s*m(?:in(?:ute)?s?)?\.?$/i;

const NAME_PARTICLES = new Set([
  "de", "da", "del", "della", "di", "van", "von", "der", "den", "la", "le", "du",
]);

/** A credit that is only a runtime token, which Garden's stats line emits on its own. */
export function isRuntimeCredit(value: string): boolean {
  return RUNTIME_CREDIT.test(value.trim());
}

/**
 * Title-case a fully lowercase credit ("mohsen enayati"). Mixed case is left
 * alone, so "F. W. Murnau" and "McDormand" stay. A particle after the first
 * word stays lower ("lars von trier" → "Lars von Trier").
 */
export function displayDirectorName(name: string): string {
  if (/\p{Lu}/u.test(name)) return name;
  let index = 0;
  return name.split(/(\s+)/).map((part) => {
    if (!part || /^\s+$/.test(part)) return part;
    const position = index++;
    const lower = part.toLowerCase();
    if (position > 0 && NAME_PARTICLES.has(lower)) return lower;
    return lower.replace(/\p{L}/u, (character, offset) =>
      offset === 0 ? character.toUpperCase() : character,
    );
  }).join("");
}

/** "William Crain / Tate Taylor", then "Michael Benveniste + Howard Ziehm" when both sides are names. */
function splitDirectorCredit(credit: string): string[] {
  const slashed = credit.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  const parts = slashed.length > 1 ? slashed : [credit.trim()];
  const people = /^(?:\p{L}[\p{L}'.-]*)(?:\s+\p{L}[\p{L}'.-]*){0,3}$/u;
  const out: string[] = [];
  for (const part of parts) {
    const plus = part.split(/\s+\+\s+/).map((name) => name.trim()).filter(Boolean);
    if (plus.length > 1 && plus.every((name) => people.test(name))) out.push(...plus);
    else out.push(part);
  }
  return out;
}

/**
 * One stats-line or credit token. A runtime or a bare year is not a person.
 * Country names are the caller's job.
 */
export function normalizePersonCredit(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || isRuntimeCredit(trimmed) || /^\d{4}$/.test(trimmed)) return undefined;
  return displayDirectorName(trimmed);
}

/**
 * Directors sanitiser.
 *
 * Scrapers occasionally concatenate the directors string with the cast list,
 * producing entries like "Bryan Singer Starring Ian McKellen, Patrick Stewart".
 * The patrol's SQL refuses any row where directors contain " Starring " —
 * mirror that at write time.
 *
 * A Garden stats line that is only "180m." is dropped. "William Crain / Tate
 * Taylor" is two directors. An all-lowercase name is title-cased.
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
    for (const piece of splitDirectorCredit(trimmed)) {
      const person = normalizePersonCredit(piece);
      if (!person) {
        rejectedCount++;
        continue;
      }
      out.push(person);
    }
  }
  if (rejectedCount > 0) {
    console.warn(
      `[film-write-guards] dropped ${rejectedCount} director entry/entries (runtime token or "Starring") — ${context ?? "<no context>"}`
    );
    // Preserve the salvageable directors. The patrol's SQL rejected the whole
    // row because it couldn't isolate good entries; we can. Returning the
    // valid slice lets the user see correct credits immediately while the
    // empty/missing case stays eligible for TMDB backfill.
  }
  return out;
}
