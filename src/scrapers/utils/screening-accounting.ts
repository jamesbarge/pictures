/**
 * Screening-loss accounting: counted units, stage boundaries and conservation.
 *
 * Why this exists
 * ---------------
 * Before this module a scrape reported three numbers (`added`, `updated`,
 * `failed`) and two of them were not what they said:
 *
 *   - `BaseScraper.validate` dropped candidates *before* the pipeline counted
 *     anything, with no reason and no total, so no report could say how much of
 *     what a venue published was kept.
 *   - `insertScreening` returned a bare boolean. `true` meant "the
 *     insert-on-conflict statement ran", which is an INSERT *or* an UPDATE, and
 *     it was counted `added`. `false` meant either "an existing row was updated
 *     in place" or "the duplicate check said skip", and both were counted
 *     `updated`.
 *
 * The rule this module follows: a count is either measured at a named stage
 * boundary or explicitly `"unavailable"`. Nothing is fabricated, and nothing
 * unknown is quietly reported as zero.
 *
 * Counted unit
 * ------------
 * One **screening candidate**: a single `RawScreening` as emitted by a scraper.
 * The same unit flows through every stage below, so the conservation equations
 * hold on candidate counts. The one exception is `fetchedPayloads`, whose unit
 * is a payload, kept separate for that reason.
 *
 * Stage boundaries
 * ----------------
 *   fetch      -> `fetchedPayloads`   (payloads returned by fetchPages)
 *   parse      -> `parsed`            (candidates produced by parsePages)
 *   pre-filter -> `preFiltered`       (dropped by BaseScraper.validate)
 *   validate   -> `validationRejected`(dropped by validateScreenings)
 *   accept     -> `accepted`          (candidates handed to the write loop)
 *   write      -> `write.*`           (per-candidate persistence outcome)
 *   post-write -> `postWriteFailures` (row persisted, follow-up work failed)
 */

/**
 * A count the run cannot establish. Deliberately not `0` and not `undefined`:
 * a scraper that does not extend `BaseScraper` cannot report `parsed`, and
 * calling that zero would understate loss instead of admitting ignorance.
 */
export type CountOrUnavailable = number | "unavailable";

export const UNAVAILABLE = "unavailable" as const;

export function isAvailable(value: CountOrUnavailable): value is number {
  return typeof value === "number";
}

/**
 * Why a candidate was dropped at the pre-filter stage.
 *
 * The first five mirror `BaseScraper.validate`'s predicates one-for-one; the
 * filter behaviour is unchanged, only reported.
 *
 * `subclass_filter` is different in kind and deliberately vague: a subclass
 * override that calls `super.validate()` and then filters further (for example
 * `nickel-v2.ts` dropping `MYSTERY MOVIE`) removes candidates for a reason the
 * base class cannot name. It is counted rather than dropped so the pre-filter
 * total still matches the set that actually survived.
 */
export type PreFilterReason =
  | "missing_title"
  | "invalid_datetime"
  | "past_screening"
  | "missing_booking_url"
  | "duplicate_source_id"
  | "subclass_filter";

export const PRE_FILTER_REASONS: readonly PreFilterReason[] = [
  "missing_title",
  "invalid_datetime",
  "past_screening",
  "missing_booking_url",
  "duplicate_source_id",
  "subclass_filter",
] as const;

export interface PreFilterReport {
  /** Candidates handed to validate(). */
  parsed: number;
  /** Candidates that survived. */
  accepted: number;
  /** Candidates dropped. Equals the sum of byReason. */
  rejected: number;
  byReason: Partial<Record<PreFilterReason, number>>;
}

/**
 * Per-candidate persistence outcome.
 *
 * `upserted` is the honest name for the `INSERT ... ON CONFLICT DO UPDATE`
 * path. Postgres will have inserted a new row *or* updated an existing one, and
 * the statement as written does not report which. Splitting it would need
 * `RETURNING xmax = 0` or a per-row pre-read; the first changes a production
 * write statement and the second is a per-row lookup added purely for a
 * counter. Both were declined, so the distinction is recorded as unavailable
 * (see `insertUpdateAttribution`) rather than guessed.
 *
 * `updated` and `unchanged` are exact: they come from the branch where
 * `checkForDuplicate` already identified the target row, so the code knows
 * whether it issued an UPDATE or skipped.
 */
export type ScreeningWriteOutcome = "upserted" | "updated" | "unchanged";

