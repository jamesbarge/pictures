# Semantic Film Search — Implementation Plan (synthesized 2026-06-01)

Source: `semantic-search-design` judge-panel workflow (3 proposers × robustness/quality/latency lenses
+ adversarial Vercel critic + synthesizer). Approved deps: `@huggingface/transformers` + pgvector (FOSS,
in-process, NO paid APIs).

## Decision summary
Add a **third, purely-additive SEMANTIC arm** to the existing Postgres RRF film search (lexical tsvector
+ trigram). It complements, never replaces. Vanishes to 0 rows when the query vector is null (flag off /
gated off / model fail) → SQL byte-identical to today.

- **Model**: `Xenova/bge-small-en-v1.5` — 384-dim, q8 `model_quantized.onnx` (~33MB on disk).
  Mean-pool + L2-normalize (`{ pooling:'mean', normalize:true }`). **BGE query-only prefix**:
  `"Represent this sentence for searching relevant passages: "` on the QUERY only; documents get NO prefix.
  Identical model+dtype+pooling+normalize for backfill AND query embed (non-negotiable).
- **Backend**: `@huggingface/transformers` forced to **onnxruntime-web WASM**, `numThreads=1`, `proxy=false`.
  NOT onnxruntime-node (fragile native binary, bundle bloat).
- **Model delivery**: VENDOR in-repo (`allowRemoteModels=false`, `localModelPath`), incl. the ort-web `.wasm`
  (`wasm.wasmPaths`). No runtime CDN download (cold-start network dep, /tmp ephemerality, HF rate limits).
- **Column/index**: migration **0014** (0013 is taken) — drop empty `title_embedding vector(1536)`,
  recreate `vector(384)` + sidecars `embedding_input text`, `embedding_model text`. **NO ANN index**
  (flat cosine scan, ~2K rows, sub-ms, perfect recall). Keep column OUT of Drizzle schema (raw sql only,
  per the search_tsv/search_text 0012 pattern — avoids Drizzle 0.45 type leak into FilmInsert).
- **Embedding doc** (rich, for conceptual match): `title (/originalTitle) (year)\nDirected by …\nGenres: …\n
  Countries: …\n[Tagline: …]\n synopsis`. No cast jsonb (one legacy scalar row; low value).
- **Fusion**: third CTE `semantic` (row_number() over `title_embedding <=> qvec ASC`, LIMIT 200) UNION ALL
  into the existing k=60 RRF, equal weight. Downstream boosts/recency/popularity/future-screening UNCHANGED.
- **Gate (latency)**: only embed multi-word CONCEPTUAL queries (len ≥ `SEMANTIC_MIN_QUERY_LEN`=6 AND ≥2
  tokens, or concept markers); short/title/year/name lookups skip embedding entirely. Kick off embed in
  PARALLEL with the cinemas/screenings/… fan-out; 250ms soft-timeout → 2-arm fallback; in-container LRU
  (cap ~200) query→vec cache; optional cron warmer.
- **Flag**: `SEMANTIC_SEARCH_ENABLED` (default **false**). 3-tier graceful fallback (init fail → latch off
  for container; embed timeout/throw → 2-arm for that request; NULL embeddings → absent from arm). Rollback
  = flip flag (NB: trigger a FRESH deploy, not a Vercel "redeploy" which reuses old env — repo gotcha).

## ⚠ SPIKE RESULT (2026-06-01) — backend decision CHANGED
Local spike (`/tmp/embed-spike`) outcome:
- ✅ MODEL VALIDATED: node build `pipeline('feature-extraction','Xenova/bge-small-en-v1.5',{dtype:'q8'})`
  → real forward pass → **dims=384, norm=1.00000**. q8 quant is fine; bge-small prefix works.
- ❌ forced-WASM path is wrong: the `@huggingface/transformers` **web build expects a browser** (relative-URL
  model fetch fails in Node; `device:'wasm'` is invalid — valid set coreml/webgpu/cpu).
- ✅ `onnxruntime-node` ships a **prebuilt linux/x64 binary** (Vercel target) + full op coverage (q8-WASM-kernel
  risk MOOT).
