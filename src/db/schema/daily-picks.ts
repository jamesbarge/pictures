import { pgTable, text, timestamp, integer, real, date, index } from "drizzle-orm/pg-core";
import { films } from "./films";

/**
 * Daily Picks table — THE SLEEPER.
 *
 * One acclaimed-but-under-seen repertory film per London calendar day.
 * Precomputed ~22 days ahead by the `sleeper` phase of /scrape and read by
 * GET /api/sleepers.
 *
 * WHY A TABLE AND NOT AN ON-THE-FLY QUERY:
 * the 21-day no-repeat cooldown is inherently stateful. "Not picked in the last
 * 21 days" cannot be expressed by any date-seeded pure function, because each
 * day's choice depends on which films the previous days consumed. Removing this
 * table means removing the cooldown, and a long-running film then wins every
 * single day. It also gives the pick stability: it cannot change under a user
 * midway through the day.
 *
 * The stored row is an ADVISORY CACHE, not the truth. Screenings get cancelled
 * between weekly scrapes, so the read path re-validates that the picked film
 * still screens that day and recomputes if not.
 */
export const dailyPicks = pgTable(
  "daily_picks",
  {
    /**
     * London calendar date, NOT a timestamp.
     *
     * `mode: "string"` is required. With `mode: "date"` Drizzle hands back a JS
     * Date at UTC midnight, which formats as the PREVIOUS day under BST — a
     * guaranteed off-by-one for seven months of the year.
     */
    pickDate: date("pick_date", { mode: "string" }).primaryKey(),

    /**
     * ON DELETE CASCADE is required, not cosmetic: `db:cleanup-films` deletes
     * orphaned films that no longer have any screenings, and a past pick's film
     * can end up in that state. Without cascade that script starts failing with
     * FK violations. Accepted consequence: deleting a film erases its history.
     */
    filmId: text("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),

    /** score = letterboxd_rating − K·log10(tmdb_vote_count). Higher is more "sleeper". */
    score: real("score").notNull(),

    // ============================================
    // Signals snapshotted at pick time
    // ============================================
    // Stored rather than joined so a past pick can be audited after the film
    // row has been re-enriched — vote_count drifts upward over time, so the
    // live value will not reproduce the score that was actually used.

    letterboxdRating: real("letterboxd_rating").notNull(),
    tmdbVoteCount: integer("tmdb_vote_count").notNull(),

    // ============================================
    // Observability
    // ============================================

    /** How many films cleared every gate that day. The phase warns below 3. */
    candidateCount: integer("candidate_count").notNull(),

    /**
     * Which cooldown tier produced this pick: 21 (full), 10 (relaxed), 0
     * (waived). Makes candidate-pool starvation visible in the data instead of
     * silently looking like a normal pick.
     */
    cooldownDaysApplied: integer("cooldown_days_applied").notNull(),

    /**
     * Bumped whenever K or a gate changes, so the refresh can identify and
     * replace rows computed under older settings. Without it, scores from
     * before and after a tuning change are silently incomparable.
     */
    algoVersion: integer("algo_version").notNull().default(1),

    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Cooldown lookback: "when was this film last picked?" */
    filmDateIdx: index("daily_picks_film_date_idx").on(table.filmId, table.pickDate),
  })
);
