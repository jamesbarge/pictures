/**
 * Shared Gemini AI Client
 *
 * Provides a lazy-init singleton for Google Gemini, replacing the per-file
 * Anthropic client pattern used previously.
 */

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.1-pro-preview";

let ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return ai;
}

/**
 * Strip markdown code fences that Gemini sometimes wraps around JSON responses.
 * Safe to call on text that doesn't have fences.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/**
 * Generate text from a prompt (simple variant).
 * Use this for core pipeline calls that don't need token tracking.
 */
export async function generateText(
  prompt: string,
  options?: { systemPrompt?: string }
): Promise<string> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: options?.systemPrompt
      ? { systemInstruction: options.systemPrompt }
      : undefined,
  });
  return response.text ?? "";
}

export interface GenerateResult {
  text: string;
  tokensUsed: number;
}

/**
 * Generate text with usage metadata (for agent calls that track tokens).
 */
export async function generateTextWithUsage(
  prompt: string,
  options?: { systemPrompt?: string }
): Promise<GenerateResult> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: options?.systemPrompt
      ? { systemInstruction: options.systemPrompt }
      : undefined,
  });

  const tokensUsed =
    (response.usageMetadata?.promptTokenCount ?? 0) +
    (response.usageMetadata?.candidatesTokenCount ?? 0);

  return {
    text: response.text ?? "",
    tokensUsed,
  };
}

/**
 * Check if Gemini API is configured
 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
