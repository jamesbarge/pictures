/**
 * QA Analyze & Fix Task — DB Comparison + Gemini Analysis + Auto-Fix
 *
 * Receives browse output, compares against DB state, detects issues,
 * uses Gemini for AI-powered checks, applies verified fixes.
 * Runs WITHOUT Playwright (no expensive machine needed).
 */

import { task } from "@trigger.dev/sdk/v3";
import { eq, gte, lte, and } from "drizzle-orm";

import { db } from "@/db";
import { screenings, films } from "@/db/schema";

import type {
  QaBrowseOutput,
  QaAnalysisOutput,
  ClassifiedIssue,
  BookingCheck,
  FrontEndScreening,
} from "./types";
import { applyFixes } from "./utils/db-fixer";
import {
  analyzeTmdbMismatch,
  analyzeBookingPageContent,
  batchAnomalyReview,
  generatePreventionReport,
} from "./utils/gemini-analyzer";
import { classifyScope } from "./utils/scope-classifier";
import { normalizeTitle, parseRelativeDatetime } from "./utils/title-utils";

/** Classify booking-check results into broken-link issues. */
function classifyBookingChecks(bookingChecks: BookingCheck[]): ClassifiedIssue[] {
  const result: ClassifiedIssue[] = [];

  for (const check of bookingChecks) {
    const firstFailed =
      (typeof check.firstAttemptStatus === "number" && check.firstAttemptStatus >= 400) ||
      check.firstAttemptStatus === "timeout" ||
      check.firstAttemptStatus === "error";

    const secondFailed =
      check.secondAttemptStatus === "not_attempted" ||
      (typeof check.secondAttemptStatus === "number" && check.secondAttemptStatus >= 400) ||
      check.secondAttemptStatus === "timeout" ||
      check.secondAttemptStatus === "error";

    if (firstFailed && secondFailed && check.secondAttemptStatus !== "not_attempted") {
      result.push({
        type: "broken_booking_link",
        scope: "spot",
        severity: "warning",
        entityType: "screening",
        entityId: check.screeningId || "unknown",
        description: `Broken booking link: ${check.url} (status: ${check.firstAttemptStatus}/${check.secondAttemptStatus})`,
        suggestedFix: null,
        confidence: 0.95,
        metadata: { cinemaId: check.cinemaId, url: check.url, doubleChecked: true },
      });
    } else if (firstFailed && check.secondAttemptStatus === "not_attempted") {
      result.push({
        type: "broken_booking_link",
        scope: "spot",
        severity: "info",
        entityType: "screening",
        entityId: check.screeningId || "unknown",
        description: `Possibly broken booking link (not double-checked): ${check.url}`,
        suggestedFix: null,
        confidence: 0.5,
        metadata: { cinemaId: check.cinemaId, url: check.url, doubleChecked: false },
      });
    }
  }

  return result;
}

/** Detect DB screenings older than a 2-hour grace period. */
function detectStaleScreenings(
  dbScreenings: Array<{ screeningId: string; filmTitle: string; datetime: Date }>,
  now: Date,
): ClassifiedIssue[] {
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
  return dbScreenings
    .filter((s) => s.datetime < twoHoursAgo)
    .map((s) => ({
      type: "stale_screening",
      scope: "spot",
      severity: "info",
      entityType: "screening",
      entityId: s.screeningId,
      description: `Stale screening: "${s.filmTitle}" at ${s.datetime.toISOString()} (>2h past)`,
      suggestedFix: "Delete stale screening",
      confidence: 1.0,
      metadata: { filmTitle: s.filmTitle, datetime: s.datetime.toISOString() },
    }));
}

/** Detect films with a TMDB match but no Letterboxd rating (deduplicated by film). */
function detectMissingLetterboxd(
  dbScreenings: Array<{ filmId: string; filmTitle: string; tmdbId: number | null; letterboxdRating: number | null }>,
): ClassifiedIssue[] {
  const seen = new Map<string, { filmId: string; title: string }>();
  for (const s of dbScreenings) {
    if (s.tmdbId && !s.letterboxdRating && !seen.has(s.filmId)) {
      seen.set(s.filmId, { filmId: s.filmId, title: s.filmTitle });
    }
  }
  return [...seen.values()].map((film) => ({
    type: "missing_letterboxd",
    scope: "spot",
    severity: "info",
    entityType: "film",
    entityId: film.filmId,
    description: `Film "${film.title}" has TMDB match but no Letterboxd rating`,
    suggestedFix: "Run Letterboxd enrichment",
    confidence: 1.0,
  }));
}

