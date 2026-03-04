import { sendTieredAlert, type AlertTier } from "./utils/alert-tiers";
import type { VerificationResult } from "./verification";

const CALIBRATION_END = new Date("2026-03-18T00:00:00Z"); // 2 weeks from launch

export async function sendVerificationAlert(result: VerificationResult): Promise<void> {
  if (result.verdict === "pass") return;
  if (result.issues.length === 0) return;

  const isCalibrating = new Date() < CALIBRATION_END;

  // During calibration, only log — don't send alerts
  if (isCalibrating) {
    console.log(`[verification:calibration] ${result.cinemaId}: ${result.verdict}`, result.issues);
    return;
  }

  // Classify verification failures: "fail" is P1 (critical), "warn" is P3
  const tier: AlertTier = result.verdict === "fail" ? "P1" : "P3";

  const issueLines = result.issues
    .map((i) => `- [${i.severity}] ${i.type}: ${i.detail}`)
    .join("\n");

  await sendTieredAlert(tier, {
    taskId: `verification-${result.cinemaId}`,
    runId: result.checkedAt,
    error: `Verdict: ${result.verdict}\n${issueLines}`,
  });
}
