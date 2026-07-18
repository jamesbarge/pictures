/**
 * Unified scrape + enrichment orchestrator — single entry point for the
 * `/scrape` slash command.
 *
 * Replaces the 4-script manual sequence (`scrape:all` → `cleanup:upcoming`
 * → `audit:films` → `agents:fallback-enrich`) with one ordered run:
 *   1. runScrapeAll()         — fans out 26 scrapers in 4 waves (existing)
 *   1b. runLcutGapfill()      — weekly L-CUT gap-fill (source-only venues) +
 *                               scraper-regression parity monitor. Runs AFTER
 *                               the scrape so parity reflects fresh data, and
 *                               BEFORE cleanup so inserted rows get enriched.
 *   2. cleanup:upcoming       — title cleanup → TMDB → metadata → Letterboxd
 *   3. audit:films            — validation pass over the cleaned data
 *   4. detectSilentBreakers() — surface cinemas in success+0 state
 *
 * Designed to be invoked from the `/scrape` slash command in the foreground
 * so the user sees live output. Each enrichment pass is a child process so
 * a crash in one phase doesn't take down the others.
 *
 * Usage:
 *   npm run scrape:unified                # full run
 *   npm run scrape:unified -- --skip-scrape   # enrichment only (re-run after a manual scrape)
 *   npm run scrape:unified -- --skip-enrich   # scraping only
 *   npm run scrape:unified -- --resume        # skip work completed by a crashed/failed run
 *                                             # (same args, <24h old; per-scraper inside Phase 1)
 */

import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { db, withDbTimeout } from "@/db";
import { screenings } from "@/db/schema";
import { runScrapeAll } from "@/lib/jobs/scrape-all";
import { sendTelegramAlert } from "@/lib/telegram";
import {
  initCheckpoint,
  markPhaseComplete,
  markScrapeEntryComplete,
  readCheckpoint,
  clearCheckpoint,
  honoredPhasePrefix,
} from "@/lib/scrape-checkpoint";
import {
  writeRunSummary,
  computeRunStatus,
  toPersistedStale,
  type PhaseId,
  type RunHealth,
  type SummaryPhase,
} from "@/lib/scrape-run-summary";
import { getScrapedCinemaIds } from "@/scrapers/registry";
import {
  runLcutGapfill,
  classifyLcutTargets,
  detectLcutRegressions,
  formatParityTable,
} from "../../scripts/lcut-gapfill";
import {
  detectSilentBreakers,
  formatQuarantineReport,
  detectFlakyCinemas,
  formatFlakyReport,
  detectYieldDrop,
  formatYieldDropReport,
  detectYieldDeltaSinceBaseline,
  formatYieldDeltaReport,
  detectStaleCinemas,
  formatStaleCinemaReport,
  readRecentDqs,
  formatDqsSnapshot,
} from "@/lib/scrape-quarantine";

const SKIP_SCRAPE = process.argv.includes("--skip-scrape");
const SKIP_ENRICH = process.argv.includes("--skip-enrich");
const SKIP_LCUT = process.argv.includes("--skip-lcut");
const RESUME = process.argv.includes("--resume");

/**
 * Phases eligible for checkpoint/resume — the expensive and/or DB-writing
 * ones. The read-only detector phases (preflight/health/yield-delta) cost
 * seconds and feed the run summary's health section, so they always re-run:
 * skipping them on resume would persist a summary with empty health data.
 */
const CHECKPOINTABLE = new Set<PhaseId>(["scrape", "lcut", "cleanup", "audit", "rematch"]);

/** A scraped venue behind L-CUT by more than this many screenings is flagged
 * as a possible scraper regression (matches Phase 1 of the coverage plan). */
const LCUT_REGRESSION_THRESHOLD = 5;

/** Set once main() has initialized run state, so the fatal handler can still
 * persist a `status: "crashed"` summary with whatever phases completed. */
let persistCrashSummary: (() => Promise<void>) | null = null;

function fmtSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

/** Total screenings count for the before/after delta in the run summary.
 * Client-side timeout matters here: this also runs on the CRASH path, where a
 * dropped pooler connection would otherwise hang the query promise forever
 * and wedge the process instead of exiting (see the 2026-05-07 incident notes
 * in src/db/index.ts). */
