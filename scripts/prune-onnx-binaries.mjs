// Vercel-only prune of non-linux-x64 onnxruntime-node native binaries.
//
// onnxruntime-node ships prebuilt binaries for 5 platforms (~213MB:
// win32 125MB + darwin 35MB + linux x64+arm64 53MB). Vercel serverless runs
// linux/x64 ONLY, but Turbopack's file tracing pulls ALL of them into any
// function that imports @huggingface/transformers — overflowing Vercel's 250MB
// unzipped function limit. `outputFileTracingExcludes` is ignored under
// Turbopack, so prune physically at install time instead.
//
// Guarded by process.env.VERCEL so local installs keep the darwin binary
// (needed by scripts/backfill-embeddings.ts and the local embedding spike).
import { rmSync, existsSync } from 'node:fs';

if (process.env.VERCEL) {
	const base = 'node_modules/onnxruntime-node/bin/napi-v6';
	const drop = ['win32', 'darwin', 'linux/arm64'];
	let removed = 0;
	for (const p of drop) {
		const dir = `${base}/${p}`;
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
			removed++;
		}
	}
	console.log(`[prune-onnx] VERCEL build: removed ${removed} non-linux-x64 onnxruntime binary dir(s)`);
} else {
	// no-op off Vercel
}
