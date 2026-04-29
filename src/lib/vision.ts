/**
 * Vision capability — self-hosted DeepSeek-OCR via Ollama.
 *
 * Phase 7 of the local-scraping rebuild. This module provides screenshot →
 * structured-screenings extraction by talking to a local Ollama server
 * (default: http://localhost:11434). No API key required at runtime — the
 * model runs entirely on-device.
 *
 * Setup (one-time, see CLAUDE.md "Vision (optional)"):
 *   brew install ollama
 *   brew services start ollama
 *   ollama pull deepseek-ocr
 *
 * Callers MUST wrap extractScreeningsFromScreenshot() in try/catch and fall
 * back to HTML parsing — Ollama may be down, the model may not be pulled,
 * or extraction may produce malformed JSON. checkOllamaHealth() lets the
 * scheduler probe at startup and emit an observability signal.
 */
import { readFile } from "node:fs/promises";
import { z } from "zod";

export interface ExtractedScreening {
  title: string;
  /** ISO 8601 with timezone — caller converts to Date as needed. */
  datetime: string;
  bookingUrl?: string;
}

export interface VisionExtractionResult {
  screenings: ExtractedScreening[];
  source: "deepseek-ocr-local";
  durationMs: number;
  modelUsed: string;
}

interface VisionOptions {
  model?: string;
  ollamaUrl?: string;
}

const DEFAULT_MODEL = "deepseek-ocr";
const DEFAULT_URL = "http://localhost:11434";
const HEALTH_TIMEOUT_MS = 2_000;

const screeningSchema = z.object({
  title: z.string().min(1),
  datetime: z.string().min(1),
  bookingUrl: z.string().optional(),
});

const responseSchema = z.object({
  screenings: z.array(z.unknown()),
});

function resolveOptions(options?: VisionOptions): { model: string; ollamaUrl: string } {
  return {
    model: options?.model ?? process.env.OLLAMA_VISION_MODEL ?? DEFAULT_MODEL,
    ollamaUrl: options?.ollamaUrl ?? process.env.OLLAMA_URL ?? DEFAULT_URL,
  };
}

const PROMPT =
  "Extract every film screening listed on this cinema page. For each screening, " +
  "give the film title, the date+time (combined into ISO 8601 with timezone " +
  "Europe/London), and the booking URL if visible. Return JSON only.";

/**
 * Extract screenings from a screenshot via local Ollama DeepSeek-OCR.
 * Throws if Ollama is unreachable or returns a non-2xx status — callers
 * should wrap in try/catch and fall back to HTML parsing.
 */
export async function extractScreeningsFromScreenshot(
  imagePath: string,
  options?: VisionOptions,
): Promise<VisionExtractionResult> {
  const { model, ollamaUrl } = resolveOptions(options);
  const startedAt = Date.now();

  const imageBase64 = await readFile(imagePath, { encoding: "base64" });

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: PROMPT,
      images: [imageBase64],
      format: "json",
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama vision request failed: ${res.status} ${res.statusText}`,
    );
  }

  const envelope = (await res.json()) as { response?: string };
  if (typeof envelope.response !== "string") {
    throw new Error("Ollama response missing 'response' field");
  }

  // Ollama with format:json returns JSON inside the `response` string.
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope.response);
  } catch (err) {
    throw new Error(
      `Ollama returned non-JSON despite format:json — ${(err as Error).message}`,
    );
  }

  const shape = responseSchema.safeParse(parsed);
  if (!shape.success) {
    throw new Error("Ollama JSON missing 'screenings' array");
  }

  // Validate each row independently — drop malformed entries rather than
  // failing the whole extraction.
  const screenings: ExtractedScreening[] = [];
  for (const raw of shape.data.screenings) {
    const parsedRow = screeningSchema.safeParse(raw);
    if (parsedRow.success) {
      screenings.push(parsedRow.data);
    }
  }

  return {
    screenings,
    source: "deepseek-ocr-local",
    durationMs: Date.now() - startedAt,
    modelUsed: model,
  };
}

/**
 * Quick health check: returns true if Ollama is responsive AND has the
 * configured model available. Used by scheduler startup.
 */
export async function checkOllamaHealth(
  options?: VisionOptions,
): Promise<{ available: boolean; reason?: string }> {
  const { model, ollamaUrl } = resolveOptions(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { available: false, reason: `tags endpoint returned ${res.status}` };
    }
    const body = (await res.json()) as { models?: Array<{ model?: string }> };
    const tags = body.models ?? [];
    // Ollama tags models like "deepseek-ocr:latest" — match by exact name or
    // by the bare prefix before the colon.
    const found = tags.some((m) => {
      const name = m.model ?? "";
      return name === model || name.startsWith(`${model}:`);
    });
    if (!found) {
      return {
        available: false,
        reason: `model '${model}' not pulled (found: ${tags.map((m) => m.model).join(", ") || "none"})`,
      };
    }
    return { available: true };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timed out after ${HEALTH_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    return { available: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
