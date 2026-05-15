/**
 * End-condition #4: Lighthouse mobile ≥ 90 (perf, a11y, SEO).
 *
 * Shells out to `npx lighthouse@12` for mobile + desktop presets against
 * https://pictures.london/. No dep added — npx fetches lighthouse on demand
 * (cached after first run).
 *
 * Passes when both runs score ≥ 90 on performance, accessibility, and SEO.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-lighthouse.ts
 *
 * NOTE: Lighthouse is slow (~30-60s per run × 2). The `/goal` orchestrator
 * can call this less often than other checks. Skipped automatically with the
 * `GOAL_SKIP_LIGHTHOUSE=1` env var if you need fast iterations.
 */
import { execFileSync } from "node:child_process";

const TARGET_URL = process.env.GOAL_LIGHTHOUSE_URL ?? "https://pictures.london/";
const THRESHOLD = 90;

interface CategoryScore {
  performance: number;
  accessibility: number;
  seo: number;
}

interface LighthouseJSON {
  categories: {
    performance: { score: number | null };
    accessibility: { score: number | null };
    seo: { score: number | null };
  };
}

function runLighthouse(preset: "mobile" | "desktop"): CategoryScore {
  const args = [
    "-y",
    "lighthouse@12",
    TARGET_URL,
    "--output=json",
    "--quiet",
    "--chrome-flags=--headless=new --no-sandbox",
    `--preset=${preset === "desktop" ? "desktop" : "perf"}`,
    "--only-categories=performance,accessibility,seo",
  ];
  // For mobile preset, lighthouse uses defaults (which is mobile). For desktop,
  // --preset=desktop is the canonical flag.
  if (preset === "mobile") {
    // remove the `--preset=perf` we added above and let mobile be the default
    const idx = args.indexOf("--preset=perf");
    if (idx >= 0) args.splice(idx, 1);
  }

  const stdout = execFileSync("npx", args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed = JSON.parse(stdout) as LighthouseJSON;
  return {
    performance: Math.round((parsed.categories.performance.score ?? 0) * 100),
    accessibility: Math.round((parsed.categories.accessibility.score ?? 0) * 100),
    seo: Math.round((parsed.categories.seo.score ?? 0) * 100),
  };
}

async function main() {
  if (process.env.GOAL_SKIP_LIGHTHOUSE === "1") {
    console.log(JSON.stringify({ condition: "lighthouse", pass: false, skipped: true, reason: "GOAL_SKIP_LIGHTHOUSE=1" }, null, 2));
    process.exit(1);
  }

  const mobile = runLighthouse("mobile");
  const desktop = runLighthouse("desktop");
  const allScores = [mobile.performance, mobile.accessibility, mobile.seo, desktop.performance, desktop.accessibility, desktop.seo];
  const pass = allScores.every((s) => s >= THRESHOLD);
  const lowest = Math.min(...allScores);

  console.log(
    JSON.stringify(
      {
        condition: "lighthouse",
        pass,
        threshold: THRESHOLD,
        lowest,
        target: TARGET_URL,
        mobile,
        desktop,
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ condition: "lighthouse", pass: false, error: String(err).slice(0, 500) }));
  process.exit(1);
});
