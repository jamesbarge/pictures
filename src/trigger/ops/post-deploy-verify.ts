/**
 * Post-Deploy Verification Task
 *
 * Runs after every Vercel production deploy to verify the app is healthy.
 * Triggered via GitHub Actions deployment_status webhook.
 */

import { task } from "@trigger.dev/sdk/v3";
import { db } from "@/db";
import { screenings } from "@/db/schema";
import { gte, count } from "drizzle-orm";
import { sendTelegramAlert } from "../utils/telegram";

interface DeployPayload {
  deploymentUrl?: string;
  environment?: string;
  commitSha?: string;
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export const postDeployVerify = task({
  id: "post-deploy-verify",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: DeployPayload) => {
    const baseUrl = payload.deploymentUrl || "https://pictures.london";
    const checks: CheckResult[] = [];
    const startTime = Date.now();

    console.log(`[deploy-verify] Verifying ${baseUrl} (commit: ${payload.commitSha?.slice(0, 7) ?? "unknown"})`);

    // ── Check 1: Homepage responds ───────────────────────────────
    const homeStart = Date.now();
    try {
      const res = await fetch(baseUrl, { redirect: "follow" });
      const html = await res.text();
      const hasContent = html.includes("</html>") && html.length > 1000;
      checks.push({
        name: "Homepage",
        passed: res.ok && hasContent,
        detail: `${res.status} (${html.length} bytes)`,
        durationMs: Date.now() - homeStart,
      });
    } catch (err) {
      checks.push({
        name: "Homepage",
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - homeStart,
      });
    }

    // ── Check 2: API returns valid screenings ────────────────────
    const apiStart = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/screenings`);
      const data = await res.json();
      const hasScreenings = Array.isArray(data) && data.length > 0;
      checks.push({
        name: "Screenings API",
        passed: res.ok && hasScreenings,
        detail: `${res.status} (${Array.isArray(data) ? data.length : 0} screenings)`,
        durationMs: Date.now() - apiStart,
      });
    } catch (err) {
      checks.push({
        name: "Screenings API",
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - apiStart,
      });
    }

    // ── Check 3: DB connectivity ─────────────────────────────────
    const dbStart = Date.now();
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const result = await db
        .select({ total: count() })
        .from(screenings)
        .where(
          gte(screenings.datetime, today),
        );

      const total = result[0]?.total ?? 0;
      checks.push({
        name: "Database",
        passed: total > 0,
        detail: `${total} screenings from today onwards`,
        durationMs: Date.now() - dbStart,
      });
    } catch (err) {
      checks.push({
        name: "Database",
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - dbStart,
      });
    }

    // ── Report ───────────────────────────────────────────────────
    const allPassed = checks.every((c) => c.passed);
    const totalMs = Date.now() - startTime;

    const lines = checks.map((c) => {
      const icon = c.passed ? "OK" : "FAIL";
      return `  ${icon} ${c.name}: ${c.detail} (${c.durationMs}ms)`;
    });

    const commitLabel = payload.commitSha ? ` [${payload.commitSha.slice(0, 7)}]` : "";
    const message = [
      `Deploy verification${commitLabel} — ${allPassed ? "all checks passed" : "ISSUES DETECTED"}`,
      "",
      ...lines,
      "",
      `Total: ${totalMs}ms`,
    ].join("\n");

    await sendTelegramAlert({
      title: allPassed ? "Deploy OK" : "Deploy Verify FAILED",
      message,
      level: allPassed ? "info" : "error",
    });

    console.log(`[deploy-verify] ${allPassed ? "All passed" : "FAILURES"} in ${totalMs}ms`);

    return {
      allPassed,
      checks,
      totalMs,
      commitSha: payload.commitSha,
    };
  },
});
