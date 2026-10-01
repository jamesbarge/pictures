/**
 * THE SLEEPER API Route
 * GET /api/sleepers?days=14 - Daily picks keyed by London calendar date
 *
 * One film per day that is highly rated on Letterboxd but thinly voted on
 * TMDB — acclaimed but under-seen — drawn only from repertory, non-documentary
 * programming, and guaranteed to have a screening that day.
 *
 * WHY A DATE MAP RATHER THAN A SINGLE "TODAY" PICK:
 * the homepage is ISR-cached for an hour (and served stale for up to a day), so
 * a response describing only "today" would be wrong for every visitor after the
 * London midnight rollover. Returning the whole window means hour-old HTML
 * still contains the correct entry for whatever day the client resolves as
 * first-visible, and nothing on the render path has to consult a clock. That
 * matters here specifically: this app has already shipped a hydration bug where
 * a server/client first-render divergence stranded every poster on the wrong
 * film (PR #736).
 *
 * The stored row is an ADVISORY CACHE. Screenings get cancelled between weekly
 * scrapes, so getStoredPicks validates that the picked film still screens that
 * day, and any date it drops is recomputed here on the fly. The fallback calls
 * the same selection function the pipeline uses, so there is no second copy of
 * the rule. It never persists — a public GET must not write, and concurrent
 * cold serverless invocations would race.
 *
 * Returns 200 with an empty map when nothing qualifies. An empty editorial slot
 * is not a broken route, so this never 404s (cf. /api/films/[id]/similar).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api-errors";
import { CACHE_1HOUR } from "@/lib/cache-headers";
import { addDaysToDateString, londonDateString } from "@/lib/london-date";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";
import { SLEEPER_ALGO_VERSION } from "@/lib/sleeper";
import { computePicksForDates, getStoredPicks } from "@/db/repositories";

const MAX_DAYS = 21;

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
});

export const GET = withRateLimit(RATE_LIMITS.public, "sleepers")(async (request: NextRequest) => {
  try {
    const parsed = querySchema.safeParse({
      days: request.nextUrl.searchParams.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const days = parsed.data.days ?? 14;
    const from = londonDateString(new Date());
    const to = addDaysToDateString(from, days - 1);

    const stored = await getStoredPicks(from, to);

    // Recompute only the dates the stored set does not cover — either never
    // written, or written and since invalidated by a cancelled screening.
    const covered = new Set(stored.map((p) => p.date));
    const missing: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDaysToDateString(from, i);
      if (!covered.has(date)) missing.push(date);
    }
    // `stored` is passed through so a recomputed gap day knows what is already
    // committed on the days around it and cannot duplicate a neighbour.
    const recomputed = missing.length > 0 ? await computePicksForDates(missing, stored) : [];

    const picks: Record<
      string,
      {
        filmId: string;
        score: number;
        letterboxdRating: number;
        tmdbVoteCount: number;
        source: "precomputed" | "fallback";
      }
    > = {};
    for (const pick of [...stored, ...recomputed]) {
      picks[pick.date] = {
        filmId: pick.filmId,
        score: pick.score,
        letterboxdRating: pick.letterboxdRating,
        tmdbVoteCount: pick.tmdbVoteCount,
        source: pick.source,
      };
    }

    return NextResponse.json(
      {
        picks,
        meta: {
          from,
          to,
          algoVersion: SLEEPER_ALGO_VERSION,
          // Surfaced so a silently-broken pipeline is observable from outside:
          // an all-"fallback" response means the sleeper phase is not running.
          fallbackCount: recomputed.length,
        },
      },
      { headers: CACHE_1HOUR },
    );
  } catch (error) {
    return handleApiError(error, "GET /api/sleepers");
  }
});
