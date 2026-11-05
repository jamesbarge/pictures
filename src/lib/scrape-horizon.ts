/**
 * Horizon check — does every active cinema have listings at least
 * HORIZON_TARGET_DAYS ahead?
 *
 * Read-only. A short horizon has two causes the numbers alone can't separate:
 * the venue hasn't published that far yet ("publishes short", e.g. The Nickel
 * and Coldharbour Blue on 2026-11-05), or our scraper stops early. The /scrape
 * command has Claude Code spot-check the venue site for each flagged cinema to
 * tell them apart, rather than guessing here.
 */
import { sql } from "drizzle-orm";
import { db, withDbTimeout } from "@/db";

export const HORIZON_TARGET_DAYS = 30;

export interface CinemaHorizon {
  cinemaId: string;
  name: string;
  chain: string | null;
  /** Upcoming screenings in the next HORIZON_TARGET_DAYS days. */
  next30: number;
  /** Furthest upcoming screening (YYYY-MM-DD, Europe/London), or null if none. */
  furthest: string | null;
  /** Whole days from today to `furthest`; -1 when there are no upcoming screenings. */
  daysAhead: number;
}

export async function measureHorizons(): Promise<CinemaHorizon[]> {
  const rows = await withDbTimeout(
    db.execute(sql`
      select c.id, c.name, c.chain,
        count(s.id) filter (where s.datetime < now() + make_interval(days => ${HORIZON_TARGET_DAYS}))::int as next30,
        to_char(max(s.datetime) at time zone 'Europe/London', 'YYYY-MM-DD') as furthest,
        coalesce(
          (max(s.datetime) at time zone 'Europe/London')::date - (now() at time zone 'Europe/London')::date,
          -1
        )::int as days_ahead
      from cinemas c
      left join screenings s on s.cinema_id = c.id and s.datetime >= now()
      where c.is_active
      group by c.id, c.name, c.chain
      order by days_ahead, c.id
    `),
    20_000,
    "horizon query",
  );
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    cinemaId: String(r.id),
    name: String(r.name),
    chain: (r.chain as string | null) ?? null,
    next30: Number(r.next30),
    furthest: (r.furthest as string | null) ?? null,
    daysAhead: Number(r.days_ahead),
  }));
}

export function shortHorizons(horizons: CinemaHorizon[]): CinemaHorizon[] {
  return horizons.filter((h) => h.daysAhead < HORIZON_TARGET_DAYS);
}

export function formatHorizonReport(horizons: CinemaHorizon[]): string {
  const short = shortHorizons(horizons);
  const independents = short.filter((h) => h.chain === null);
  const lines = [
    `Horizon (target ≥${HORIZON_TARGET_DAYS} days): ${horizons.length - short.length}/${horizons.length} active cinemas OK, ` +
      `${short.length} short (${independents.length} independent).`,
  ];
  for (const h of short) {
    const tag = h.chain ? ` [${h.chain}]` : "";
    lines.push(
      h.daysAhead < 0
        ? `  ✗ ${h.cinemaId}${tag}: no upcoming screenings`
        : `  ⚠ ${h.cinemaId}${tag}: ${h.daysAhead}d ahead (to ${h.furthest}), ${h.next30} in next ${HORIZON_TARGET_DAYS}d`,
    );
  }
  return lines.join("\n");
}
