import { NextResponse } from "next/server";

/**
 * THROWAWAY spike route — DELETE after validation.
 *
 * Validates the make-or-break assumption for semantic search: that
 * `@huggingface/transformers` + `onnxruntime-node` bundles AND runs a REAL
 * forward pass inside a Vercel serverless Node function (linux/x64), under the
 * function size/time limits, with this repo's Next/Turbopack build + asset
 * tracing. Returns the embedding dims + unit-norm check + cold/warm timing.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Module-singleton: load the model+pipeline ONCE per warm container.
let pipePromise: Promise<unknown> | null = null;

async function getPipe(): Promise<(text: string, opts: object) => Promise<{ data: ArrayLike<number> }>> {
  if (!pipePromise) {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Spike: download the model to /tmp at runtime (vendoring decision deferred).
    env.allowRemoteModels = true;
    if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
    pipePromise = pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
      dtype: "q8",
    });
  }
  return pipePromise as Promise<(text: string, opts: object) => Promise<{ data: ArrayLike<number> }>>;
}

export async function GET() {
  const t0 = Date.now();
  try {
    const pipe = await getPipe();
    const loadMs = Date.now() - t0;

    const t1 = Date.now();
    const out = await pipe(
      "Represent this sentence for searching relevant passages: films about grief",
      { pooling: "mean", normalize: true },
    );
    const warmMs = Date.now() - t1;

    const v = Array.from(out.data as ArrayLike<number>);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));

    return NextResponse.json({
      ok: true,
      dims: v.length,
      isUnitNorm: Math.abs(norm - 1) < 1e-3,
      norm,
      loadMs,
      warmMs,
      rssMB: Math.round(process.memoryUsage().rss / 1e6),
      node: process.version,
    });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { ok: false, error: String(err?.stack || err?.message || e) },
      { status: 500 },
    );
  }
}
