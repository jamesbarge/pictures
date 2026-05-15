/**
 * End-condition #5: axe-core clean.
 *
 * Shells out to `npx @axe-core/cli` against pictures.london at mobile + desktop
 * viewports. No dep added — npx fetches axe-core/cli on demand (cached after
 * first run).
 *
 * Passes when there are zero violations at impact `critical` or `serious`
 * across both viewport runs.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-axe.ts
 */
import { execFileSync } from "node:child_process";

const TARGET_URL = process.env.GOAL_AXE_URL ?? "https://pictures.london/";

interface AxeViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  help: string;
  nodes: { html: string }[];
}

interface AxeResult {
  violations: AxeViolation[];
}

function runAxe(viewport: "mobile" | "desktop"): AxeViolation[] {
  // axe-core/cli supports --chromedriver-path, but we let it use Chromium
  // bundled with Playwright. Pass viewport via `--browser`-args isn't directly
  // supported; instead we use a Chrome window size flag via --chrome-options.
  // The CLI's `--save` writes JSON to disk; we use stdout via --stdout.
  const windowSize = viewport === "mobile" ? "390,844" : "1280,800";
  const args = [
    "-y",
    "@axe-core/cli@4",
    TARGET_URL,
    "--stdout",
    "--exit",
    "--tags",
    "wcag2a,wcag2aa,wcag21a,wcag21aa",
    "--chrome-options",
    `headless=new,window-size=${windowSize},no-sandbox`,
  ];

  let stdout = "";
  try {
    stdout = execFileSync("npx", args, {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err: unknown) {
    // axe-core/cli exits non-zero when violations exist; that's expected.
    const e = err as { stdout?: Buffer | string };
    stdout = typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString("utf-8") ?? "");
  }

  // The CLI emits a mix of human-readable and JSON. Find the JSON block.
  const jsonStart = stdout.indexOf("[");
  if (jsonStart < 0) {
    throw new Error(`axe-core/cli produced no JSON output (got ${stdout.length} chars)`);
  }
  const arr = JSON.parse(stdout.slice(jsonStart)) as AxeResult[];
  return arr.flatMap((r) => r.violations);
}

async function main() {
  if (process.env.GOAL_SKIP_AXE === "1") {
    console.log(JSON.stringify({ condition: "axe", pass: false, skipped: true, reason: "GOAL_SKIP_AXE=1" }, null, 2));
    process.exit(1);
  }

  const mobile = runAxe("mobile");
  const desktop = runAxe("desktop");
  const combined = [...mobile, ...desktop];
  const blockers = combined.filter((v) => v.impact === "critical" || v.impact === "serious");
  const pass = blockers.length === 0;

  const summarise = (vs: AxeViolation[]) => {
    const by = new Map<string, { impact: string; help: string; count: number }>();
    for (const v of vs) {
      const cur = by.get(v.id) ?? { impact: v.impact ?? "unknown", help: v.help, count: 0 };
      cur.count += v.nodes.length;
      by.set(v.id, cur);
    }
    return Array.from(by.entries()).map(([id, b]) => ({ id, ...b }));
  };

  console.log(
    JSON.stringify(
      {
        condition: "axe",
        pass,
        target: TARGET_URL,
        blockerCount: blockers.length,
        blockers: summarise(blockers).slice(0, 20),
        mobileSummary: summarise(mobile).slice(0, 10),
        desktopSummary: summarise(desktop).slice(0, 10),
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ condition: "axe", pass: false, error: String(err).slice(0, 500) }));
  process.exit(1);
});
