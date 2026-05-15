/**
 * Unified scrape + enrichment orchestrator — single entry point for the
 * `/scrape` slash command.
 *
 * Replaces the 4-script manual sequence (`scrape:all` → `cleanup:upcoming`
 * → `audit:films` → `agents:fallback-enrich`) with one ordered run:
 *   1. runScrapeAll()         — fans out 26 scrapers in 4 waves (existing)
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
 */

import { spawn } from "node:child_process";
import { runScrapeAll } from "@/lib/jobs/scrape-all";
import {
  detectSilentBreakers,
  formatQuarantineReport,
  detectFlakyCinemas,
  formatFlakyReport,
  detectYieldDrop,
  formatYieldDropReport,
  detectStaleCinemas,
  formatStaleCinemaReport,
  readRecentDqs,
  formatDqsSnapshot,
} from "@/lib/scrape-quarantine";

const SKIP_SCRAPE = process.argv.includes("--skip-scrape");
const SKIP_ENRICH = process.argv.includes("--skip-enrich");

interface PhaseResult {
  label: string;
  ok: boolean;
  durationMin: number;
  detail?: string;
}

function fmtSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
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
  label: string,
  fn: () => Promise<{ ok: boolean; detail?: string }>,
): Promise<PhaseResult> {
  const start = Date.now();
  console.log(`\n━━━ ${label} ━━━`);
  try {
    const { ok, detail } = await fn();
    const durationMin = (Date.now() - start) / 60_000;
    console.log(`[${label}] ${ok ? "OK" : "FAILED"} — ${fmtSeconds(Date.now() - start)}`);
    return { label, ok, durationMin, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${label}] threw: ${message}`);
    return {
      label,
      ok: false,
      durationMin: (Date.now() - start) / 60_000,
      detail: message,
    };
  }
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const phases: PhaseResult[] = [];

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
    await runPhase("Pre-flight (silent-breaker + flaky + yield-drop check)", async () => {
      const [breakers, flaky, yieldDrops] = await Promise.all([
        detectSilentBreakers(),
        detectFlakyCinemas(),
        detectYieldDrop(),
      ]);
      const total = breakers.length + flaky.length + yieldDrops.length;
      if (total === 0) {
        console.log("[pre-flight] No broken, flaky, or yield-dropping cinemas detected — proceeding.");
      } else {
        if (breakers.length > 0) console.log(formatQuarantineReport(breakers));
        if (flaky.length > 0) console.log(formatFlakyReport(flaky));
        if (yieldDrops.length > 0) console.log(formatYieldDropReport(yieldDrops));
        console.log(
          `[pre-flight] ${total} cinema signal(s) above. Consider \`/scrape-one <slug>\` ` +
            "to investigate before starting a full run.",
        );
      }
      return {
        ok: true,
        detail: `${breakers.length} broken, ${flaky.length} flaky, ${yieldDrops.length} yield-drop`,
      };
    }),
  );

  // Phase 1: Scrape (unless skipped)
  if (!SKIP_SCRAPE) {
    phases.push(
      await runPhase("Scrape (all cinemas, 4 waves)", async () => {
        const result = await runScrapeAll();
        const detail = `${result.totalSucceeded} ok / ${result.totalFailed} failed across ${result.waves.length} waves`;
        return { ok: result.totalFailed === 0, detail };
      }),
    );
  } else {
    console.log("[scrape-and-enrich] --skip-scrape: skipping Phase 1");
  }

  // Phase 2-3: Enrichment (unless skipped)
  if (!SKIP_ENRICH) {
    phases.push(
      await runPhase("Cleanup upcoming films (4 sub-phases)", async () => {
        const ok = await runNpmScript("cleanup:upcoming");
        return { ok };
      }),
    );
    phases.push(
      await runPhase("Audit films (validation pass)", async () => {
        const ok = await runNpmScript("audit:films");
        return { ok };
      }),
    );
  } else {
    console.log("[scrape-and-enrich] --skip-enrich: skipping enrichment phases");
  }

  // Phase 4: Quarantine detection (always runs — read-only). Reports all
  // three detectors so post-run state is fully visible.
  phases.push(
    await runPhase("Health check (silent-breaker + flaky + yield-drop)", async () => {
      const [breakers, flaky, yieldDrops] = await Promise.all([
        detectSilentBreakers(),
        detectFlakyCinemas(),
        detectYieldDrop(),
      ]);
      console.log(formatQuarantineReport(breakers));
      console.log(formatFlakyReport(flaky));
      console.log(formatYieldDropReport(yieldDrops));
      return {
        ok: true,
        detail: `${breakers.length} broken, ${flaky.length} flaky, ${yieldDrops.length} yield-drop`,
      };
    }),
  );

  // Final summary
  const totalMin = (Date.now() - startedAt.getTime()) / 60_000;
  const failedPhases = phases.filter((p) => !p.ok);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`/scrape unified run — finished in ${totalMin.toFixed(1)} min`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const phase of phases) {
    const flag = phase.ok ? "✓" : "✗";
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
    console.log(`\n${formatStaleCinemaReport(stale)}`);
    console.log(formatDqsSnapshot(dqs));
  } catch (err) {
    // Never let observability break the pipeline exit code.
    console.warn("[scrape-and-enrich] post-run report skipped:", err);
  }

  if (failedPhases.length > 0) {
    console.log(`\nACTION REQUIRED: ${failedPhases.length} phase(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll phases OK.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[scrape-and-enrich] fatal:", err);
  process.exit(1);
});
