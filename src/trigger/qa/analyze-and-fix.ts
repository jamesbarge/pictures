/**
 * QA Analyze & Fix Task — DB Comparison + Gemini Analysis + Auto-Fix
 *
 * Receives browse output, compares against DB state, detects issues,
 * uses Gemini for AI-powered checks, applies verified fixes.
 * Runs WITHOUT Playwright (no expensive machine needed).
 */

import { task } from "@trigger.dev/sdk/v3";
import { db } from "@/db";
import { screenings, films } from "@/db/schema";
import { eq, gte, lte, and, lt } from "drizzle-orm";
import { normalizeTitle } from "./utils/title-utils";
import {
  analyzeTmdbMismatch,
  analyzeBookingPageContent,
  batchAnomalyReview,
  generatePreventionReport,
} from "./utils/gemini-analyzer";
import { classifyScope } from "./utils/scope-classifier";
import { applyFixes } from "./utils/db-fixer";
import type {
  QaBrowseOutput,
  QaAnalysisOutput,
  ClassifiedIssue,
  QaIssueType,
} from "./types";

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

    // B1: Stale screenings (datetime < now - 2h grace period)
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
    const staleScreenings = dbScreenings.filter(
      (s) => s.datetime < twoHoursAgo
    );
    for (const s of staleScreenings) {
      issues.push({
        type: "stale_screening",
        scope: "spot",
        severity: "info",
        entityType: "screening",
        entityId: s.screeningId,
        description: `Stale screening: "${s.filmTitle}" at ${s.datetime.toISOString()} (>2h past)`,
        suggestedFix: "Delete stale screening",
        confidence: 1.0,
        metadata: { filmTitle: s.filmTitle, datetime: s.datetime.toISOString() },
      });
    }
    if (staleScreenings.length > 0) {
      console.log(`[qa-analyze] Found ${staleScreenings.length} stale screenings`);
    }

    // B2: Missing Letterboxd ratings
    const filmsWithTmdbNoLetterboxd = new Map<string, { filmId: string; title: string }>();
    for (const s of dbScreenings) {
      if (s.tmdbId && !s.letterboxdRating && !filmsWithTmdbNoLetterboxd.has(s.filmId)) {
        filmsWithTmdbNoLetterboxd.set(s.filmId, { filmId: s.filmId, title: s.filmTitle });
      }
    }
    for (const [, film] of filmsWithTmdbNoLetterboxd) {
      issues.push({
        type: "missing_letterboxd",
        scope: "spot",
        severity: "info",
        entityType: "film",
        entityId: film.filmId,
        description: `Film "${film.title}" has TMDB match but no Letterboxd rating`,
        suggestedFix: "Run Letterboxd enrichment",
        confidence: 1.0,
      });
    }
    if (filmsWithTmdbNoLetterboxd.size > 0) {
      console.log(`[qa-analyze] Found ${filmsWithTmdbNoLetterboxd.size} films missing Letterboxd`);
    }

    // ── Step C: Parse Booking Check Results ────────────────────────
    for (const check of browseOutput.bookingChecks) {
      const bothFailed =
        (typeof check.firstAttemptStatus === "number" && check.firstAttemptStatus >= 400) ||
        check.firstAttemptStatus === "timeout" ||
        check.firstAttemptStatus === "error";

      const secondFailed =
        check.secondAttemptStatus === "not_attempted" ||
        (typeof check.secondAttemptStatus === "number" && check.secondAttemptStatus >= 400) ||
        check.secondAttemptStatus === "timeout" ||
        check.secondAttemptStatus === "error";

      if (bothFailed && secondFailed && check.secondAttemptStatus !== "not_attempted") {
        // Both attempts confirmed broken
        issues.push({
          type: "broken_booking_link",
          scope: "spot",
          severity: "warning",
          entityType: "screening",
          entityId: check.screeningId || "unknown",
          description: `Broken booking link: ${check.url} (status: ${check.firstAttemptStatus}/${check.secondAttemptStatus})`,
          suggestedFix: null,
          confidence: 0.95,
          metadata: { cinemaId: check.cinemaId, url: check.url },
        });
      } else if (bothFailed && check.secondAttemptStatus === "not_attempted") {
        // Budget exhausted — flag for human review
        issues.push({
          type: "broken_booking_link",
          scope: "spot",
          severity: "info",
          entityType: "screening",
          entityId: check.screeningId || "unknown",
          description: `Possibly broken booking link (not double-checked): ${check.url}`,
          suggestedFix: null,
          confidence: 0.5,
          metadata: { cinemaId: check.cinemaId, url: check.url },
        });
      }
    }

    // ── Step D: AI-Powered Checks ──────────────────────────────────

    // D1: TMDB mismatch detection — compare front-end titles vs DB titles
    const titleMismatches: Array<{
      dbScreening: (typeof dbScreenings)[0];
      frontEndTitle: string;
    }> = [];

    for (const feScreening of browseOutput.screenings) {
      // Try to find matching DB screening
      const dbMatch = dbScreenings.find((db) => {
        const feNorm = normalizeTitle(feScreening.filmTitle);
        const dbNorm = normalizeTitle(db.filmTitle);
        return feNorm !== dbNorm && feScreening.bookingUrl === db.bookingUrl;
      });
      if (dbMatch) {
        titleMismatches.push({ dbScreening: dbMatch, frontEndTitle: feScreening.filmTitle });
      }
    }

    // Also check low-confidence matches
    const lowConfidenceFilms = dbScreenings.filter(
      (s) => s.matchConfidence !== null && s.matchConfidence < 0.6
    );
    // Deduplicate by filmId
    const seenFilmIds = new Set<string>();
    const uniqueLowConf = lowConfidenceFilms.filter((s) => {
      if (seenFilmIds.has(s.filmId)) return false;
      seenFilmIds.add(s.filmId);
      return true;
    });

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
        const discrepancies = issues.slice(0, 20).map((issue, i) => ({
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
            "enrichment-letterboxd: Weekly Monday 8am UTC",
            "enrichment-festival-reverse-tag: Weekly Monday 9am UTC",
            "qa-orchestrator: Daily 6am UTC",
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
