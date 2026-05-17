/**
 * End-condition #8: No flaky-critical cinemas.
 *
 * Wraps the ratio-based `detectFlakyCinemas()` detector. Pass when zero
 * cinemas are at severity `critical` (≥50% empty-success across last 10 runs).
 *
 * This catches the BFI-IMAX-style alternating failure mode that the
 * consecutive-zero `detectSilentBreakers` misses — a cinema that goes
 * success+0 / success+N / success+0 / success+N never trips the consecutive
 * check but is clearly broken half the time.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-flaky-cinemas.ts
 */
import { detectFlakyCinemas } from "@/lib/scrape-quarantine";

async function main() {
  const flaky = await detectFlakyCinemas();
  const critical = flaky.filter((f) => f.severity === "critical");
  const warn = flaky.filter((f) => f.severity === "warn");
  const pass = critical.length === 0;

  console.log(
    JSON.stringify(
      {
        condition: "flaky-cinemas",
        pass,
        criticalCount: critical.length,
        warnCount: warn.length,
        critical: critical.map((f) => ({
          name: f.cinemaName,
          totalRuns: f.totalRuns,
          emptyRatio: Math.round(f.emptyRatio * 100),
          failedRatio: Math.round(f.failedRatio * 100),
          reasons: f.reasons,
          lastGood: f.lastGoodRunAt?.toISOString() ?? null,
        })),
        warn: warn.map((f) => ({
          name: f.cinemaName,
          totalRuns: f.totalRuns,
          emptyRatio: Math.round(f.emptyRatio * 100),
          failedRatio: Math.round(f.failedRatio * 100),
          reasons: f.reasons,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ condition: "flaky-cinemas", pass: false, error: String(err).slice(0, 500) }));
  process.exit(1);
});
