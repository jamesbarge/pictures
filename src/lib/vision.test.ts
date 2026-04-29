/**
 * Unit tests for src/lib/vision.ts — the DeepSeek-OCR via Ollama bridge.
 *
 * Pure HTTP module with one filesystem read; mock both via vi.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use a real temp file rather than mocking fs/promises — the source module
// imports `readFile` from `node:fs/promises` at load time, and reliably
// hooking that across vitest's ESM resolution adds more friction than it
// saves. A 4-byte temp PNG is plenty for the body to read and base64-encode.
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkOllamaHealth, extractScreeningsFromScreenshot } from "./vision";

let tmpImagePath: string;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  const dir = mkdtempSync(join(tmpdir(), "vision-test-"));
  tmpImagePath = join(dir, "page.png");
  writeFileSync(tmpImagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  // Clear any env-var overrides between tests
  delete process.env.OLLAMA_VISION_MODEL;
  delete process.env.OLLAMA_URL;
});

afterEach(() => {
  vi.useRealTimers();
  try { unlinkSync(tmpImagePath); } catch { /* swept */ }
});

describe("extractScreeningsFromScreenshot", () => {
  it("posts base64 image + json mode to /api/generate and parses screenings", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            screenings: [
              { title: "Amélie", datetime: "2026-04-30T19:30:00+01:00", bookingUrl: "https://x" },
              { title: "Akira", datetime: "2026-05-01T20:00:00+01:00" },
            ],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await extractScreeningsFromScreenshot(tmpImagePath);

    expect(result.source).toBe("deepseek-ocr-local");
    expect(result.modelUsed).toBe("deepseek-ocr");
    expect(result.screenings).toHaveLength(2);
    expect(result.screenings[0]).toMatchObject({
      title: "Amélie",
      datetime: "2026-04-30T19:30:00+01:00",
      bookingUrl: "https://x",
    });
    expect(result.screenings[1].bookingUrl).toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/generate");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("deepseek-ocr");
    expect(body.format).toBe("json");
    expect(body.stream).toBe(false);
    expect(body.images).toHaveLength(1);
    expect(typeof body.images[0]).toBe("string");
    expect(body.images[0].length).toBeGreaterThan(0);
  });

  it("drops malformed rows but keeps valid ones", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            screenings: [
              { title: "Valid", datetime: "2026-04-30T19:30:00+01:00" },
              { title: "" /* empty title rejected by zod */, datetime: "2026-04-30T19:30:00+01:00" },
              { title: "Missing datetime" /* no datetime */ },
              "not even an object",
              null,
            ],
          }),
        }),
        { status: 200 },
      ),
    );

    const result = await extractScreeningsFromScreenshot(tmpImagePath);
    expect(result.screenings).toHaveLength(1);
    expect(result.screenings[0].title).toBe("Valid");
  });

  it("throws on non-2xx Ollama response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(extractScreeningsFromScreenshot(tmpImagePath)).rejects.toThrow(
      /Ollama vision request failed: 500/,
    );
  });

  it("throws if 'response' field is missing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(extractScreeningsFromScreenshot(tmpImagePath)).rejects.toThrow(
      /missing 'response' field/,
    );
  });

  it("throws if Ollama returns non-JSON despite format:json", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ response: "this is not json" }), { status: 200 }),
    );

    await expect(extractScreeningsFromScreenshot(tmpImagePath)).rejects.toThrow(
      /non-JSON despite format:json/,
    );
  });

  it("throws if 'screenings' array is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: JSON.stringify({ films: [] }) }),
        { status: 200 },
      ),
    );

    await expect(extractScreeningsFromScreenshot(tmpImagePath)).rejects.toThrow(
      /missing 'screenings' array/,
    );
  });

  it("respects OLLAMA_VISION_MODEL env var override", async () => {
    process.env.OLLAMA_VISION_MODEL = "deepseek-ocr-2";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: JSON.stringify({ screenings: [] }) }),
        { status: 200 },
      ),
    );

    const result = await extractScreeningsFromScreenshot(tmpImagePath);
    expect(result.modelUsed).toBe("deepseek-ocr-2");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("deepseek-ocr-2");
  });

  it("respects ollamaUrl option override", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: JSON.stringify({ screenings: [] }) }),
        { status: 200 },
      ),
    );

    await extractScreeningsFromScreenshot(tmpImagePath, {
      ollamaUrl: "http://10.0.0.5:11434",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("http://10.0.0.5:11434/api/generate");
  });
});

describe("checkOllamaHealth", () => {
  it("returns available=true when /api/tags lists the model by exact name", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ models: [{ model: "deepseek-ocr" }, { model: "llama3" }] }),
        { status: 200 },
      ),
    );

    const result = await checkOllamaHealth();
    expect(result).toEqual({ available: true });
  });

  it("returns available=true when the model is tagged like 'deepseek-ocr:latest'", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ models: [{ model: "deepseek-ocr:latest" }] }),
        { status: 200 },
      ),
    );

    const result = await checkOllamaHealth();
    expect(result.available).toBe(true);
  });

  it("returns available=false when the model isn't pulled, with helpful reason", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ models: [{ model: "llama3" }, { model: "qwen" }] }),
        { status: 200 },
      ),
    );

    const result = await checkOllamaHealth();
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/not pulled/);
    expect(result.reason).toMatch(/llama3, qwen/);
  });

  it("returns available=false when /api/tags returns non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("err", { status: 503 }));

    const result = await checkOllamaHealth();
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/tags endpoint returned 503/);
  });

  it("returns available=false when fetch rejects (Ollama not running)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await checkOllamaHealth();
    expect(result.available).toBe(false);
    expect(result.reason).toBe("ECONNREFUSED");
  });

  it("returns available=false when no models field is present", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    const result = await checkOllamaHealth();
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/not pulled/);
  });
});
