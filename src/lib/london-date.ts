/**
 * London civil-date helpers (backend).
 *
 * Deliberately a small copy of the two functions this codebase needs
 * server-side, rather than an import: `frontend/` is a separate SvelteKit app
 * with its own package.json and build, and there is no shared package between
 * them (`packages/` holds only chatgpt-widgets and mcp-server). Keep the two
 * implementations behaviourally identical — see
 * frontend/src/lib/london-date.ts.
 *
 * Anything that needs to bucket a *timestamp* into a London day should do it
 * in SQL with `(datetime AT TIME ZONE 'Europe/London')::date` instead of these
 * helpers: Postgres gets the BST/GMT transitions right and the work stays in
 * the query.
 */

const LONDON_DATE_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `Date` -> "YYYY-MM-DD" in London civil time. */
export function londonDateString(date: Date): string {
  return LONDON_DATE_ISO.format(date);
}

/**
 * Shift a "YYYY-MM-DD" string by whole days.
 *
 * Anchored at 12:00Z so that adding a day can never land on a DST transition
 * and slip an hour backwards into the previous date.
 */
export function addDaysToDateString(yyyyMmDd: string, days: number): string {
  const date = new Date(`${yyyyMmDd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). Negative if `to` is earlier. */
export function daysBetweenDateStrings(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