- **REVISED DECISION: backend = onnxruntime-node (default node build), NOT forced-WASM.** Simpler + lower-risk.
  Update next.config `serverExternalPackages: ['onnxruntime-node','@huggingface/transformers']` +
  `outputFileTracingIncludes` for the linux `.node` binary + model files. Drop the ort-web wasm vendoring.
- ⛔ STILL UNVALIDATED (needs a deploy): does it bundle+run in a Vercel serverless function (linux .node tracing,
  <250MB, runtime exec)? Can't test locally (root node_modules corruption blocks `next build`; preview auth-walled).

## VALIDATE FIRST (before any schema/backfill/fusion)
1. **Local spike** `scripts/spike-embed.ts`: load vendored q8 bge-small via forced WASM, embed
   "films about grief" + "neon noir", ASSERT output is a **384-length vector with L2 norm ≈ 1.0**
   (guards the q8/uint8 op-coverage-throws-at-first-inference risk). Fallback: fp32 dtype → other ONNX export.
2. **Serverless spike** `src/app/api/_embed-spike/route.ts` (throwaway, PREVIEW only): same vendored-local
   WASM init + REAL forward pass; assert build <250MB, no module-resolution/wasm errors, 384 unit-norm vec,
   coldMs<~1.5s, warmMs<~30ms, RSS in limit. ⚠ preview URLs are auth-walled in this env — may need a Vercel
   protection-bypass token or to verify via Vercel logs.

## File changes (ordered)
1. `src/db/migrations/0014_film_content_embedding.sql` — re-dimension column + sidecars, no ANN index.
2. `scripts/apply-content-embedding-migration.ts` — sql.unsafe runner (copy apply-search-migration.ts).
3. `scripts/verify-content-embedding-migration.ts` — assert dim=384 + populated count.
4. `src/lib/search/models/bge-small-en-v1.5/**` — vendored q8 model + tokenizer (git-lfs?).
5. `src/lib/search/models/ort-wasm/**` — vendored onnxruntime-web .wasm.
6. `src/lib/search/embedding-doc.ts` — shared rich-document builder (backfill + re-embed single source).
7. `src/lib/search/query-embedder.ts` — env config + module-singleton getEmbedder() + embedQuery()
   (BGE prefix, mean/normalize, try/catch latch, LRU, 250ms timeout).
8. `scripts/backfill-embeddings.ts` — offline batched backfill over 1939 films (content-addressed,
   --only-null/--dry-run/--limit). Run: `DB_POOL_MAX=3 dotenv -e .env.local -- npx tsx scripts/backfill-embeddings.ts`.
9. `scripts/spike-embed.ts` — local validation spike.
10. `src/app/api/_embed-spike/route.ts` — throwaway preview validation route (delete after).
11. `src/app/api/films/search/route.ts` — flag read, query-shape gate, parallel embedQuery, semantic CTE.
12. `next.config.ts` — add @huggingface/transformers + onnxruntime-web + onnxruntime-common to
    `serverExternalPackages`; ADD `experimental.outputFileTracingIncludes['/api/films/search']` for the
    vendored model + wasm (this key does NOT currently exist — fragile, untested → the spike validates it).
13. `package.json` — dep + scripts (db:apply-embedding-migration / backfill:embeddings / spike:embed).
14. env: SEMANTIC_SEARCH_ENABLED (false), SEMANTIC_MIN_QUERY_LEN (6).
15. Both changelogs.

## Open questions (defaults chosen; confirm if disagree)
- **git-lfs** for the ~33MB .onnx? Recommended; else commit binary + verified hash. Check repo/CI/Vercel LFS support.
- **Staged rollout**: ship default-OFF, flip on only after preview spike + prod backfill verified. (Recommended.)

## Verification gates
- Local spike unit-norm assertion → then backfill sanity ("films about grief"/"neon noir" top-10 eyeball)
  → tsc → code-reviewer on diff → preview-spike → flag flip on a fresh prod deploy (promote-gated).
