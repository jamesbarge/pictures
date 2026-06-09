import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const defaultDryScripts = [
  "scripts/audit-and-fix-upcoming.ts",
  "scripts/patrol-autofix.ts",
  "scripts/fix-contaminated-booking-urls.ts",
  "scripts/fix-contaminated-booking-urls-v2.ts",
  "scripts/fix-title-mismatches.ts",
  "scripts/fix-non-film-content.ts",
  "src/scripts/poster-audit-and-fix.ts",
  "src/scripts/enrich-upcoming-films.ts",
  "src/scripts/cleanup-upcoming-films.ts",
  "src/scripts/reprocess-suspicious-matches.ts",
];

const removedHazardousScripts = [
  "scripts/merge-duplicate-films.ts",
  "scripts/fix-pcc-time-and-dupes.ts",
  "scripts/manual-title-fixes.ts",
  "src/scripts/cleanup-feb-films.ts",
  "scripts/test-bfi-cleanup.ts",
];

describe("destructive script guards", () => {
  it.each(defaultDryScripts)("%s requires the shared --execute opt-in", (file) => {
    const source = readFileSync(resolve(root, file), "utf8");

    expect(source).toContain('includes("--execute")');
    expect(source).not.toMatch(
      /(?:DRY_RUN|dryRun)\s*=\s*(?:args|process\.argv).*includes\("--dry-run"\)/,
    );
  });

  it.each(removedHazardousScripts)("%s is no longer tracked", (file) => {
    expect(existsSync(resolve(root, file))).toBe(false);
  });

  it("exposes the safe audit command and removes the obsolete February cleanup command", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["audit:fix-upcoming"]).toContain(
      "scripts/audit-and-fix-upcoming.ts",
    );
    expect(packageJson.scripts["cleanup:feb-films"]).toBeUndefined();
  });
});
