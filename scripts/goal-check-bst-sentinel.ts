/**
 * End-condition #9: Zero BST-pattern screenings on active cinemas.
 *
 * Standing guardrail for the recurring BST off-by-one bug class. The
 * signature: a scraper writes a UK-local time as if it were UTC, so when
 * displayed in UK timezone the screening lands in the small hours.
 *
 * Window: 02:00-09:59 UK-local. The 00:00-01:59 zone is excluded because
 * cinemas like Everyman, PCC, and Genesis legitimately programme midnight
 * and 00:15 cult screenings (Mulholland Drive, Obsession, Hokum). The
 * 02:00-09:59 zone is the unambiguous BST-bug signature — no UK cinema
 * sells a 3am ticket.
 *
 * Per-cinema allowlist supported for the edge case of legitimate 02:00+
 * programming (e.g. PCC's overnight movie marathons). Extend
 * `LEGITIMATE_LATE_NIGHT_CINEMAS` only with cinema-confirmed evidence,
 * never as a quick way to silence a real bug.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-bst-sentinel.ts
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { cinemas } from "@/db/schema/cinemas";
import { screenings } from "@/db/schema/screenings";
import { films } from "@/db/schema/films";

// Cinemas that legitimately programme in 00:00-09:59 UK-local (cult / overnight
// marathons). Their screenings in this window do NOT count toward failure.
// Extend conservatively — every entry weakens the sentinel for that cinema.
const LEGITIMATE_LATE_NIGHT_CINEMAS = new Set<string>([
  // Prince Charles Cinema is the obvious candidate (all-nighters), but we
  // don't add it pre-emptively — wait until the sentinel actually flags PCC
  // legitimately so we have evidence rather than a guess.
]);

const WINDOW_DAYS = 30;
const SAMPLE_LIMIT_PER_CINEMA = 5; // for reporting only; the count is exhaustive
const SUSPECT_HOUR_MIN = 2;  // inclusive — exclude 00:00 + 01:xx (legit midnight shows)
const SUSPECT_HOUR_MAX = 10; // exclusive — first hour where real programming starts

function ukHourOf(d: Date): number {
  // Use Intl to extract the hour in Europe/London — handles BST transparently.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(h);
}

async function main() {
  const now = new Date();
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Pull every upcoming screening at active cinemas, then filter by UK-local
  // hour in JS. The window is small enough (~10-20k rows) that this beats
  // doing per-row timezone arithmetic in SQL.
  const rows = await db
    .select({
      screeningId: screenings.id,
      datetime: screenings.datetime,
      cinemaId: cinemas.id,
      cinemaName: cinemas.name,
      filmTitle: films.title,
    })
    .from(screenings)
    .innerJoin(cinemas, eq(cinemas.id, screenings.cinemaId))
    .innerJoin(films, eq(films.id, screenings.filmId))
    .where(
      and(
        eq(cinemas.isActive, true),
        gte(screenings.datetime, now),
        lt(screenings.datetime, horizon),
      ),
    );

  const offenders: { cinemaId: string; cinemaName: string; count: number; samples: { datetime: string; filmTitle: string; ukHour: number }[] }[] = [];
  const byCinema = new Map<string, { name: string; rows: typeof rows }>();

  for (const r of rows) {
    const hour = ukHourOf(r.datetime);
    if (hour < SUSPECT_HOUR_MIN || hour >= SUSPECT_HOUR_MAX) continue;
    if (LEGITIMATE_LATE_NIGHT_CINEMAS.has(r.cinemaId)) continue;
    const entry = byCinema.get(r.cinemaId) ?? { name: r.cinemaName, rows: [] };
    entry.rows.push(r);
    byCinema.set(r.cinemaId, entry);
  }

  for (const [cinemaId, { name, rows: cinemaRows }] of byCinema) {
    offenders.push({
      cinemaId,
      cinemaName: name,
      count: cinemaRows.length,
      samples: cinemaRows.slice(0, SAMPLE_LIMIT_PER_CINEMA).map((r) => ({
        datetime: r.datetime.toISOString(),
        filmTitle: r.filmTitle,
        ukHour: ukHourOf(r.datetime),
      })),
    });
  }

  offenders.sort((a, b) => b.count - a.count);
  const totalOffenders = offenders.reduce((s, o) => s + o.count, 0);
  const pass = totalOffenders === 0;

  console.log(
    JSON.stringify(
      {
        condition: "bst-sentinel",
        pass,
        windowDays: WINDOW_DAYS,
        suspectHourRange: `${SUSPECT_HOUR_MIN}:00-${SUSPECT_HOUR_MAX - 1}:59 UK-local`,
        totalOffenders,
        offendersCount: offenders.length,
        offenders: offenders.slice(0, 10),
        allowlist: Array.from(LEGITIMATE_LATE_NIGHT_CINEMAS),
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ condition: "bst-sentinel", pass: false, error: String(err).slice(0, 500) }));
  process.exit(1);
});
