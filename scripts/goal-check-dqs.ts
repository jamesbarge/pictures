/**
 * End-condition #7: Data quality floor.
 *
 * Reads `.claude/data-check-learnings.json` and checks the two most recent
 * DQS scores recorded by /data-check. Both must be ≥ 85 composite for pass.
 *
 * Single high score is not enough — the floor must hold across two
 * consecutive patrol runs to prove it's not a one-off.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-dqs.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FLOOR = 85;

interface LearningsFile {
  dqsHistory?: { timestamp: string; compositeScore: number }[];
}

function main() {
  const path = resolve(process.cwd(), ".claude/data-check-learnings.json");
  if (!existsSync(path)) {
    console.log(
      JSON.stringify(
        {
          condition: "dqs",
          pass: false,
          reason: "data-check-learnings.json not found — run /data-check first",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(path, "utf-8")) as LearningsFile;
  const history = (file.dqsHistory ?? []).slice().sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (history.length < 2) {
    console.log(
      JSON.stringify(
        {
          condition: "dqs",
          pass: false,
          reason: `Only ${history.length} DQS run(s) on record; need ≥2 above the floor`,
          floor: FLOOR,
          history,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const [latest, prev] = history;
  const pass = latest.compositeScore >= FLOOR && prev.compositeScore >= FLOOR;

  console.log(
    JSON.stringify(
      {
        condition: "dqs",
        pass,
        floor: FLOOR,
        latest,
        previous: prev,
        runsConsidered: 2,
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main();
