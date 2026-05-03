/**
 * Enrichment corrections — append-only audit log.
 *
 * Replaces the self-modifying `.claude/data-check-learnings.json` that
 * Stream 7 (FM-25) found had once corrupted itself, pointing
 * `wrongTmdbMatches[small axe: lovers rock]` to a 1929 Walter Lantz
 * cartoon (Pussy Willie). Self-modifying authoritative state is the bug
 * class this table eliminates.
 *
 * Two invariants the schema enforces:
 *
 *   1. **Append-only.** No `UPDATE`s, no `DELETE`s in production code
 *      paths. Reversals are recorded by appending a compensating row
 *      with `kind = 'reversal'` and `reversesId` pointing at the entry
 *      to undo. `db.update(enrichmentCorrections)` should appear nowhere
 *      outside of one-off migrations.
 *
 *   2. **Verified gate.** A correction is only authoritative for the
 *      enrichment pipeline once `verifiedBy` is non-null. Unverified
 *      LLM-suggested corrections sit in the table with `verifiedBy =
 *      null` until a human (or a high-confidence automated pass)
 *      promotes them. The matcher reads only verified rows.
 *
 * The full append-only design is in
 * `Pictures/Research/scraping-rethink-2026-05/06-enrichment.md`.
 */

import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

/**
 * What kind of correction is being asserted.
 *
 * - `tmdb_match`     — "title X at cinema Y maps to TMDB id Z"
 * - `tmdb_block`     — "title X at cinema Y MUST NOT map to TMDB id Z"
 *                      (BAD_MERGE_TMDB_IDS replacement)
 * - `prefix_strip`   — "this curatorial prefix should be stripped"
 * - `suffix_strip`   — "this scraper-side suffix should be stripped"
 * - `non_film`       — "title X is an event/talk/concert, not a film"
 * - `merge`          — "two existing film rows should be merged"
 * - `reversal`       — "undo the correction at reversesId"
 */
export const enrichmentCorrectionKindEnum = pgEnum(
  "enrichment_correction_kind",
  ["tmdb_match", "tmdb_block", "prefix_strip", "suffix_strip", "non_film", "merge", "reversal"],
);

/**
 * Where the correction came from.
 *
 * - `claude_code`   — generated during a Claude Code session reading patrols
 * - `human`         — the user typed it in directly
 * - `llm_judge`     — the bge-m3 + Claude-judge enrichment pipeline
 *                      auto-promoted it (only valid once verified)
 * - `migration`     — backfill from `.claude/data-check-learnings.json`
 *                      during the 2026-05 cutover
 */
export const enrichmentCorrectionSourceEnum = pgEnum(
  "enrichment_correction_source",
  ["claude_code", "human", "llm_judge", "migration"],
);

export const enrichmentCorrections = pgTable("enrichment_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),

  // What kind of correction
  kind: enrichmentCorrectionKindEnum("kind").notNull(),

  // The input that triggers this correction
  // Composite key — depending on `kind`, some are NULL
  rawTitle: text("raw_title"),
  cinemaId: text("cinema_id"), // null = applies to all cinemas
  filmId: uuid("film_id"), // for `merge` corrections (the loser id)

  // The correction payload
  // For tmdb_match / tmdb_block: targetTmdbId
  // For prefix_strip / suffix_strip: rawTitle holds the prefix/suffix
  // For non_film: no extra payload
  // For merge: targetFilmId (the canonical winner id)
  // For reversal: reversesId (the row being undone)
  targetTmdbId: integer("target_tmdb_id"),
  targetFilmId: uuid("target_film_id"),
  reversesId: uuid("reverses_id"),

  // Provenance
  source: enrichmentCorrectionSourceEnum("source").notNull(),
  sourceContext: jsonb("source_context").$type<{
    patrolFile?: string;
    promptHash?: string;
    confidence?: number;
    cycleId?: string;
  }>(),

  // The verification gate. Only verified rows are read by the matcher.
  // A row stays unverified until a human (or a sufficiently high-confidence
  // automated process) sets this. NULL means "do not apply yet".
  verifiedBy: text("verified_by"), // user identifier
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationNote: text("verification_note"),

  // Free-form description for humans reading the audit log
  rationale: text("rationale"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EnrichmentCorrection = typeof enrichmentCorrections.$inferSelect;
export type NewEnrichmentCorrection = typeof enrichmentCorrections.$inferInsert;
