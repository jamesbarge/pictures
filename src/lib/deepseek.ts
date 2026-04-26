/**
 * Shared DeepSeek AI Client
 *
 * Drop-in replacement for src/lib/gemini.ts on the enrichment path.
 * DeepSeek's API is OpenAI-compatible, so we reuse the existing `openai`
 * SDK pointed at https://api.deepseek.com.
 *
 * Function signatures mirror gemini.ts exactly so callers only swap the
 * import path — no other code changes required.
 */

import OpenAI from "openai";

/** Available DeepSeek model identifiers. */
export const DEEPSEEK_MODELS = {
  flash: "DeepSeek-V4-Flash",
} as const;

type DeepSeekModelId = (typeof DEEPSEEK_MODELS)[keyof typeof DEEPSEEK_MODELS];

const MODEL: DeepSeekModelId = DEEPSEEK_MODELS.flash;
const BASE_URL = "https://api.deepseek.com";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY!,
      baseURL: BASE_URL,
    });
  }
  return client;
}

/**
 * Strip markdown code fences. DeepSeek with `response_format: json_object`
 * returns clean JSON, but we keep this for parity with the Gemini client
 * and to handle non-JSON responses that may still arrive fenced.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

interface GenerateOptions {
  systemPrompt?: string;
  model?: DeepSeekModelId;
}

function buildMessages(prompt: string, systemPrompt?: string) {
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  return messages;
}

/**
 * Generate text from a prompt (simple variant).
 * Mirrors src/lib/gemini.ts → generateText. JSON-mode is intentionally
 * not exposed here since no current caller needs it; generateTextWithUsage
 * forces json_object for the enrichment agent's two prompts.
 */
export async function generateText(
  prompt: string,
  options?: GenerateOptions
): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: options?.model ?? MODEL,
    messages: buildMessages(prompt, options?.systemPrompt),
  });
  return response.choices[0]?.message?.content ?? "";
}

/** Return value of {@link generateTextWithUsage}. */
interface GenerateResult {
  text: string;
  tokensUsed: number;
}

/**
 * Generate text with usage metadata.
 * Mirrors src/lib/gemini.ts → generateTextWithUsage.
 *
 * The enrichment agent always asks for JSON in the prompt body, so we set
 * response_format: json_object to guarantee parseable output and avoid the
 * markdown-fence stripping that the Gemini path needed.
 */
export async function generateTextWithUsage(
  prompt: string,
  options?: { systemPrompt?: string }
): Promise<GenerateResult> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages: buildMessages(prompt, options?.systemPrompt),
    response_format: { type: "json_object" as const },
  });

  return {
    text: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

/** Check if DeepSeek API is configured. */
export function isDeepSeekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}
