import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTelegramAlert } from "./telegram";

const originalFetch = globalThis.fetch;

describe("sendTelegramAlert", () => {
  let savedToken: string | undefined;
  let savedChatId: string | undefined;

  beforeEach(() => {
    savedToken = process.env.TELEGRAM_BOT_TOKEN;
    savedChatId = process.env.TELEGRAM_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = savedChatId;
    globalThis.fetch = originalFetch;
  });

  it("returns true and POSTs to Telegram API when credentials present and API returns ok", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = mock;

    const result = await sendTelegramAlert({
      title: "Hello",
      message: "World",
    });

    expect(result).toBe(true);
    expect(mock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes chat_id, MarkdownV2 parse_mode, and the formatted text in the request body", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;

    await sendTelegramAlert({ title: "Title", message: "Body", level: "warn" });

    const [, opts] = mock.mock.calls[0];
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.chat_id).toBe("test-chat");
    expect(body.parse_mode).toBe("MarkdownV2");
    // Title should be wrapped in *bold* and prefixed with the warn emoji.
    expect(body.text).toMatch(/^⚠️ \*Title\*/);
    expect(body.text).toContain("Body");
  });

  it("uses 'info' emoji by default when level not supplied", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;

    await sendTelegramAlert({ title: "X", message: "Y" });

    const body = JSON.parse((mock.mock.calls[0][1] as { body: string }).body);
    expect(body.text.startsWith("ℹ️")).toBe(true);
  });

  it("uses 🚨 emoji for level=error", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;

    await sendTelegramAlert({ title: "X", message: "Y", level: "error" });

    const body = JSON.parse((mock.mock.calls[0][1] as { body: string }).body);
    expect(body.text.startsWith("🚨")).toBe(true);
  });

  it("escapes MarkdownV2 special chars in both title and message", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;

    await sendTelegramAlert({
      title: "Hello (world)",
      message: "Cost: $5.99",
    });

    const body = JSON.parse((mock.mock.calls[0][1] as { body: string }).body);
    // `(`, `)`, `.`, are MarkdownV2 reserved chars — should be backslash-escaped.
    expect(body.text).toContain("Hello \\(world\\)");
    expect(body.text).toContain("Cost: $5\\.99");
  });

  it("returns false (no fetch) when TELEGRAM_BOT_TOKEN is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const mock = vi.fn();
    globalThis.fetch = mock;

    const result = await sendTelegramAlert({ title: "X", message: "Y" });
    expect(result).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it("returns false (no fetch) when TELEGRAM_CHAT_ID is missing", async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    const mock = vi.fn();
    globalThis.fetch = mock;

    const result = await sendTelegramAlert({ title: "X", message: "Y" });
    expect(result).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it("returns false when the API returns non-2xx", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Bad request", { status: 400 }));

    const result = await sendTelegramAlert({ title: "X", message: "Y" });
    expect(result).toBe(false);
  });

  it("returns false when fetch throws (network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await sendTelegramAlert({ title: "X", message: "Y" });
    expect(result).toBe(false);
  });
});
