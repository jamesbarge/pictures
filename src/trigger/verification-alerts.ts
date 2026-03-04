import { sendTelegramAlert } from "./utils/telegram";
import type { VerificationResult } from "./verification";

const CALIBRATION_END = new Date("2026-03-18T00:00:00Z"); // 2 weeks from launch

export async function sendVerificationAlert(result: VerificationResult): Promise<void> {
  if (result.verdict === "pass") return;
  if (result.issues.length === 0) return;

  const isCalibrating = new Date() < CALIBRATION_END;

  // During calibration, only log — don't send Telegram
  if (isCalibrating) {
    console.log(`[verification:calibration] ${result.cinemaId}: ${result.verdict}`, result.issues);
    return;
  }

  // Only send immediate alerts for "fail" verdicts
  if (result.verdict !== "fail") return;

  const issueLines = result.issues
    .map((i) => `- [${i.severity}] ${i.type}: ${i.detail}`)
    .join("\n");

  await sendTelegramAlert({
    title: `Scraper Verification: ${result.cinemaId}`,
    message: `Verdict: ${result.verdict}\n\n${issueLines}`,
    level: "error",
  });
}
