# Kaizen — Unexport Internal Agent Interfaces

**PR**: #279
**Date**: 2026-03-13

## Changes
- Unexported 6 internal-only interfaces across agents/fallback-enrichment/ and agents/data-quality/
- Deleted dead barrel re-export of ConfidenceInput/ConfidenceResult from fallback-enrichment/index.ts

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Reduces public API surface of agent modules
