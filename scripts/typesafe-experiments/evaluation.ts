import { createHash } from "node:crypto";
import type { EvaluationRecord } from "./types";

/** A bounded queue; a rejected task stops new work while in-flight calls settle. */
export async function mapConcurrent<T, R>(items: T[], run: (item: T, index: number) => Promise<R>, concurrency = 4): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid concurrency");
  const results: R[] = new Array(items.length);
  let next = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (failure === undefined) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await run(items[index], index); }
      catch (error) { failure = error; return; }
    }
  }));
  if (failure !== undefined) throw failure;
  return results;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function latencySummary(records: EvaluationRecord[]) {
  const values = records.map(r => r.elapsedMs).sort((a, b) => a - b);
  return {
    requests: records.length,
    inputTokens: records.reduce((n, r) => n + r.response.usage.input_tokens, 0),
    outputTokens: records.reduce((n, r) => n + r.response.usage.output_tokens, 0),
    costUsd: records.reduce((n, r) => n + r.costUsd, 0),
    medianMs: values.length ? values[Math.floor(values.length / 2)] : null,
    p95Ms: values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] : null,
  };
}
