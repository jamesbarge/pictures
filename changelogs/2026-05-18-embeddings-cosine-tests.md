# Add unit tests for cosineSimilarity in src/lib/embeddings.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/embeddings-cosine.test.ts` (new) — 13 vitest cases for `cosineSimilarity` + `SIMILARITY_THRESHOLDS` band structure.

## Why
`cosineSimilarity` is the math kernel for the bge-m3-driven film dedup pipeline (Stream 6 of the scraping rethink). A regression in this function silently changes which films get merged across language pairs (Spanish/English, Czech/English, etc.) — the kind of bug you'd only notice via post-hoc audits.

Separate from `embeddings.test.ts` so we don't pull in the Ollama HTTP mocks needed by the rest of the module — this file tests only the pure-math export.

## Coverage
- Identity (unit + non-unit vectors)
- Orthogonality (sim = 0)
- Anti-parallel vectors (sim = -1)
- Scale-invariance
- Symmetry
- **Zero-vector guard** (sim = 0 instead of NaN — the `if (normA === 0 || normB === 0) return 0` branch)
- Output range [-1, 1]
- Length-mismatch error message includes both lengths (for grep-ability)
- Sanity on bge-m3 production vector size (1024 dimensions)
- SIMILARITY_THRESHOLDS band structure (autoMerge ≥ judgeBand ≥ doNotMerge) + range validation

## Changelog deferral note
Per #523-#530.
