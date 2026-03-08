/**
 * Applies verified fixes to the database with audit trail.
 *
 * Every fix (applied or skipped) is logged to the data_issues table
 * for full traceability.
 */

import { db } from "@/db";
import { screenings, films, dataIssues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enrichLetterboxdRatings } from "@/db/enrich-letterboxd";
import type {
  ClassifiedIssue,
  FixResult,
  FixAction,
  VerificationOutcome,
} from "../types";
import type { DataIssueType } from "@/agents/types";
import { verifyBeforeFix } from "./verify-before-fix";

// ── Type Mapping ──────────────────────────────────────────────

function mapToDataIssueType(type: ClassifiedIssue["type"]): DataIssueType {
  const map: Record<ClassifiedIssue["type"], DataIssueType> = {
    stale_screening: "stale_screening",
    time_mismatch: "wrong_time",
    broken_booking_link: "broken_link",
    booking_page_wrong_film: "booking_page_wrong_film",
    tmdb_mismatch: "tmdb_mismatch",
    missing_letterboxd: "missing_metadata",
    front_end_db_mismatch: "front_end_db_mismatch",
  };
  return map[type];
}

// ── Fix Actions by Type ───────────────────────────────────────

function actionForType(type: ClassifiedIssue["type"]): FixAction {
  const map: Record<ClassifiedIssue["type"], FixAction> = {
    stale_screening: "deleted_stale_screening",
    time_mismatch: "updated_screening_time",
    tmdb_mismatch: "re_matched_tmdb",
    missing_letterboxd: "enriched_letterboxd",
    broken_booking_link: "flagged_broken_link",
    booking_page_wrong_film: "flagged_for_review",
    front_end_db_mismatch: "flagged_for_review",
  };
  return map[type];
}

// ── Core Fix Logic ────────────────────────────────────────────

async function executeFixOperation(issue: ClassifiedIssue): Promise<void> {
  switch (issue.type) {
    case "stale_screening":
      await db
        .delete(screenings)
        .where(eq(screenings.id, issue.entityId));
      console.log(
        `[qa-fixer] Deleted stale screening ${issue.entityId}`
      );
      break;

    case "time_mismatch": {
      const correctedDatetime = issue.metadata?.correctedDatetime as
        | string
        | undefined;
      if (!correctedDatetime) {
        throw new Error(
          "time_mismatch fix requires metadata.correctedDatetime"
        );
      }
      await db
        .update(screenings)
        .set({ datetime: new Date(correctedDatetime) })
        .where(eq(screenings.id, issue.entityId));
      console.log(
        `[qa-fixer] Updated screening ${issue.entityId} datetime to ${correctedDatetime}`
      );
      break;
    }

    case "tmdb_mismatch": {
      const tmdbId = (issue.metadata?.verifiedTmdbId ??
        issue.metadata?.newTmdbId) as number | undefined;
      const posterPath = (issue.metadata?.verifiedPosterPath ??
        issue.metadata?.newPosterPath) as string | null | undefined;
      const confidence = (issue.metadata?.verifiedConfidence ??
        issue.metadata?.newConfidence) as number | undefined;

      if (tmdbId === undefined) {
        throw new Error("tmdb_mismatch fix requires a tmdbId in metadata");
      }

      const posterUrl = posterPath
        ? `https://image.tmdb.org/t/p/w500${posterPath}`
        : undefined;

      await db
        .update(films)
        .set({
          tmdbId,
          ...(posterUrl ? { posterUrl } : {}),
          matchConfidence: confidence ?? null,
          matchStrategy: "qa-cleanup",
          matchedAt: new Date(),
        })
        .where(eq(films.id, issue.entityId));
      console.log(
        `[qa-fixer] Re-matched film ${issue.entityId} to tmdbId ${tmdbId}`
      );
      break;
    }

    case "missing_letterboxd":
      await enrichLetterboxdRatings();
      console.log("[qa-fixer] Ran Letterboxd enrichment");
      break;

    case "broken_booking_link":
      // No screening modification — audit trail only
      console.log(
        `[qa-fixer] Flagged broken booking link for screening ${issue.entityId}`
      );
      break;

    case "booking_page_wrong_film":
      // No screening modification — audit trail only
      console.log(
        `[qa-fixer] Flagged booking page wrong film for screening ${issue.entityId}`
      );
      break;

    default:
      console.log(
        `[qa-fixer] No fix operation for type: ${issue.type}`
      );
  }
}

// ── Audit Trail ───────────────────────────────────────────────

async function insertAuditRecord(
  issue: ClassifiedIssue,
  applied: boolean
): Promise<void> {
  await db.insert(dataIssues).values({
    id: crypto.randomUUID(),
    type: mapToDataIssueType(issue.type),
    severity: issue.severity,
    entityType: issue.entityType,
    entityId: issue.entityId,
    description: issue.description,
    suggestedFix: issue.suggestedFix,
    confidence: issue.confidence,
    status: applied ? "auto_fixed" : "open",
    agentName: "qa-cleanup",
    resolvedAt: applied ? new Date() : undefined,
    resolvedBy: applied ? "qa-cleanup" : undefined,
  });
}

// ── Public API ────────────────────────────────────────────────

export async function applyFix(
  issue: ClassifiedIssue,
  dryRun: boolean
): Promise<FixResult> {
  const action = actionForType(issue.type);

  // Step 1: verify
  let outcome: VerificationOutcome;
  try {
    outcome = await verifyBeforeFix(issue);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    console.log(`[qa-fixer] Verification error for ${issue.type}: ${msg}`);
    await insertAuditRecord(issue, false);
    return {
      issue,
      applied: false,
      action: "flagged_for_review",
      note: `Verification error: ${msg}`,
    };
  }

  // Step 2: not confirmed → flag for review
  if (!outcome.confirmed) {
    console.log(
      `[qa-fixer] Verification failed for ${issue.type} on ${issue.entityId}: ${outcome.reason}`
    );
    await insertAuditRecord(issue, false);
    return {
      issue,
      applied: false,
      action: "flagged_for_review",
      note: outcome.reason,
    };
  }

  // Step 3: dry run → log as open, don't apply
  if (dryRun) {
    console.log(
      `[qa-fixer] DRY RUN: would apply ${action} to ${issue.entityId}`
    );
    await insertAuditRecord(issue, false);
    return {
      issue,
      applied: false,
      action,
      note: "dry run",
    };
  }

  // Step 4: confirmed + not dry run → apply
  try {
    await executeFixOperation(issue);
    await insertAuditRecord(issue, true);
    console.log(
      `[qa-fixer] Applied ${action} to ${issue.entityId}`
    );
    return {
      issue,
      applied: true,
      action,
      note: outcome.reason,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    console.log(
      `[qa-fixer] Fix operation failed for ${issue.type} on ${issue.entityId}: ${msg}`
    );
    await insertAuditRecord(issue, false);
    return {
      issue,
      applied: false,
      action: "flagged_for_review",
      note: `Fix operation failed: ${msg}`,
    };
  }
}

export async function applyFixes(
  issues: ClassifiedIssue[],
  dryRun: boolean
): Promise<FixResult[]> {
  const results: FixResult[] = [];

  for (const issue of issues) {
    const result = await applyFix(issue, dryRun);
    results.push(result);
  }

  console.log(
    `[qa-fixer] Batch complete: ${results.filter((r) => r.applied).length}/${results.length} fixes applied`
  );
  return results;
}