/** Detect front-end screening times that differ from DB by more than 5 minutes. */
function detectTimeMismatches(
  feScreenings: FrontEndScreening[],
  dbScreenings: Array<{ screeningId: string; filmTitle: string; cinemaId: string; datetime: Date }>,
  referenceDate: Date,
): ClassifiedIssue[] {
  const result: ClassifiedIssue[] = [];

  for (const feScreening of feScreenings) {
    if (!feScreening.datetime || !feScreening.cinemaName) continue;

    const parsedIso = parseRelativeDatetime(feScreening.datetime, referenceDate);
    if (!parsedIso) continue;

    const feDateMs = new Date(parsedIso).getTime();

    // Find corresponding DB screening by cinema + title + approximate date (same day)
    const feNorm = normalizeTitle(feScreening.filmTitle);
    const dbMatch = dbScreenings.find((db) => {
      const dbNorm = normalizeTitle(db.filmTitle);
      if (feNorm !== dbNorm) return false;

      const feCinema = feScreening.cinemaName.toLowerCase();
      const dbCinema = db.cinemaId.toLowerCase().replace(/-/g, " ");
      if (!feCinema.includes(dbCinema) && !dbCinema.includes(feCinema)) return false;

      // Same day (within 24h) to match the right screening
      const dbDateMs = db.datetime.getTime();
      return Math.abs(feDateMs - dbDateMs) < 24 * 60 * 60_000;
    });

    if (!dbMatch) continue;

    const diffMs = Math.abs(feDateMs - dbMatch.datetime.getTime());
    if (diffMs > 5 * 60_000) {
      result.push({
        type: "time_mismatch",
        scope: "spot",
        severity: "warning",
        entityType: "screening",
        entityId: dbMatch.screeningId,
        description: `Time mismatch: front-end shows "${feScreening.datetime}" (parsed: ${parsedIso}), DB has ${dbMatch.datetime.toISOString()} (diff: ${Math.round(diffMs / 60_000)}min)`,
        suggestedFix: `Update screening datetime to ${parsedIso}`,
        confidence: 0.85,
        metadata: {
          filmTitle: feScreening.filmTitle,
          correctedDatetime: parsedIso,
          fromStructuredData: false, // DOM-extracted times — conservative
        },
      });
    }
  }

  return result;
}

