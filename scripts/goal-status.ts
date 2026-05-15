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
  const tick = r.skipped ? "⏭ " : r.pass ? "✅" : "❌";
  const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
  return `${tick}  ${r.label.padEnd(40)} (${dur})`;
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

  const nonSkipped = results.filter((r) => !r.skipped);
  const allPass = nonSkipped.length > 0 && nonSkipped.every((r) => r.pass);

  // Print human-readable table
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Goal status — pictures.london v1");
  console.log("──────────────────────────────────────────────────────────");
  for (const r of results) console.log(fmtRow(r));
  console.log("──────────────────────────────────────────────────────────");
  const verdict = FAST
    ? `${nonSkipped.filter((r) => r.pass).length}/${nonSkipped.length} measured (lighthouse + axe skipped via --fast)`
    : allPass
      ? "🎯 ALL CONDITIONS PASS — goal is ACHIEVED"
      : `${nonSkipped.filter((r) => r.pass).length}/${nonSkipped.length} conditions passing`;
  console.log(`  ${verdict}\n`);

  // Write summary file for /goal slash command to read
  const out = resolve(process.cwd(), ".claude/goal-status.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        fastMode: FAST,
        allPass: !FAST && allPass,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`  Summary → ${out}\n`);

  process.exit(allPass && !FAST ? 0 : 1);
}

main();
