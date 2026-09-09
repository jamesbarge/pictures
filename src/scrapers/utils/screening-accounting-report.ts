/**
 * Assemble a `ScreeningAccounting` from the two seams that hold the numbers.
 *
 * Split from `screening-accounting.ts` so the type and conservation layer stays
 * importable by `base.ts` without dragging in the pipeline result type.
 */

import type { PipelineResult } from "../pipeline";
import type { CinemaScraper } from "../types";
import {
  UNAVAILABLE,
  checkAccounting,
  emptyWriteOutcomeCounts,
  formatAccounting,
  type CountOrUnavailable,
  type PreFilterReport,
  type ScreeningAccounting,
} from "./screening-accounting";

export {
  formatAccounting,
  checkAccounting,
  type ScreeningAccounting,
} from "./screening-accounting";

/**
 * The subset of `BaseScraper` the runner needs for accounting. Duck-typed
 * rather than an `instanceof` check because several venues implement
 * `CinemaScraper` directly without extending `BaseScraper` (for example
 * `cinemas/the-nickel.ts`), and those must report `unavailable` instead of
 * being forced into a false zero.
 */
export interface PreFilterSource {
  getPreFilterReport(): PreFilterReport | null;
  getFetchedPayloadCount(): number | null;
}

export function asPreFilterSource(
  scraper: CinemaScraper | PreFilterSource | undefined
): PreFilterSource | null {
  if (!scraper) return null;
  const candidate = scraper as Partial<PreFilterSource>;
  return typeof candidate.getPreFilterReport === "function" &&
    typeof candidate.getFetchedPayloadCount === "function"
    ? (candidate as PreFilterSource)
    : null;
}

export interface BuildAccountingInput {
  cinemaId: string;
  /** Null when the scraper cannot report pre-filter counts. */
  preFilter: PreFilterReport | null;
  /** Payloads from `fetchPages()`, not HTTP requests. Null when unmeasured. */
  fetchedPayloads: number | null;
  /** Null when no pipeline run happened (empty batch, or scrape threw). */
  pipeline: PipelineResult | null;
  /** True for a deliberately partial batch such as L-CUT gap-fill. */
  supplementary?: boolean;
}

/**
 * Build the accounting record. Every unknown is `"unavailable"`, and the write
 * outcomes are taken from the pipeline's precise counters rather than from the
 * legacy `added`/`updated` aliases.
 */
export function buildAccounting(input: BuildAccountingInput): ScreeningAccounting {
  const { preFilter, pipeline } = input;
  const parsed: CountOrUnavailable = preFilter ? preFilter.parsed : UNAVAILABLE;
  const preFiltered: CountOrUnavailable = preFilter ? preFilter.rejected : UNAVAILABLE;

  return {
    cinemaId: input.cinemaId,
    fetchedPayloads: input.fetchedPayloads ?? UNAVAILABLE,
    parsed,
    preFiltered,
    preFilteredByReason: preFilter?.byReason ?? {},
    validationRejected: pipeline?.rejected ?? 0,
    validationRejectedByReason: pipeline?.rejectedByReason ?? {},
    // Accepted is what the write loop actually received, measured by the
    // pipeline at its own input (see PipelineResult.accepted) and NOT derived
    // from the write buckets. That independence is the whole point: it is the
    // other side of the boundary-3 equation, so a candidate that reaches no
    // write outcome shows up as a conservation failure instead of cancelling
    // out. With no pipeline run there was no write loop, so it is zero rather
    // than unavailable.
    accepted: pipeline?.accepted ?? 0,
    write: pipeline ? pipeline.write : emptyWriteOutcomeCounts(),
    postWriteFailures: pipeline?.postWriteFailures ?? 0,
    insertUpdateAttribution: UNAVAILABLE,
    affectedRowAttribution: UNAVAILABLE,
    supplementary: input.supplementary ?? false,
    blocked: pipeline?.blocked ?? false,
  };
}

/**
 * Log the accounting line and, when a conservation equation fails, say so
 * loudly. A broken equation means the accounting itself is wrong, which is
 * worth surfacing at runtime rather than only in tests.
 */
export function reportAccounting(
  accounting: ScreeningAccounting,
  log: (line: string) => void = (line) => console.log(line)
): ScreeningAccounting {
  log(`[Accounting] ${accounting.cinemaId} ${formatAccounting(accounting)}`);
  const problems = checkAccounting(accounting);
  for (const problem of problems) {
    console.error(
      `[Accounting] ${accounting.cinemaId} conservation failure at ` +
        `${problem.boundary}: ${problem.message}`
    );
  }
  return accounting;
}
