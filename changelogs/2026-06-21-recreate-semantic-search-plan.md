# Recreate tasks/semantic-search-plan.md

**PR**: #722 (supersedes #717)
**Date**: 2026-06-21
**Issue**: PIC-32

## Changes
- Recreated `tasks/semantic-search-plan.md`, which memory referenced but was missing from the repo.

## Content restored (from the design record + spike findings)
- **Model**: `bge-small-en-v1.5`, q8 quantization, 384 dimensions (spike confirmed output L2 norm ≈ 1.0).
- **Backend**: `onnxruntime-node` (native) — corrected from the original forced-WASM assumption, because the web build needs a browser environment and `onnxruntime-node` ships a prebuilt `linux/x64` binary matching Vercel's runtime.
- **Architecture**: semantic embeddings added as a **third RRF arm (k=60)** alongside the existing `tsvector` (full-text) + `pg_trgm` (trigram) arms in `/api/films/search`; pgvector still needs enabling (part of the PIC-34 migration — 0012/0013 only add pg_trgm/unaccent/btree_gin).
- **Open gate (PIC-33)**: validate `onnxruntime-node` bundle size + cold-start + execution inside a Vercel serverless function on a preview deploy before wiring the arm live.
- **Sequence**: PIC-32 (plan) → PIC-33 (Vercel validation) → PIC-34 (migration + backfill + RRF wiring, degrading to the 2-arm hybrid on error).

## Impact
- Documentation only; no runtime code. Restores the prerequisite artefact for the Semantic Search Productionization project so the validated decisions aren't lost.
