# Add unit tests for likelyNeedsClassification (event-classifier gate)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/event-classifier-likely-needs.test.ts` (new) — 27 vitest cases (mostly via `it.each`) covering the 22-regex pattern set.

## Coverage families
- Plain film titles → false (control)
- Q&A patterns (3 variants)
- Format patterns: 35mm, 70mm, IMAX, 4K, 3D (5 cases)
- Event patterns: premiere, preview, sing-along, double-bill, marathon (6 cases)
- Accessibility patterns: relaxed, subtitle, audio-description (3 cases)
- Repertory/season patterns: intro, discussion, anniversary, restoration, season, retrospective (6 cases)
- Case-insensitivity sanity
- **Word-boundary requirement**: `\b3d\b` does NOT match substrings like "in-3deed" or "Imax3D" (no word boundary)

## Why
This function is the gate that decides whether to invoke the (expensive) Gemini classifier for each screening title. A regression that broadens the match silently inflates AI API spend; one that narrows it silently mis-classifies special-event screenings as plain films. The case-insensitivity + word-boundary contracts are both load-bearing.

Separate from `event-classifier.test.ts` because the rest of the module needs Gemini API mocks — this file tests only the pure heuristic.

## Changelog deferral note
Per #523-#530.