export interface WriteOutcomeCounts {
  /** INSERT ... ON CONFLICT DO UPDATE ran. Insert vs update not established. */
  upserted: number;
  /**
   * An `UPDATE ... WHERE id = ?` completed for a row `checkForDuplicate` had
   * just identified. Statement-completed, not affected-row-verified: see
   * `completedWrites`.
   */
  updated: number;
  /** The duplicate check said skip; nothing was written. */
  unchanged: number;
  /**
   * Candidates whose write outcome could not be established. Read it as
   * **"outcome unavailable"**, not as "no row persisted" and not as "the write
   * was attempted and failed". It is a compatibility counter, and both
   * stronger readings are unsupported.
   *
   * It does not prove nothing persisted. `withDbTimeout` is a `Promise.race`
   * and does not cancel: a statement abandoned at the 15s ceiling can commit
   * afterwards, and the deferred-retry note on `retryDeferredWrites` records
   * the same thing — a late original insert makes the retry hit the unique
   * index, "failing" while the row is in fact in the table. Establishing the
   * truth would need statement cancellation, which this patch does not add.
   *
   * It is also wider than a write failure. Three paths feed it:
   *   - the write statement threw, or was dropped because the deferred-write
   *     queue was full;
   *   - `getOrCreateFilm` returned no id, so the whole film group is charged
   *     here without a single write being attempted (a film-resolution loss,
   *     e.g. TMDB matching broken, at a stage this module does not name);
   *   - the film-level catch charged `filmScreenings.length - settled`, i.e.
   *     screenings abandoned before being attempted.
   *
   * So a venue whose title matching is broken reports its loss here and can be
   * misread as a persistence problem. Splitting out `filmUnresolved` and
   * `abandoned` is the honest fix and both are already distinct code paths; it
   * is left as a follow-up rather than widened into this patch.
   */
  failed: number;
}

export function emptyWriteOutcomeCounts(): WriteOutcomeCounts {
  return { upserted: 0, updated: 0, unchanged: 0, failed: 0 };
}

export function totalWrites(counts: WriteOutcomeCounts): number {
  return counts.upserted + counts.updated + counts.unchanged + counts.failed;
}

/**
 * Write statements that completed without error. **Not** a count of rows that
 * reached the table.
 *
 * Neither bucket establishes affected rows. `upserted` runs
 * `INSERT ... ON CONFLICT DO UPDATE` and `updated` runs an `UPDATE ... WHERE
 * id = ?`, and neither carries a `RETURNING` clause or reads a row count. A row
 * deleted concurrently between `checkForDuplicate` and the `UPDATE` yields zero
 * affected rows and still completes without error, so it would land here.
 * Establishing the true count needs a `RETURNING` on both production write
 * statements, which this patch declined to change.
 */
export function completedWrites(counts: WriteOutcomeCounts): number {
  return counts.upserted + counts.updated;
}

export interface ScreeningAccounting {
  cinemaId: string;
  /**
   * Payloads returned by `fetchPages()`, not HTTP responses. A single payload
   * can be the product of several HTTP calls (a bundled JSON API, a paginated
   * fetch concatenated by the scraper), so this is not a request count and must
   * not be read as one.
   */
  fetchedPayloads: CountOrUnavailable;
  /** Candidates produced by parsing. Unavailable outside BaseScraper. */
  parsed: CountOrUnavailable;
  preFiltered: CountOrUnavailable;
  preFilteredByReason: Partial<Record<PreFilterReason, number>>;
  validationRejected: number;
  validationRejectedByReason: Record<string, number>;
  /** Candidates handed to the write loop. */
  accepted: number;
  write: WriteOutcomeCounts;
  /**
   * A row was persisted but follow-up work for it failed (today: festival
   * linking). Deliberately separate from `write.failed`: the screening is in
   * the table, so calling it a failed persistence would overstate loss and
   * would suppress the superseded report for the wrong reason.
   *
   * KNOWN RACE, not defended against here. `withDbTimeout` is a `Promise.race`
   * and does not cancel, so an abandoned `insertScreening` keeps running and
   * its festival link can report a failure at an arbitrary later moment. If
   * that lands after the pipeline projects its counters, the failure is
   * reported as zero. If it lands before, the deferred retry re-runs the write,
   * the duplicate branch returns `unchanged` (excluded from `completedWrites`),
   * and the `postWriteFailures > completedWrites` check fires as a conservation
   * failure with no underlying error. Closing either needs real cancellation.
   * Also on that retry the festival link is not re-attempted: the duplicate
   * branch returns before reaching it.
   */
  postWriteFailures: number;
  /** Always unavailable while the upsert path stays a single statement. */
  insertUpdateAttribution: "unavailable";
  /**
   * Always unavailable: no write statement carries RETURNING or reads a row
   * count, so `upserted` and `updated` are statement completions rather than
   * verified row changes.
   */
  affectedRowAttribution: "unavailable";
  /**
   * True for a deliberately partial batch (L-CUT gap-fill and similar), which
   * is not the venue's full listing and whose counts therefore must not be
   * added into a full run's totals.
   *
   * A MARKER AWAITING A CONSUMER. Nothing sets it outside tests today —
   * `scripts/lcut-gapfill.ts`, the named example, does not call
   * `buildAccounting` at all — and nothing enforces the exclusion. It is
   * printed by `formatAccounting` and otherwise unread. Do not rely on it as a
   * guarantee until a producer wires it.
   */
  supplementary: boolean;
  /** The diff check blocked the batch; nothing was written. */
  blocked: boolean;
}

export interface AccountingProblem {
  boundary: "pre-filter" | "validation" | "write" | "blocked";
  message: string;
}

/**
 * Check the conservation equations that must hold at each boundary.
 *
 * Skipped rather than failed when an input is `"unavailable"`: an unknown
 * count cannot disprove conservation, and pretending otherwise would push
 * callers back to fabricating zeros.
 */
