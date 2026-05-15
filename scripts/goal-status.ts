/**
 * Goal status orchestrator.
 *
 * Runs every measurement script declared in tasks/goal.md, prints a single
 * status table to stdout, and writes a machine-readable summary to
 * `.claude/goal-status.json`. Exit code 0 if all conditions pass, 1 otherwise.
 *
 * Lighthouse + axe are slow — pass `--fast` to skip them.
 *
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-status.ts [--fast]
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ConditionResult {
  id: string;
  label: string;
  pass: boolean;
  skipped?: boolean;
  rawJson: unknown;
  durationMs: number;
}

const FAST = process.argv.includes("--fast");

const CONDITIONS: { id: string; label: string; script: string; slow?: boolean }[] = [
  { id: "coverage", label: "1. London independents covered", script: "scripts/goal-check-coverage.ts" },
  { id: "silent-breakers", label: "2. No silent breakers / criticals", script: "scripts/goal-check-silent-breakers.ts" },
  { id: "booking-links", label: "3. Zero broken booking links", script: "scripts/goal-check-booking-links.ts" },
  { id: "lighthouse", label: "4. Lighthouse ≥ 90", script: "scripts/goal-check-lighthouse.ts", slow: true },
  { id: "axe", label: "5. axe-core clean", script: "scripts/goal-check-axe.ts", slow: true },
  { id: "posthog-funnel", label: "6. PostHog booking proof-of-life", script: "scripts/goal-check-posthog-funnel.ts" },
  { id: "dqs", label: "7. DQS floor ≥ 85 × 2 runs", script: "scripts/goal-check-dqs.ts" },
];

function runOne(scriptPath: string): { pass: boolean; raw: unknown; durationMs: number } {
  const started = Date.now();
  const result = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", "-r", "tsconfig-paths/register", scriptPath],
    { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 },
  );
  const durationMs = Date.now() - started;
  // Contract: every measurement script emits its result JSON to stdout (even
  // on failure — main().catch logs via console.log). Stderr is reserved for
  // unstructured diagnostic noise (e.g. npx install banners, child-process
  // stack traces) which can contain its own `{` characters and would
  // otherwise corrupt the parse. Parse stdout only.
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const firstBrace = stdout.indexOf("{");
  let raw: unknown = { pass: false, error: "no JSON on stdout", stderrTail: stderr.slice(-500) };
  if (firstBrace >= 0) {
    try {
      raw = JSON.parse(stdout.slice(firstBrace));
    } catch (err) {
      raw = {
        pass: false,
        error: `Could not parse JSON from script stdout: ${String(err).slice(0, 200)}`,
        stdoutHead: stdout.slice(0, 500),
        stderrTail: stderr.slice(-500),
      };
    }
  }
  const pass = (raw as { pass?: boolean }).pass === true;
  return { pass, raw, durationMs };
}

function fmtRow(r: ConditionResult): string {
  // A "deferred" condition passes the rollup but isn't producing a real
  // quality signal — surface it distinctly so users don't read the ✅ as
  // proof the underlying thing works. See goal-check-posthog-funnel.ts.
  const deferred = (r.rawJson as { deferred?: boolean })?.deferred === true;
  const tick = r.skipped ? "⏭ " : deferred ? "ℹ️ " : r.pass ? "✅" : "❌";
  const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
  const suffix = deferred ? " — deferred" : "";
  return `${tick}  ${r.label.padEnd(40)} (${dur})${suffix}`;
}

function main() {
  const results: ConditionResult[] = [];

  for (const c of CONDITIONS) {
    if (FAST && c.slow) {
      results.push({
        id: c.id,
        label: c.label,
        pass: false,
        skipped: true,
        rawJson: { skipped: true, reason: "--fast" },
        durationMs: 0,
      });
      continue;
    }
    process.stdout.write(`Running ${c.id}...\n`);
    const { pass, raw, durationMs } = runOne(c.script);
    results.push({ id: c.id, label: c.label, pass, rawJson: raw, durationMs });
  }

  const isDeferred = (r: ConditionResult): boolean =>
    (r.rawJson as { deferred?: boolean })?.deferred === true;

  // Annotate each result with its deferred state so the JSON payload reflects
  // it for the /goal slash command's consumption.
  const annotated = results.map((r) => ({ ...r, deferred: isDeferred(r) }));

  const nonSkipped = annotated.filter((r) => !r.skipped);
  const allPass = nonSkipped.length > 0 && nonSkipped.every((r) => r.pass);
  const deferredCount = nonSkipped.filter((r) => r.deferred).length;
  const anyDeferred = deferredCount > 0;
  // A deferred condition is not producing a quality signal — even if every
  // condition technically passes, we MUST NOT print "goal is ACHIEVED" while
  // any deferral is in effect. That would be a dishonest rollup.
  const trulyAchieved = allPass && !anyDeferred && !FAST;

  // Print human-readable table
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Goal status — pictures.london v1");
  console.log("──────────────────────────────────────────────────────────");
  for (const r of annotated) console.log(fmtRow(r));
  console.log("──────────────────────────────────────────────────────────");
  const passing = nonSkipped.filter((r) => r.pass && !r.deferred).length;
  const verdict = FAST
    ? `${nonSkipped.filter((r) => r.pass).length}/${nonSkipped.length} measured (lighthouse + axe skipped via --fast)` +
      (anyDeferred ? `, ${deferredCount} deferred` : "")
    : trulyAchieved
      ? "🎯 ALL CONDITIONS PASS — goal is ACHIEVED"
      : allPass && anyDeferred
        ? `${passing}/${nonSkipped.length} passing, ${deferredCount} deferred — not yet achieved (deferred conditions don't count toward achievement)`
        : `${nonSkipped.filter((r) => r.pass).length}/${nonSkipped.length} conditions passing` +
          (anyDeferred ? ` (${deferredCount} of those deferred)` : "");
  console.log(`  ${verdict}\n`);

  // Write summary file for /goal slash command to read
  const out = resolve(process.cwd(), ".claude/goal-status.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        fastMode: FAST,
        allPass: trulyAchieved,
        anyDeferred,
        deferredCount,
        results: annotated,
      },
      null,
      2,
    ),
  );
  console.log(`  Summary → ${out}\n`);

  process.exit(trulyAchieved ? 0 : 1);
}

main();