async function countScreenings(): Promise<number | null> {
  try {
    const rows = await withDbTimeout(
      db.select({ n: sql<number>`count(*)::int` }).from(screenings),
      10_000,
      "screenings count",
    );
    return rows[0]?.n ?? null;
  } catch (err) {
    console.warn("[scrape-and-enrich] screenings count failed:", err);
    return null;
  }
}

/**
 * Run an npm script as a child process, streaming stdout/stderr to the
 * parent. Resolves to true if the script exited with code 0.
 */
function runNpmScript(scriptName: string, extraArgs: string[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", scriptName, "--", ...extraArgs], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => {
      resolve(code === 0);
    });
    child.on("error", (err) => {
      console.error(`[scrape-and-enrich] failed to spawn ${scriptName}:`, err);
      resolve(false);
    });
  });
}

async function runPhase(
  id: PhaseId,
  label: string,
  fn: () => Promise<{ ok: boolean; warn?: boolean; detail?: string }>,
): Promise<SummaryPhase> {
  const start = Date.now();
  console.log(`\n━━━ ${label} ━━━`);
  try {
    const { ok, warn, detail } = await fn();
    const durationMin = (Date.now() - start) / 60_000;
    const outcome = ok ? (warn ? "OK (warnings)" : "OK") : "FAILED";
    console.log(`[${label}] ${outcome} — ${fmtSeconds(Date.now() - start)}`);
    return { id, label, ok, warn, durationMin, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${label}] threw: ${message}`);
    return {
      id,
      label,
      ok: false,
      durationMin: (Date.now() - start) / 60_000,
      detail: message,
    };
  }
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const runId = `${startedAt.toISOString()}-${process.pid}`;
  const phases: SummaryPhase[] = [];
  const health: RunHealth = {
    silentBreakers: [],
    flaky: [],
    yieldDrops: [],
    yieldDeltas: [],
    stale: [],
    dqs: null,
  };
  const summaryArgs = { skipScrape: SKIP_SCRAPE, skipEnrich: SKIP_ENRICH, skipLcut: SKIP_LCUT };
  const screeningsBefore = await countScreenings();

  // Persist the run summary on EVERY exit path (ok / failed / crashed) so
  // the /scrape skill can report without re-querying the DB. Never throws.
  const persistSummary = async (status?: "crashed"): Promise<void> => {
    await writeRunSummary({
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMin: (Date.now() - startedAt.getTime()) / 60_000,
      args: summaryArgs,
      status: status ?? computeRunStatus(phases),
      phases,
      screeningsBefore,
      screeningsAfter: await countScreenings(),
      health,
    });
  };
  persistCrashSummary = () => persistSummary("crashed");

  // Resume: only honored behind the explicit --resume flag. readCheckpoint
  // validates age (<24h) and arg-match; anything invalid falls back to a
  // full run with a warning.
  const resumeFrom = RESUME ? await readCheckpoint(summaryArgs) : null;
  if (RESUME && !resumeFrom) {
    console.warn(
      "[scrape-and-enrich] --resume: no valid checkpoint (absent, >24h old, or different args) — running fully.",
    );
  } else if (resumeFrom) {
    console.log(
      `[scrape-and-enrich] --resume: checkpoint from ${resumeFrom.startedAt} — ` +
        `${resumeFrom.completedPhases.length} phase(s), ` +
        `${resumeFrom.completedScrapeEntries.length} scraper(s) already complete.`,
    );
  }
  // Checkpointed phases are only honored as a PREFIX of this run's phase
  // sequence: the phases form a dependency chain, so a phase "completed" in a
  // prior run whose upstream phase did NOT complete (e.g. cleanup done but
  // scrape failed) ran against stale data and must re-run after the upstream
  // work is redone. The carried-over checkpoint is truncated the same way so
  // stale completions can't survive into later resumes either.
  const phaseSequence: PhaseId[] = [];
  if (!SKIP_SCRAPE) phaseSequence.push("scrape");
  if (!SKIP_SCRAPE && !SKIP_LCUT) phaseSequence.push("lcut");
  if (!SKIP_ENRICH) phaseSequence.push("cleanup", "audit");
  if (!SKIP_ENRICH && process.env.SCRAPE_REMATCH_SWEEP === "1") phaseSequence.push("rematch");
  const honored = honoredPhasePrefix(phaseSequence, resumeFrom?.completedPhases ?? []);
  if (resumeFrom && honored.length < resumeFrom.completedPhases.length) {
    console.log(
      `[scrape-and-enrich] --resume: honoring only [${honored.join(", ") || "none"}] from the ` +
        "checkpoint — later completions depend on unfinished earlier phases and will re-run.",
    );
  }
  await initCheckpoint(
    runId,
    summaryArgs,
    resumeFrom ? { ...resumeFrom, completedPhases: honored } : null,
  );
  const donePhases = new Set(honored);

  /** runPhase, minus phases already completed in the checkpointed run. */
  const runOrSkipPhase = async (
    id: PhaseId,
    label: string,
    fn: () => Promise<{ ok: boolean; warn?: boolean; detail?: string }>,
  ): Promise<SummaryPhase> => {
    if (donePhases.has(id)) {
      console.log(`\n━━━ ${label} ━━━`);
      console.log(`[${label}] skipped (resume — completed in prior run)`);
      return { id, label, ok: true, durationMin: 0, detail: "skipped (resume)" };
    }
    const result = await runPhase(id, label, fn);
    if (result.ok && CHECKPOINTABLE.has(id)) await markPhaseComplete(id);
    return result;
  };

  // Phase 0: Pre-flight quarantine — read-only, ~1s. Tells the user which
  // cinemas have been silently broken BEFORE they sit through a 30-60 min
  // /scrape that just re-runs them. Three signals, fully orthogonal:
  //   1. Silent breakers — N consecutive `success+0` runs (Prowlarr pattern)
  //   2. Flaky cinemas   — high empty-success or failed ratio over wider window
  //   3. Yield drops     — recent avg yield << baseline avg (silent partial regressions)
  // All always run. Flaky catches alternating empty/non-empty patterns that
  // evade the consecutive-zero detector. Yield-drop catches "success+low" cases
  // (e.g. PDF parser regression that returns 20 instead of 200 screenings)
  // that look healthy to the other two detectors.
  phases.push(
    await runPhase("preflight", "Pre-flight (silent-breaker + flaky + yield-drop check)", async () => {
      // Three orthogonal detectors run in parallel.
      const [breakers, flaky, yieldDrops] = await Promise.all([
        detectSilentBreakers(),
        detectFlakyCinemas(),
        detectYieldDrop(),
      ]);
      const criticalFlaky = flaky.filter((f) => f.severity === "critical");
      const total = breakers.length + flaky.length + yieldDrops.length;
      if (breakers.length === 0 && criticalFlaky.length === 0 && yieldDrops.length === 0) {
        console.log("[pre-flight] No silently-broken, critical-flaky, or yield-dropping cinemas — proceeding.");
        if (flaky.length > 0) {
          // Warn-level flakies still get surfaced so the user can preemptively
          // investigate before they escalate.
          console.log(formatFlakyReport(flaky));
        }
      } else {
        if (breakers.length > 0) console.log(formatQuarantineReport(breakers));
        if (flaky.length > 0) console.log(formatFlakyReport(flaky));
        if (yieldDrops.length > 0) console.log(formatYieldDropReport(yieldDrops));
        console.log(
          `[pre-flight] ${breakers.length} silent, ${criticalFlaky.length} critical-flaky, ` +
            `${flaky.length - criticalFlaky.length} warn-flaky, ${yieldDrops.length} yield-drop. ` +
            "Consider `/scrape-one <slug>` to investigate before starting a full run.",
        );
        void total;
      }
      return {
        ok: true,
        warn: breakers.length > 0 || criticalFlaky.length > 0 || yieldDrops.length > 0,
        detail: `${breakers.length} silent / ${criticalFlaky.length} critical / ${flaky.length - criticalFlaky.length} warn / ${yieldDrops.length} yield-drop`,
      };
    }),
  );

  // Phase 1: Scrape (unless skipped)
  if (!SKIP_SCRAPE) {
    phases.push(
      await runOrSkipPhase("scrape", "Scrape (all cinemas, 4 waves)", async () => {
        const result = await runScrapeAll({
          skipTaskIds: resumeFrom?.completedScrapeEntries,
          onEntryComplete: markScrapeEntryComplete,
        });
        const detail =
          `${result.totalSucceeded} ok / ${result.totalFailed} failed across ${result.waves.length} waves` +
          ` (${result.anomalies} anomalies, ${result.zeroCounts} zero-count)`;
        // Zero-count "successes" and anomalies are the silent-breaker surface —
        // don't fail the phase (exit-code contract unchanged) but flag it.
        return {
          ok: result.totalFailed === 0,
          warn: result.zeroCounts > 0 || result.anomalies > 0,
          detail,
        };
      }),
    );
  } else {
    console.log("[scrape-and-enrich] --skip-scrape: skipping Phase 1");
  }

  // Phase 1b: L-CUT gap-fill (source-only insert) + parity regression monitor.
  // Runs AFTER the scrape (so "missing vs L-CUT" reflects tonight's fresh data,
  // not a stale DB) and BEFORE cleanup (so inserted rows flow through TMDB /
  // enrichment like any scraped screening). Skipped when the scrape was skipped
  // — parity is only meaningful measured against a fresh scrape.
  if (!SKIP_SCRAPE && !SKIP_LCUT) {
    phases.push(
      await runOrSkipPhase("lcut", "L-CUT gap-fill (source-only) + parity monitor", async () => {
        const scrapedIds = getScrapedCinemaIds();
        const { sourceOnly } = classifyLcutTargets(scrapedIds);
        // Insert ONLY for venues we don't scrape ourselves; scraped venues stay
        // report-only so their missing-count remains an honest regression signal.
        const report = await runLcutGapfill({ execute: true, executeTargets: sourceOnly });
        console.log("\n" + formatParityTable(report));
        if (report.unmapped.length > 0) {
          console.warn("⚠️  UNMAPPED L-CUT venues (add to VENUE_MAP):");
          for (const u of report.unmapped) console.warn(`   ${u.count} listing(s) at ${u.name}`);
        }

        const regressions = detectLcutRegressions(report, scrapedIds, LCUT_REGRESSION_THRESHOLD);

        // Surface via the same Telegram path scrape-all uses. Alert whenever
        // there's something actionable: source-only inserts (usually non-zero,
        // so this pings most weeks at info level) or a scraped venue behind
        // L-CUT beyond the threshold (warn level — the regression signal).
        if (regressions.length > 0 || report.totalInserted > 0) {
          const parts: string[] = [
            `Source-only inserted: ${report.totalInserted}` +
              (report.totalFailed > 0 ? ` (${report.totalFailed} failed)` : ""),
          ];
          if (regressions.length > 0) {
            parts.push(
              `\nPossible scraper regressions (>${LCUT_REGRESSION_THRESHOLD} missing vs L-CUT):\n` +
                regressions
                  .map((r) => `• ${r.venue}: ${r.missing} missing / ${r.total} listed`)
                  .join("\n"),
            );
          }
          await sendTelegramAlert({
            title: "L-CUT gap-fill + parity",
            message: parts.join("\n"),
            level: regressions.length > 0 ? "warn" : "info",
          }).catch((err) => console.warn("[lcut] telegram alert failed:", err));
        }

        // Regressions are warnings, not phase failures — the gap-fill itself
        // succeeded. A thrown fetch/DB error is caught by runPhase → ok:false.
        return {
          ok: true,
          warn: regressions.length > 0 || report.unmapped.length > 0,
          detail:
            `${report.totalInserted} inserted (source-only), ` +
            `${regressions.length} scraped venue(s) >${LCUT_REGRESSION_THRESHOLD} missing` +
            (report.unmapped.length > 0 ? `, ${report.unmapped.length} unmapped` : ""),
        };
      }),
    );
  } else if (SKIP_LCUT) {
    console.log("[scrape-and-enrich] --skip-lcut: skipping L-CUT gap-fill phase");
  }

  // Phase 2-3: Enrichment (unless skipped)
  if (!SKIP_ENRICH) {
    phases.push(
      await runOrSkipPhase("cleanup", "Cleanup upcoming films (4 sub-phases)", async () => {
        // The unified scrape command is already a live operational workflow.
        const ok = await runNpmScript("cleanup:upcoming", ["--execute"]);
        return { ok };
      }),
    );
    phases.push(
      await runOrSkipPhase("audit", "Audit films (validation pass)", async () => {
        const ok = await runNpmScript("audit:films");
        return { ok };
      }),
    );

    // Optional phase: re-match sweep for unmatched films (plan 008).
    // Default OFF — opt in with SCRAPE_REMATCH_SWEEP=1 once the operator has
    // reviewed a few manual `npm run rematch:unmatched` dry runs. Capped at
    // 100 films per run to bound TMDB usage and blast radius.
    if (process.env.SCRAPE_REMATCH_SWEEP === "1") {
      phases.push(
        await runOrSkipPhase("rematch", "Rematch sweep (unmatched films, capped)", async () => {
          const ok = await runNpmScript("rematch:unmatched", ["--execute", "--limit", "100"]);
          return { ok };
        }),
      );
    } else {
      console.log(
        "[scrape-and-enrich] rematch sweep disabled (set SCRAPE_REMATCH_SWEEP=1 to enable)",
      );
    }
  } else {
    console.log("[scrape-and-enrich] --skip-enrich: skipping enrichment phases");
  }

  // Phase 4: Quarantine detection (always runs — read-only). Reports all
  // three detectors so post-run state is fully visible.
  phases.push(
    await runPhase("health", "Health check (silent-breaker + flaky + yield-drop)", async () => {
      const [breakers, flaky, yieldDrops] = await Promise.all([
        detectSilentBreakers(),
        detectFlakyCinemas(),
        detectYieldDrop(),
      ]);
      health.silentBreakers = breakers;
      health.flaky = flaky;
      health.yieldDrops = yieldDrops;
      console.log(formatQuarantineReport(breakers));
      console.log(formatFlakyReport(flaky));
      console.log(formatYieldDropReport(yieldDrops));
      return {
        ok: true,
        warn: breakers.length > 0 || flaky.length > 0 || yieldDrops.length > 0,
        detail: `${breakers.length} broken, ${flaky.length} flaky, ${yieldDrops.length} yield-drop`,
      };
    }),
  );

  // Phase 5: Per-run delta-vs-baseline report. Quick-win UX surfacer for
  // "this run vs the 7-day mean" — fires after a single below-baseline run,
  // unlike yield-drop which needs a 25-run window. Read-only.
  phases.push(
    await runPhase("yield-delta", "Per-run delta vs 7-day baseline", async () => {
      const deltas = await detectYieldDeltaSinceBaseline();
      health.yieldDeltas = deltas;
      console.log(formatYieldDeltaReport(deltas));
      return { ok: true, warn: deltas.length > 0, detail: `${deltas.length} below baseline` };
    }),
  );

  // Final summary
  const totalMin = (Date.now() - startedAt.getTime()) / 60_000;
  const failedPhases = phases.filter((p) => !p.ok);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`/scrape unified run — finished in ${totalMin.toFixed(1)} min`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const phase of phases) {
    const flag = phase.ok ? (phase.warn ? "⚠" : "✓") : "✗";
    const detail = phase.detail ? ` — ${phase.detail}` : "";
    console.log(`  ${flag} ${phase.label} (${phase.durationMin.toFixed(1)}min)${detail}`);
  }

  // Post-run observability: stale cinemas + recent patrol DQS. Both are
  // read-only and cheap — surface them in the summary so the next /data-check
  // doesn't have to be the first time the user notices a stalled cinema.
  try {
    const [stale, dqs] = await Promise.all([
      detectStaleCinemas(),
      Promise.resolve(readRecentDqs()),
    ]);
    health.stale = toPersistedStale(stale);
    health.dqs = dqs;
    console.log(`\n${formatStaleCinemaReport(stale)}`);
    console.log(formatDqsSnapshot(dqs));
  } catch (err) {
    // Never let observability break the pipeline exit code.
    console.warn("[scrape-and-enrich] post-run report skipped:", err);
  }

  await persistSummary();

  if (failedPhases.length > 0) {
    // Keep the checkpoint: `npm run scrape:unified -- --resume` (same args,
    // within 24h) retries the failed phase(s) without redoing completed work.
    console.log(`\nACTION REQUIRED: ${failedPhases.length} phase(s) failed.`);
    console.log("Retry without redoing completed work: npm run scrape:unified -- --resume");
    process.exit(1);
  } else {
    await clearCheckpoint();
    console.log("\nAll phases OK.");
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error("[scrape-and-enrich] fatal:", err);
  await persistCrashSummary?.().catch(() => {});
  process.exit(1);
});
