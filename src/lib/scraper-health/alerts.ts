/**
 * Health Alert Service
 *
 * Sends alerts via Slack webhook when health issues are detected.
 * Health snapshots are stored in the health_snapshots table (see index.ts).
 */

import type { HealthCheckResult, HealthAlert } from "./index";
import { HEALTH_THRESHOLDS } from "@/db/schema/health-snapshots";

// ============================================================================
// Types
// ============================================================================

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

interface SlackMessage {
  blocks: SlackBlock[];
  text: string; // Fallback text
}

// ============================================================================
// Alert Functions
// ============================================================================

/**
 * Send health check results to Slack
 */
export async function sendHealthAlerts(result: HealthCheckResult): Promise<void> {
  // Only send alerts if there are critical or warning issues
  if (result.alerts.length === 0) {
    console.log("[health-alerts] No alerts to send");
    return;
  }

  // Send Slack notification if webhook is configured
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhookUrl) {
    await sendSlackNotification(slackWebhookUrl, result);
  } else {
    console.log("[health-alerts] Slack webhook not configured, skipping notification");
    // Log alerts to console for visibility
    for (const alert of result.alerts) {
      const icon = alert.alertType.startsWith("critical") ? "[CRITICAL]" : "[WARNING]";
      console.log(`[health-alerts] ${icon} ${alert.message}`);
    }
  }
}

/**
 * Send health check summary to Slack
 */
async function sendSlackNotification(
  webhookUrl: string,
  result: HealthCheckResult
): Promise<void> {
  const criticalAlerts = result.alerts.filter((a) => a.alertType.startsWith("critical"));
  const warningAlerts = result.alerts.filter((a) => a.alertType.startsWith("warning") || a.alertType === "anomaly");

  // Build Slack message
  const message = buildSlackMessage(result, criticalAlerts, warningAlerts);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`[health-alerts] Slack webhook failed: ${response.status}`);
    } else {
      console.log("[health-alerts] Slack notification sent successfully");
    }
  } catch (error) {
    console.error("[health-alerts] Failed to send Slack notification:", error);
  }
}

/**
 * Build Slack message with blocks
 */
function buildSlackMessage(
  result: HealthCheckResult,
  criticalAlerts: HealthAlert[],
  warningAlerts: HealthAlert[]
): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header
  const emoji = criticalAlerts.length > 0 ? ":rotating_light:" : ":warning:";
  const status = criticalAlerts.length > 0 ? "Critical Issues Detected" : "Health Warnings";

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `${emoji} Scraper Health: ${status}`,
      emoji: true,
    },
  });

  // Summary
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Total Cinemas:*\n${result.totalCinemas}`,
      },
      {
        type: "mrkdwn",
        text: `*Healthy:*\n${result.healthyCinemas}`,
      },
      {
        type: "mrkdwn",
        text: `*Warnings:*\n${result.warnCinemas}`,
      },
      {
        type: "mrkdwn",
        text: `*Critical:*\n${result.criticalCinemas}`,
      },
    ],
  });

  // Critical alerts
  if (criticalAlerts.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:rotating_light: Critical Issues:*\n" +
          criticalAlerts.map((a) => `• ${a.message}`).join("\n"),
      },
    });
  }

  // Warning alerts (limit to top 5)
  if (warningAlerts.length > 0) {
    const displayAlerts = warningAlerts.slice(0, 5);
    const remaining = warningAlerts.length - displayAlerts.length;

    let text = "*:warning: Warnings:*\n" +
      displayAlerts.map((a) => `• ${a.message}`).join("\n");

    if (remaining > 0) {
      text += `\n_... and ${remaining} more_`;
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text,
      },
    });
  }

  // Thresholds info
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Thresholds: Critical stale >${HEALTH_THRESHOLDS.CRITICAL_STALE_HOURS}h | Warning stale >${HEALTH_THRESHOLDS.WARNING_STALE_HOURS}h | Low volume <${HEALTH_THRESHOLDS.WARNING_VOLUME_PERCENT}% of chain median`,
      },
    ],
  });

  const fallbackText = criticalAlerts.length > 0
    ? `Scraper Health Alert: ${criticalAlerts.length} critical issues detected`
    : `Scraper Health Warning: ${warningAlerts.length} warnings`;

  return {
    blocks,
    text: fallbackText,
  };
}

// ============================================================================
// Summary Functions
// ============================================================================

/**
 * Generate a text summary for logging
 */
export function generateHealthSummary(result: HealthCheckResult): string {
  const lines: string[] = [
    `=== Scraper Health Check ===`,
    `Time: ${result.timestamp.toISOString()}`,
    `Total: ${result.totalCinemas} | Healthy: ${result.healthyCinemas} | Warning: ${result.warnCinemas} | Critical: ${result.criticalCinemas}`,
  ];

  if (result.alerts.length > 0) {
    lines.push(`\nAlerts (${result.alerts.length}):`);
    for (const alert of result.alerts) {
      const icon = alert.alertType.startsWith("critical") ? "[CRITICAL]" : "[WARNING]";
      lines.push(`  ${icon} ${alert.message}`);
    }
  }

  return lines.join("\n");
}
