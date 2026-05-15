/**
 * End-condition #2: No silent breakers.
 *
 * Wraps `detectSilentBreakers` from `src/lib/scrape-quarantine.ts`.
 *
 * NOTE: When the ratio-based flaky-cinema detector lands on main, extend this
 * script to require `detectFlakyCinemas().filter(f => f.severity === 'critical')`
 * to also be empty. Until then we rely on the consecutive-zero detector only.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-silent-breakers.ts
 */
import { detectSilentBreakers } from "@/lib/scrape-quarantine";

async function main() {
  const silent = await detectSilentBreakers();
  const pass = silent.length === 0;

  console.log(
    JSON.stringify(
      {
        condition: "silent-breakers",
        pass,
        silentBreakers: silent.map((s) => ({
          name: s.cinemaName,
          consecutiveZeroRuns: s.consecutiveZeroRuns,
          lastGood: s.lastSuccessfulRunAt?.toISOString() ?? null,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ condition: "silent-breakers", pass: false, error: String(err) }));
  process.exit(1);
});
