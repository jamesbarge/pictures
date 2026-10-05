/**
 * DeepSeek AI client for the enrichment agent (`npm run agents:enrich`).
 *
 * DeepSeek's API is OpenAI-compatible, so we reuse the existing `openai`
 * SDK pointed at https://api.deepseek.com.
 */

import OpenAI from "openai";

const MODEL = "deepseek-v4-flash";
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

function buildMessages(prompt: string, systemPrompt?: string) {
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  return messages;
}

/** Return value of {@link generateTextWithUsage}. */
interface GenerateResult {
  text: string;
  tokensUsed: number;
}

/**
 * Generate text with usage metadata.
 *
 * The enrichment agent always asks for JSON in the prompt body, so we set
 * response_format: json_object to guarantee parseable output.
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
