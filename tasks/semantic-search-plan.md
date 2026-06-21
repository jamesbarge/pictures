# Semantic Film Search — Productionization Plan

> **Status:** design validated by spike; productionization gated on a Vercel serverless check.
> **Reconstructed 2026-06-21** (the original `tasks/semantic-search-plan.md` was lost from the repo; this restores the validated decisions from the design record / spike findings — PIC-32). Tracks: PIC-32 (this doc), PIC-33 (Vercel validation), PIC-34 (wire the RRF arm).

## Goal

Add a **semantic** retrieval arm to `/api/films/search` so conceptual queries — "films about grief", "neon-noir", "slow-burn revenge" — rank well alongside the existing lexical and fuzzy matching. Semantic search complements, never replaces, the current hybrid.

## Where search is today

`/api/films/search` is already a **hybrid** ranker fusing two arms via Reciprocal Rank Fusion (RRF, k=60):

1. **Full-text** — Postgres `tsvector` (`search_tsv` generated column).
2. **Trigram** — `pg_trgm` similarity over `search_text` (typo / partial tolerance).

Extensions enabled: `pg_trgm`, `unaccent`, `btree_gin`, and **`pgvector`** (migrations 0012/0013). pgvector being live is what makes a third arm cheap to add.

## The plan: semantic as a third RRF arm

Add embeddings as a **third arm** fused into the same RRF (k=60):

```
final_rank = RRF(fulltext_rank, trigram_rank, semantic_rank)   # k = 60
```

RRF is the right fusion choice because it needs no score calibration across arms (each arm only contributes ranks), so the semantic arm can be added without retuning the existing two.

### Model decision (validated by spike)

- **Model:** `bge-small-en-v1.5`
- **Quantization:** **q8** (int8) — small footprint, negligible quality loss for this use.
- **Dimensions:** **384**
- Spike validation: embedding output **L2 norm ≈ 1.0** (correctly normalized), so cosine similarity = dot product and pgvector `<=>` / `<#>` behave as expected.

### Backend decision (CORRECTED during spike)

- **Use `onnxruntime-node` (native), NOT a forced-WASM/web build.**
- Rationale:
  - The **web build** of the embedding runtime expects a **browser environment** (DOM/Worker APIs) and does not run cleanly in a Node serverless function.
  - **`onnxruntime-node` ships a prebuilt `linux/x64` binary**, which matches the Vercel serverless runtime — no native compile step at deploy time.
- Embeddings are computed **server-side at query time** for the user's query string; film embeddings are precomputed and stored in a pgvector column.

## Open gate (the one blocker) — PIC-33

**Validate `onnxruntime-node` inside a Vercel serverless function on a preview deploy**, specifically:

- **Bundle size** — the native `.node` binary + model weights must fit within the serverless function size limit (and not blow cold-start).
- **Cold-start latency** — first-invocation model load must be acceptable; consider lazy-loading the session and/or keeping the model file small (q8 helps).
- **Execution** — confirm the prebuilt binary actually loads and runs in the deployed runtime (not just locally).

This must be proven on a **preview deployment** before wiring the arm into the live endpoint — local success is necessary but not sufficient (the spike's original WASM assumption is exactly what local-only testing would have missed).

## Implementation sequence

1. **PIC-32 — this plan** (recreate + commit the design record). ✅ this PR.
2. **PIC-33 — Vercel validation.** Stand up a throwaway route on a preview deploy that loads `onnxruntime-node` + the q8 model and embeds a string; measure bundle size + cold start; confirm it executes. Gate everything below on this passing.
3. **PIC-34 — wire the third RRF arm.**
   - Migration: add a `vector(384)` column to the films table; backfill embeddings for all films (batch job).
   - Query path: embed the query server-side, run a pgvector nearest-neighbour query, feed its ranking into the existing RRF(k=60) alongside fulltext + trigram.
   - Keep the arm **additive and guarded**: if the embedding step errors or is slow, the endpoint must degrade to the current 2-arm hybrid (never 500, never block lexical results).

## Risks / watch-items

- **Serverless cold start** — model load on a cold function could spike p99 latency; mitigate with lazy session init and the small q8 model. Re-evaluate if PIC-33 shows it's heavy.
- **Bundle limit** — if the binary + weights exceed the function limit, fall back to a separate embedding service or precompute-only (no query-time embedding).
- **Backfill cost** — embedding the full film catalogue is a one-off batch; throttle to avoid DB/CPU pressure.
- **No new paid APIs** — this is deliberately a local/in-process model (no Voyage/OpenAI embedding API), consistent with the project's "no new paid/AI APIs for features" rule.

## References

- pgvector + hybrid search migrations: 0012 / 0013.
- Existing fusion: RRF k=60 over `search_tsv` (tsvector) + `search_text` (trigram).
- Design record: memory `project_semantic_search_2026_06_01`.
