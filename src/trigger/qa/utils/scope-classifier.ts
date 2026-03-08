import { db } from "@/db";
import { screenings } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import type { ClassifiedIssue, IssueScope } from "../types";

/**
 * Classifies QA issues as "spot" (just this screening) or "systemic"
 * (affects broader data — cinema-level, film-level, or enrichment-level).
 */
export async function classifyScope(
  issues: ClassifiedIssue[]
): Promise<ClassifiedIssue[]> {
  const now = new Date();

  // Group issues by type for batch classification
  const brokenLinks = issues.filter((i) => i.type === "broken_booking_link");
  const tmdbMismatches = issues.filter((i) => i.type === "tmdb_mismatch");
  const missingLetterboxd = issues.filter(
    (i) => i.type === "missing_letterboxd"
  );

  // ── broken_booking_link: systemic if >= 3 from the same cinema ──
  if (brokenLinks.length > 0) {
    const countsByCinema = new Map<string, ClassifiedIssue[]>();
    for (const issue of brokenLinks) {
      const cinemaId = (issue.metadata?.cinemaId as string) ?? issue.entityId;
      const group = countsByCinema.get(cinemaId) ?? [];
      group.push(issue);
      countsByCinema.set(cinemaId, group);
    }

    for (const [cinemaId, cinemaIssues] of countsByCinema) {
      if (cinemaIssues.length >= 3) {
        console.log(
          `[qa-scope] broken_booking_link: ${cinemaIssues.length} broken links from cinema ${cinemaId} — marking systemic`
        );
        for (const issue of cinemaIssues) {
          issue.scope = "systemic";
          issue.severity = "critical";
        }
      }
    }
  }

  // ── tmdb_mismatch: systemic if film has screenings beyond tomorrow ──
  if (tmdbMismatches.length > 0) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    // Deduplicate film IDs to minimise queries
    const filmIds = [...new Set(tmdbMismatches.map((i) => i.entityId))];

    for (const filmId of filmIds) {
      const futureScreenings = await db
        .select({ id: screenings.id })
        .from(screenings)
        .where(and(eq(screenings.filmId, filmId), gte(screenings.datetime, tomorrow)))
        .limit(1);

      if (futureScreenings.length > 0) {
        console.log(
          `[qa-scope] tmdb_mismatch: film ${filmId} has future screenings — marking systemic`
        );
        for (const issue of tmdbMismatches.filter(
          (i) => i.entityId === filmId
        )) {
          issue.scope = "systemic";
        }
      }
    }
  }

  // ── missing_letterboxd: systemic if >= 5 films affected ──
  if (missingLetterboxd.length >= 5) {
    console.log(
      `[qa-scope] missing_letterboxd: ${missingLetterboxd.length} films missing ratings — marking systemic (enrichment schedule issue)`
    );
    for (const issue of missingLetterboxd) {
      issue.scope = "systemic";
    }
  }

  // Everything else stays at its default scope ("spot")
  const systemicCount = issues.filter((i) => i.scope === "systemic").length;
  console.log(
    `[qa-scope] classified ${issues.length} issues: ${systemicCount} systemic, ${issues.length - systemicCount} spot`
  );

  return issues;
}
