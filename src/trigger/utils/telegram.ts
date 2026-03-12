type AlertLevel = "info" | "warn" | "error";

const EMOJI: Record<AlertLevel, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
};

/** Send a formatted alert to the configured Telegram chat. Returns false if credentials are missing or the request fails. */
export async function sendTelegramAlert(params: {
  title: string;
  message: string;
  level?: AlertLevel;
}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert");
    return false;
  }

  const level = params.level ?? "info";
  const text = `${EMOJI[level]} *${escapeMarkdown(params.title)}*\n\n${escapeMarkdown(params.message)}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
      }),
    });
    if (!res.ok) {
      console.error(`[telegram] API error: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] Failed to send alert:", err);
    return false;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
