/**
 * Cleanup Cron Job
 *
 * Scheduled task to clean up old/expired data:
 * - Remove past screenings (older than 24 hours)
 * - Remove orphaned film records (no screenings)
 *
 * Runs daily at 4am UK time via Vercel Cron
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { screenings, films } from "@/db/schema";
import { lt, notInArray } from "drizzle-orm";
import { verifyCronSecret } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    pastScreeningsRemoved: 0,
    orphanedFilmsRemoved: 0,
    errors: [] as string[],
  };

  try {
    // 1. Remove past screenings (older than 24 hours to account for timezone differences)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    const deletedScreenings = await db
      .delete(screenings)
      .where(lt(screenings.datetime, cutoffDate))
      .returning({ id: screenings.id });

    results.pastScreeningsRemoved = deletedScreenings.length;
    console.log(`[Cleanup] Removed ${results.pastScreeningsRemoved} past screenings`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    results.errors.push(`Failed to remove past screenings: ${message}`);
    console.error("[Cleanup] Error removing past screenings:", error);
  }

  try {
    // 2. Remove orphaned films (films with no screenings)
    // First, get all film IDs that have at least one screening
    const filmsWithScreenings = await db
      .selectDistinct({ filmId: screenings.filmId })
      .from(screenings);

    const filmIdsWithScreenings = filmsWithScreenings.map((f) => f.filmId);

    if (filmIdsWithScreenings.length > 0) {
      // Delete films that have no screenings
      const deletedFilms = await db
        .delete(films)
        .where(notInArray(films.id, filmIdsWithScreenings))
        .returning({ id: films.id });

      results.orphanedFilmsRemoved = deletedFilms.length;
      console.log(`[Cleanup] Removed ${results.orphanedFilmsRemoved} orphaned films`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    results.errors.push(`Failed to remove orphaned films: ${message}`);
    console.error("[Cleanup] Error removing orphaned films:", error);
  }

  const success = results.errors.length === 0;
  const status = success ? 200 : 207; // 207 = Multi-Status (partial success)

  return NextResponse.json({
    success,
    timestamp: new Date().toISOString(),
    results,
  }, { status });
}

// Vercel Cron requires the GET method
export const dynamic = "force-dynamic";
