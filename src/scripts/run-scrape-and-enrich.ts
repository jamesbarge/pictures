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
import { detectSilentBreakers, formatQuarantineReport } from "@/lib/scrape-quarantine";

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
  // cinemas have been silently broken for ≥2 runs BEFORE they sit through
  // a 30-60 min /scrape that just re-runs them. Always runs.
  phases.push(
    await runPhase("Pre-flight (silent-breaker check)", async () => {
      const breakers = await detectSilentBreakers();
      if (breakers.length === 0) {
        console.log("[pre-flight] No silently-broken cinemas detected — proceeding.");
      } else {
        console.log(formatQuarantineReport(breakers));
        console.log(
          `[pre-flight] ${breakers.length} cinema(s) above. Consider \`/scrape-one <slug>\` ` +
            "to investigate before starting a full run.",
        );
      }
      return { ok: true, detail: `${breakers.length} flagged` };
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

  // Phase 4: Quarantine detection (always runs — read-only)
  phases.push(
    await runPhase("Health check (silent-breaker detection)", async () => {
      const breakers = await detectSilentBreakers();
      const report = formatQuarantineReport(breakers);
      console.log(report);
      return { ok: true, detail: `${breakers.length} cinemas flagged` };
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
