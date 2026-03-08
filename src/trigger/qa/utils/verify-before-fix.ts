/**
 * Double-check verification gate before applying DB fixes.
 *
 * Each fix type has a verification strategy:
 * - Deterministic checks pass through immediately
 * - TMDB mismatches are cross-referenced against the API
 * - Structured-data checks confirm provenance
 */

import { matchFilmToTMDB } from "@/lib/tmdb/match";
import { db } from "@/db";
import { films } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ClassifiedIssue, VerificationOutcome } from "../types";

export async function verifyBeforeFix(
  issue: ClassifiedIssue
): Promise<VerificationOutcome> {
  switch (issue.type) {
    case "stale_screening":
      // Deterministic — datetime < now - 2h is objective
      return {
        confirmed: true,
        method: "deterministic",
        reason: "Screening datetime is in the past by more than 2 hours",
      };

    case "time_mismatch":
      if (issue.metadata?.fromStructuredData) {
        return {
          confirmed: true,
          method: "structured_data",
          reason:
            "Time extracted from structured data (JSON-LD / microdata) — high trust",
        };
      }
      return {
        confirmed: false,
        method: "structured_data_check",
        reason:
          "Time was not extracted from structured data — cannot confirm accuracy",
      };

    case "tmdb_mismatch":
      return verifyTmdbMismatch(issue);

    case "missing_letterboxd":
      // enrichLetterboxdRatings() is idempotent
      return {
        confirmed: true,
        method: "idempotent",
        reason: "Letterboxd enrichment is idempotent — safe to re-run",
      };

    case "broken_booking_link":
      // Double-check already performed in browse task
      return {
        confirmed: true,
        method: "double_checked",
        reason: "Link was already double-checked during browse task",
      };

    case "booking_page_wrong_film":
      // Gemini already analyzed the page content
      return {
        confirmed: true,
        method: "ai_analyzed",
        reason: "Booking page content was analyzed by Gemini",
      };

    default:
      return {
        confirmed: false,
        method: "unknown_type",
        reason: `No verification strategy for issue type: ${issue.type}`,
      };
  }
}

async function verifyTmdbMismatch(
  issue: ClassifiedIssue
): Promise<VerificationOutcome> {
  const frontEndTitle = issue.metadata?.frontEndTitle as string | undefined;
  const currentTmdbId = issue.metadata?.currentTmdbId as number | undefined;
  const existingConfidence = issue.metadata?.matchConfidence as
    | number
    | undefined;

  if (!frontEndTitle) {
    console.log(
      "[qa-verify] tmdb_mismatch: no frontEndTitle in metadata — skipping"
    );
    return {
      confirmed: false,
      method: "tmdb_cross_reference",
      reason: "Missing frontEndTitle in issue metadata",
    };
  }

  // Cross-reference TMDB API with the front-end title
  const match = await matchFilmToTMDB(frontEndTitle, {
    skipAmbiguityCheck: true,
  });

  if (!match) {
    console.log(
      `[qa-verify] tmdb_mismatch: TMDB returned no match for "${frontEndTitle}"`
    );
    return {
      confirmed: false,
      method: "tmdb_cross_reference",
      reason: `TMDB returned no match for title "${frontEndTitle}"`,
    };
  }

  // (a) Must return a different tmdbId than current
  if (match.tmdbId === currentTmdbId) {
    console.log(
      `[qa-verify] tmdb_mismatch: TMDB returned same ID ${match.tmdbId} — no change needed`
    );
    return {
      confirmed: false,
      method: "tmdb_cross_reference",
      reason: `TMDB search returned the same tmdbId (${match.tmdbId}) — no mismatch`,
    };
  }

  // (b) New confidence must exceed existing matchConfidence
  if (
    existingConfidence !== undefined &&
    match.confidence <= existingConfidence
  ) {
    console.log(
      `[qa-verify] tmdb_mismatch: new confidence ${match.confidence} <= existing ${existingConfidence}`
    );
    return {
      confirmed: false,
      method: "tmdb_cross_reference",
      reason: `New match confidence (${match.confidence.toFixed(2)}) does not exceed existing (${existingConfidence.toFixed(2)})`,
    };
  }

  // (c) Check for UNIQUE constraint — new tmdb_id must not belong to another film
  const existingFilm = await db
    .select({ id: films.id })
    .from(films)
    .where(eq(films.tmdbId, match.tmdbId))
    .limit(1);

  if (existingFilm.length > 0 && existingFilm[0].id !== issue.entityId) {
    console.log(
      `[qa-verify] tmdb_mismatch: tmdbId ${match.tmdbId} already belongs to film ${existingFilm[0].id}`
    );
    return {
      confirmed: false,
      method: "tmdb_cross_reference",
      reason: `tmdbId ${match.tmdbId} already belongs to another film (${existingFilm[0].id}) — would violate UNIQUE constraint`,
    };
  }

  console.log(
    `[qa-verify] tmdb_mismatch confirmed: ${currentTmdbId} → ${match.tmdbId} (confidence ${match.confidence.toFixed(2)})`
  );

  // Stash the verified match data back into metadata for the fixer
  issue.metadata = {
    ...issue.metadata,
    verifiedTmdbId: match.tmdbId,
    verifiedPosterPath: match.posterPath,
    verifiedConfidence: match.confidence,
  };

  return {
    confirmed: true,
    method: "tmdb_cross_reference",
    reason: `TMDB re-match confirmed: tmdbId ${currentTmdbId} → ${match.tmdbId} with confidence ${match.confidence.toFixed(2)}`,
  };
}
