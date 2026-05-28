/**
 * Diagnose the BST bug reported by a customer on 2026-05-26.
 *
 * Symptom: Site shows showtime 1 hour ahead of the actual cinema time.
 * Hypothesis: Some scrapers store BST clock-face times as UTC, so the
 * frontend's UTC->London conversion adds +1 hour on top of an already-wrong
 * value. Affected scrapers (suspected): bfi, rich-mix, rich-mix-v2.
 *
 * This script: for each cinema, print the next 3 upcoming screenings'
 * datetime field as both UTC and Europe/London, plus how it would APPEAR
 * to the user vs what the cinema's own website would say. If the rendered
 * London time equals the original UK clock-face value the scraper read,
 * the data is correct. If it's 1 hour AHEAD, the bug is confirmed.
 */
import "dotenv/config";
import { db } from "../src/db";
import { screenings, cinemas, films } from "../src/db/schema";
import { and, eq, gte, asc } from "drizzle-orm";

// Match by name pattern instead of slug since slug conventions vary.
const SUSPECT_NAME_PATTERNS = [
  /^bfi\b/i,
  /rich.?mix/i,
  /regent.?street/i,
  /everyman/i, // chain control: should be CORRECT
  /curzon/i,   // chain control: should be CORRECT
  /riverside/i,
];

const londonFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/London",
});

async function main() {
  console.error(`Today (UK): ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "full" }).format(new Date())}`);
  console.error(`BST active: yes (UTC+1, until last Sunday of October)`);
  console.error(`Connecting to DB...`);

  const allCinemas = await db.select({ id: cinemas.id, name: cinemas.name }).from(cinemas);
  console.error(`Loaded ${allCinemas.length} cinemas\n`);
  const now = new Date();

  const targets = allCinemas.filter((c) =>
    SUSPECT_NAME_PATTERNS.some((re) => re.test(c.name))
  );
  console.log(`Inspecting ${targets.length} cinemas matching suspect/control patterns:\n`);

  for (const cinema of targets) {
    const rows = await db
      .select({ id: screenings.id, datetime: screenings.datetime, title: films.title, bookingUrl: screenings.bookingUrl })
      .from(screenings)
      .innerJoin(films, eq(films.id, screenings.filmId))
      .where(and(eq(screenings.cinemaId, cinema.id), gte(screenings.datetime, now)))
      .orderBy(asc(screenings.datetime))
      .limit(3);

    console.log(`▶ ${cinema.name} (${cinema.id})`);
    if (rows.length === 0) {
      console.log("  (no upcoming screenings)\n");
      continue;
    }
    for (const r of rows) {
      const dt = r.datetime instanceof Date ? r.datetime : new Date(r.datetime as unknown as string);
      console.log(`  DB UTC: ${dt.toISOString()}`);
      console.log(`  Rendered to user: ${londonFmt.format(dt)}`);
      console.log(`  Film: ${r.title}`);
      console.log(`  Booking: ${r.bookingUrl}\n`);
    }
  }

  process.exit(0);
}


main().catch((e) => {
  console.error(e);
  process.exit(1);
});