export const qaAnalyzeAndFix = task({
  id: "qa-analyze-and-fix",
  maxDuration: 1800, // 30 min
  retry: { maxAttempts: 0 },
  run: async (payload: {
    browseOutput: QaBrowseOutput;
    dryRun: boolean;
  }): Promise<QaAnalysisOutput> => {
    const startTime = Date.now();
    const { browseOutput, dryRun } = payload;
    const issues: ClassifiedIssue[] = [];

    console.log(
      `[qa-analyze] Starting analysis, dryRun=${dryRun}, ` +
      `${browseOutput.films.length} films, ${browseOutput.screenings.length} screenings`
    );

    // ── Step A: Load DB State ──────────────────────────────────────
    const [today, tomorrow] = browseOutput.dates;
    const dayAfterTomorrow = new Date(
      new Date(tomorrow).getTime() + 86_400_000
    ).toISOString().split("T")[0];

    const dbScreenings = await db
      .select({
        screeningId: screenings.id,
        filmId: screenings.filmId,
        cinemaId: screenings.cinemaId,
        datetime: screenings.datetime,
        bookingUrl: screenings.bookingUrl,
        filmTitle: films.title,
        tmdbId: films.tmdbId,
        posterUrl: films.posterUrl,
        letterboxdRating: films.letterboxdRating,
        matchConfidence: films.matchConfidence,
        matchStrategy: films.matchStrategy,
        synopsis: films.synopsis,
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .where(
        and(
          gte(screenings.datetime, new Date(`${today}T00:00:00Z`)),
          lte(screenings.datetime, new Date(`${dayAfterTomorrow}T00:00:00Z`))
        )
      );

    console.log(`[qa-analyze] Loaded ${dbScreenings.length} DB screenings for comparison`);

    // ── Step B: Deterministic Checks ───────────────────────────────

    // Reference date for parsing relative datetime strings ("Today 11:00")
    const referenceDate = new Date(browseOutput.extractedAt);

    // B1: Stale screenings (datetime < now - 2h grace period)
    const now = new Date();
    const staleIssues = detectStaleScreenings(dbScreenings, now);
    issues.push(...staleIssues);
    if (staleIssues.length > 0) {
      console.log(`[qa-analyze] Found ${staleIssues.length} stale screenings`);
    }

    // B2: Missing Letterboxd ratings
    const letterboxdIssues = detectMissingLetterboxd(dbScreenings);
    issues.push(...letterboxdIssues);
    if (letterboxdIssues.length > 0) {
      console.log(`[qa-analyze] Found ${letterboxdIssues.length} films missing Letterboxd`);
    }

    // B3: Time mismatch detection — compare front-end screening times vs DB
    const timeMismatchIssues = detectTimeMismatches(browseOutput.screenings, dbScreenings, referenceDate);
    issues.push(...timeMismatchIssues);
    if (timeMismatchIssues.length > 0) {
      console.log(`[qa-analyze] Found ${timeMismatchIssues.length} time mismatches`);
    }

    // ── Step C: Parse Booking Check Results ────────────────────────
    issues.push(...classifyBookingChecks(browseOutput.bookingChecks));

    // ── Step D: AI-Powered Checks ──────────────────────────────────

    // D1: TMDB mismatch detection — compare front-end titles vs DB titles
    const titleMismatches: Array<{
      dbScreening: (typeof dbScreenings)[0];
      frontEndTitle: string;
    }> = [];

    for (const feScreening of browseOutput.screenings) {
      if (!feScreening.cinemaName || !feScreening.filmTitle) continue;
      const feNorm = normalizeTitle(feScreening.filmTitle);

      // Match by cinema name + datetime proximity (within 30 min), NOT bookingUrl
      // bookingUrl joins produce false positives with generic URLs (e.g. David Lean Cinema)
      const dbMatch = dbScreenings.find((db) => {
        const dbNorm = normalizeTitle(db.filmTitle);
        if (feNorm === dbNorm) return false; // titles match — no mismatch

        // Cinema name must be present in the DB cinemaId or vice versa
        // (front-end has display name, DB has cinemaId — approximate match)
        const feCinema = feScreening.cinemaName.toLowerCase();
        const dbCinema = db.cinemaId.toLowerCase().replace(/-/g, " ");
        const cinemaMatch = feCinema.includes(dbCinema) || dbCinema.includes(feCinema);
        if (!cinemaMatch) return false;

        // Datetime proximity: within 30 minutes
        if (feScreening.datetime && db.datetime) {
          const parsedFe = parseRelativeDatetime(feScreening.datetime, referenceDate);
          if (!parsedFe) return false;
          const feDateMs = new Date(parsedFe).getTime();
          const dbDateMs = db.datetime.getTime();
          if (Math.abs(feDateMs - dbDateMs) > 30 * 60_000) return false;
        }

        return true;
      });
      if (dbMatch) {
        titleMismatches.push({ dbScreening: dbMatch, frontEndTitle: feScreening.filmTitle });
      }
    }

    // AI analysis for TMDB mismatches (rate limited)
    for (const mismatch of titleMismatches.slice(0, 10)) {
      try {
        const result = await analyzeTmdbMismatch({
          frontEndTitle: mismatch.frontEndTitle,
          dbTitle: mismatch.dbScreening.filmTitle,
          dbTmdbId: mismatch.dbScreening.tmdbId,
          posterUrl: mismatch.dbScreening.posterUrl,
          synopsis: mismatch.dbScreening.synopsis,
        });
        if (result.isMismatch) {
          issues.push({
            type: "tmdb_mismatch",
            scope: "spot",
            severity: "warning",
            entityType: "film",
            entityId: mismatch.dbScreening.filmId,
            description: `TMDB mismatch: front-end shows "${mismatch.frontEndTitle}", DB has "${mismatch.dbScreening.filmTitle}"`,
            suggestedFix: result.suggestedTitle
              ? `Re-match to "${result.suggestedTitle}"`
              : null,
            confidence: result.confidence,
            metadata: {
              frontEndTitle: mismatch.frontEndTitle,
              currentTmdbId: mismatch.dbScreening.tmdbId,
              currentMatchConfidence: mismatch.dbScreening.matchConfidence,
            },
          });
        }
      } catch (err) {
        console.error(`[qa-analyze] TMDB analysis failed for "${mismatch.frontEndTitle}":`, err);
      }
    }

    // D2: Booking page film/time mismatch
    for (const check of browseOutput.bookingChecks) {
      if (check.detectedFilmTitle && check.confidence < 0.7) {
        try {
          // Find the expected screening
          const expected = browseOutput.screenings.find((s) => s.bookingUrl === check.url);
          if (expected) {
            const result = await analyzeBookingPageContent({
              expectedTitle: expected.filmTitle,
              expectedTime: expected.datetime,
              detectedTitle: check.detectedFilmTitle,
              detectedTime: check.detectedTime,
            });
            if (!result.matches) {
              issues.push({
                type: "booking_page_wrong_film",
                scope: "spot",
                severity: "warning",
                entityType: "screening",
                entityId: check.screeningId || "unknown",
                description: `Booking page shows "${check.detectedFilmTitle}" but expected "${expected.filmTitle}"`,
                suggestedFix: null,
                confidence: result.confidence,
                metadata: { url: check.url, cinemaId: check.cinemaId },
              });
            }
          }
        } catch (err) {
          console.error(`[qa-analyze] Booking analysis failed for ${check.url}:`, err);
        }
      }
    }

    // D3: Batch anomaly review (consolidated Gemini call)
    if (issues.length > 0) {
      try {
        const discrepancies = issues.slice(0, 20).map((issue) => ({
          type: issue.type,
          filmTitle: String(issue.metadata?.filmTitle ?? issue.description.slice(0, 50)),
          detail: issue.description,
        }));
        const anomalyResults = await batchAnomalyReview(discrepancies);
        for (const result of anomalyResults) {
          if (result.index < issues.length) {
            // Update severity if Gemini recommends differently
            issues[result.index].severity = result.severity;
          }
        }
      } catch (err) {
        console.error("[qa-analyze] Batch anomaly review failed:", err);
      }
    }

    // ── Step E: Scope Classification ───────────────────────────────
    const classifiedIssues = await classifyScope(issues);
    console.log(
      `[qa-analyze] Classified ${classifiedIssues.length} issues: ` +
      `${classifiedIssues.filter((i) => i.scope === "systemic").length} systemic, ` +
      `${classifiedIssues.filter((i) => i.scope === "spot").length} spot`
    );

    // ── Step F: Apply Fixes ────────────────────────────────────────
    const fixResults = await applyFixes(classifiedIssues, dryRun);
    const appliedCount = fixResults.filter((r) => r.applied).length;
    console.log(
      `[qa-analyze] Applied ${appliedCount}/${fixResults.length} fixes (dryRun=${dryRun})`
    );

    // ── Step G: Prevention Report ──────────────────────────────────
    let preventionReport: string | null = null;
    if (classifiedIssues.some((i) => i.scope === "systemic" || i.severity === "critical")) {
      try {
        preventionReport = await generatePreventionReport({
          issues: classifiedIssues.map((i) => ({
            type: i.type,
            cinemaId: String(i.metadata?.cinemaId ?? ""),
            description: i.description,
            fixStatus: fixResults.find((r) => r.issue === i)?.applied ? "fixed" : "open",
          })),
          scraperSchedules: [
            "scrape-all-orchestrator: Weekly Monday 3am UTC",
            "enrichment-daily-sweep: Daily 4:30am UTC (skip Mon)",
            "enrichment-letterboxd: Weekly Monday 8am UTC",
            "qa-orchestrator: Daily 6am UTC",
            "autoscrape-nightly: Daily 1am UTC (skip Mon)",
            "autoquality-weekly: Sunday 2am UTC",
          ].join("\n"),
        });
      } catch (err) {
        console.error("[qa-analyze] Prevention report generation failed:", err);
      }
    }

    const output: QaAnalysisOutput = {
      issuesFound: classifiedIssues,
      fixesApplied: fixResults,
      preventionReport,
      stats: {
        totalIssues: classifiedIssues.length,
        fixesApplied: appliedCount,
        fixesSkipped: fixResults.length - appliedCount,
        durationMs: Date.now() - startTime,
      },
    };

    console.log(
      `[qa-analyze] Complete in ${Math.round(output.stats.durationMs / 1000)}s: ` +
      `${output.stats.totalIssues} issues, ${output.stats.fixesApplied} fixes applied`
    );

    return output;
  },
});