export function checkAccounting(a: ScreeningAccounting): AccountingProblem[] {
  const problems: AccountingProblem[] = [];

  // Every pre-filter rejection carries exactly one reason, so the tally must
  // equal the total. Checked on preFiltered alone: it does not need `parsed`,
  // and the two only happen to arrive together today because both come off one
  // PreFilterReport.
  if (isAvailable(a.preFiltered)) {
    const byReason = sumByReason(a.preFilteredByReason);
    if (byReason !== a.preFiltered) {
      problems.push({
        boundary: "pre-filter",
        message: `preFiltered ${a.preFiltered} does not match reason total ${byReason}`,
      });
    }
  }

  // Boundary 1: parse -> pre-filter. parsed = preFilterAccepted + preFiltered,
  // and pre-filter's survivors are what validation receives.
  if (isAvailable(a.parsed) && isAvailable(a.preFiltered)) {
    const survived = a.parsed - a.preFiltered;
    if (survived < 0) {
      problems.push({
        boundary: "pre-filter",
        message: `preFiltered ${a.preFiltered} exceeds parsed ${a.parsed}`,
      });
    }
    // Boundary 2: pre-filter survivors = accepted + validationRejected.
    //
    // Only meaningful when the write loop ran. A blocked batch is validated
    // and *then* refused, so its survivors were neither accepted nor rejected
    // by validation; asserting the identity there would fail on a correctly
    // reported block. The blocked branch below carries its own assertion, and
    // survivors must still cover the validation rejections.
    if (a.blocked) {
      if (survived < a.validationRejected) {
        problems.push({
          boundary: "validation",
          message:
            `pre-filter survivors ${survived} is fewer than validationRejected ` +
            `${a.validationRejected}`,
        });
      }
    } else if (survived !== a.accepted + a.validationRejected) {
      problems.push({
        boundary: "validation",
        message:
          `pre-filter survivors ${survived} does not equal accepted ${a.accepted} ` +
          `plus validationRejected ${a.validationRejected}`,
      });
    }
  }

  const rejectedByReason = sumByReason(a.validationRejectedByReason);
  // A single screening can carry several validation errors, so the reason
  // tally is a sum over errors and is >= the rejected row count.
  if (rejectedByReason < a.validationRejected) {
    problems.push({
      boundary: "validation",
      message:
        `validationRejected ${a.validationRejected} exceeds its reason total ` +
        `${rejectedByReason}`,
    });
  }

  if (a.blocked) {
    // Boundary 4: a blocked batch never reached the write loop, so it accepted
    // nothing and wrote nothing. `accepted` is checked here because boundary 3
    // is skipped for a blocked batch: without it a record claiming candidates
    // reached the loop with no outcome at all would pass clean.
    if (a.accepted !== 0 || completedWrites(a.write) !== 0 || a.write.unchanged !== 0) {
      problems.push({
        boundary: "blocked",
        message:
          `blocked batch reports accepted ${a.accepted} with completed writes ` +
          `${completedWrites(a.write)} and unchanged ${a.write.unchanged}; a ` +
          `blocked batch must report zero for all three`,
      });
    }
  } else {
    // Boundary 3: every accepted candidate reaches exactly one write outcome.
    if (totalWrites(a.write) !== a.accepted) {
      problems.push({
        boundary: "write",
        message:
          `accepted ${a.accepted} does not equal write outcomes ` +
          `${totalWrites(a.write)} (upserted ${a.write.upserted}, updated ` +
          `${a.write.updated}, unchanged ${a.write.unchanged}, failed ` +
          `${a.write.failed})`,
      });
    }
  }

  if (a.postWriteFailures > completedWrites(a.write)) {
    problems.push({
      boundary: "write",
      message:
        `postWriteFailures ${a.postWriteFailures} exceeds completed write ` +
        `statements ${completedWrites(a.write)}`,
    });
  }

  return problems;
}

function sumByReason(byReason: Record<string, number>): number {
  return Object.values(byReason).reduce((total, n) => total + n, 0);
}

/**
 * One-line summary for run logs. Prints `unavailable` verbatim so a reader can
 * tell "we did not measure this" from "we measured zero".
 */
export function formatAccounting(a: ScreeningAccounting): string {
  const show = (v: CountOrUnavailable) => (isAvailable(v) ? String(v) : UNAVAILABLE);
  const parts = [
    `payloads=${show(a.fetchedPayloads)}`,
    `parsed=${show(a.parsed)}`,
    `preFiltered=${show(a.preFiltered)}`,
    `validationRejected=${a.validationRejected}`,
    `accepted=${a.accepted}`,
    `upserted=${a.write.upserted}`,
    `updated=${a.write.updated}`,
    `unchanged=${a.write.unchanged}`,
    `failed=${a.write.failed}`,
    `postWriteFailures=${a.postWriteFailures}`,
    "insertUpdate=unavailable",
    "affectedRows=unavailable",
  ];
  if (a.supplementary) parts.push("supplementary");
  if (a.blocked) parts.push("blocked");
  return parts.join(" ");
}
