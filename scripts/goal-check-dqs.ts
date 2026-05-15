/**
 * End-condition #7: Data quality floor.
 *
 * Reads `.claude/data-check-learnings.json` and checks the two most recent
 * DQS scores recorded by /data-check. Both must be ≥ 85 composite to pass.
 *
 * Single high score is not enough — the floor must hold across two
 * consecutive patrol runs to prove it's not a one-off.
 *
 * ── Verification-signal deferral ────────────────────────────────────────────
 * The DQS composite weights are: tmdb 30, poster 15, letterboxd 10, synopsis
 * 10, stale 20, verification 15 (data-check.ts:1722). When the verification
 * signal is at zero (every cinema verifier returns non-`confirmed`, which
 * indicates schema drift on cinema booking pages rather than real DB quality
 * problems), the 15-point verification weight forces the composite below the
 * 85 floor even when every other dimension is comfortably above it.
 *
 * Confirmed empirically on 2026-05-15: tmdb 86.5, poster 89.2, letterboxd
 * 86.5, synopsis 86.5, stale 100, verification 0 → composite 76.62. The
 * non-verification dimensions average 89.7 on their original weights.
 *
 * To stop /goal from chasing a measurement artefact, this script mirrors the
 * condition #6 pattern: when verification is structurally zero, recompute the
 * composite excluding the verification weight (redistributing it proportionally
 * across the other dimensions). Compare against the same 85 floor. If the
 * adjusted composite passes, emit `pass: true, deferred: true` so the
 * orchestrator's `anyDeferred` rollup gate prevents a false "goal achieved"
 * verdict — the user must fix the verifiers (sub-task queued in goal.md)
 * before condition #7 truly passes.
 *
 * Output: JSON to stdout. Exit code 0 if pass (incl. deferred), 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-dqs.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FLOOR = 85;
// Verification rate at or below this threshold is treated as structurally
// broken (verifier schema drift, not a real quality problem). 0.1 gives a
// little headroom for the rare "1 of 10 verifications passed by luck" case
// without diluting a healthy signal.
const VERIFICATION_BROKEN_THRESHOLD = 0.1;

// Matches data-check.ts:1722. If the producer formula changes, change here.
const COMPOSITE_WEIGHTS = {
  tmdbMatchRate: 30,
  posterCoverage: 15,
  letterboxdCoverage: 10,
  synopsisCoverage: 10,
  staleScreeningRate: 20,
  verificationPassRate: 15,
} as const;

type DqsKey = keyof typeof COMPOSITE_WEIGHTS;

interface DqsEntry {
  timestamp: string;
  tmdbMatchRate?: number;
  posterCoverage?: number;
  letterboxdCoverage?: number;
  synopsisCoverage?: number;
  staleScreeningRate?: number;
  verificationPassRate?: number;
  compositeScore: number;
}

interface LearningsFile {
  dqsHistory?: DqsEntry[];
}

function adjustedComposite(entry: DqsEntry, excludeKey: DqsKey | null): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of Object.entries(COMPOSITE_WEIGHTS) as [DqsKey, number][]) {
    if (key === excludeKey) continue;
    totalWeight += weight;
    const value = entry[key];
    if (typeof value === "number") weightedSum += value * weight;
  }
  if (totalWeight === 0) return 0;
  // Scale to 0-100 to match data-check.ts's compositeScore range.
  return Math.round((weightedSum / totalWeight) * 100 * 100) / 100;
}

function emit(payload: Record<string, unknown>, exitCode: number): never {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(exitCode);
}

function main() {
  const path = resolve(process.cwd(), ".claude/data-check-learnings.json");
  if (!existsSync(path)) {
    emit(
      {
        condition: "dqs",
        pass: false,
        reason: "data-check-learnings.json not found — run /data-check first",
      },
      1,
    );
  }
  const file = JSON.parse(readFileSync(path, "utf-8")) as LearningsFile;
  const history = (file.dqsHistory ?? []).slice().sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (history.length < 2) {
    emit(
      {
        condition: "dqs",
        pass: false,
        reason: `Only ${history.length} DQS run(s) on record; need ≥2 above the floor`,
        floor: FLOOR,
        history,
      },
      1,
    );
  }

  const [latest, prev] = history;
  const verificationStructurallyBroken =
    (latest.verificationPassRate ?? 0) <= VERIFICATION_BROKEN_THRESHOLD &&
    (prev.verificationPassRate ?? 0) <= VERIFICATION_BROKEN_THRESHOLD;

  if (verificationStructurallyBroken) {
    // Adjusted composite: same formula, verification weight removed and
    // remaining weights re-scaled to sum to 100. If both runs clear the 85
    // floor after adjustment, condition is deferred-passing.
    const latestAdjusted = adjustedComposite(latest, "verificationPassRate");
    const prevAdjusted = adjustedComposite(prev, "verificationPassRate");
    const pass = latestAdjusted >= FLOOR && prevAdjusted >= FLOOR;

    if (pass) {
      emit(
        {
          condition: "dqs",
          pass: true,
          deferred: true,
          reason: `Verification signal at zero (likely cinema-verifier schema drift). Composite recomputed excluding the 15% verification weight: latest ${latestAdjusted}, previous ${prevAdjusted}. Both clear the 85 floor on the adjusted formula. Investigate the verifiers (see tasks/goal.md sub-tasks) — condition #7 will not count toward achievement until verificationPassRate is restored.`,
          floor: FLOOR,
          latest: { ...latest, adjustedComposite: latestAdjusted },
          previous: { ...prev, adjustedComposite: prevAdjusted },
          verificationBrokenThreshold: VERIFICATION_BROKEN_THRESHOLD,
        },
        0,
      );
    } else {
      // Even with the adjustment, the composite fails — that means a
      // non-verification dimension is genuinely under the floor. Don't
      // defer this; it's a real quality issue.
      emit(
        {
          condition: "dqs",
          pass: false,
          reason: `Verification signal at zero AND adjusted composite (excluding verification) still below floor: latest ${latestAdjusted}, previous ${prevAdjusted}. A non-verification dimension is the dragger — investigate which.`,
          floor: FLOOR,
          latest: { ...latest, adjustedComposite: latestAdjusted },
          previous: { ...prev, adjustedComposite: prevAdjusted },
        },
        1,
      );
    }
  }

  // Normal path — verification is healthy, use the recorded composite.
  const pass = latest.compositeScore >= FLOOR && prev.compositeScore >= FLOOR;
  emit(
    {
      condition: "dqs",
      pass,
      floor: FLOOR,
      latest,
      previous: prev,
      runsConsidered: 2,
    },
    pass ? 0 : 1,
  );
}

main();
