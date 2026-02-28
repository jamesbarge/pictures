# Migrate AI Provider: Anthropic → Google Gemini

**Date**: 2026-02-28
**Branch**: `feat/gemini-migration`
**Type**: Infrastructure / Provider Migration

## Summary

Replaced all Anthropic Claude SDK usage with Google Gemini (`@google/genai`). The Anthropic API key had been returning 401 errors, causing all AI features to silently fall back to regex/heuristic matching. This migration restores AI-powered title extraction, content classification, event classification, and film similarity confirmation.

## Changes

### New: Shared Gemini Client (`src/lib/gemini.ts`)
- `generateText(prompt, options?)` — simple text generation for pipeline files
- `generateTextWithUsage(prompt, options?)` — returns text + token count for agent tracking
- `stripCodeFences(text)` — strips markdown ` ```json ` fences from responses
- `isGeminiConfigured()` — env var check for `GEMINI_API_KEY`
- Lazy-init singleton pattern (same as previous per-file Anthropic clients, but DRY)

### Core Pipeline (4 files)
- `src/lib/title-extractor.ts` — Anthropic → `generateText()`
- `src/lib/content-classifier.ts` — Anthropic → `generateText()`
- `src/lib/event-classifier.ts` — Anthropic → `generateText()`, updated rate limit detection for Gemini errors
- `src/lib/film-similarity.ts` — Anthropic → `generateText()`, `isClaudeConfigured()` → `isGeminiConfigured()`

### Agent System (6 files)
- `src/agents/config.ts` — env var check: `ANTHROPIC_API_KEY` → `GEMINI_API_KEY`
- `src/agents/enrichment/index.ts` — 2x `new Anthropic()` → `generateTextWithUsage()`
- `src/agents/scraper-health/index.ts` — 2x `new Anthropic()` → `generateTextWithUsage()`
- `src/agents/link-validator/index.ts` — `new Anthropic()` → `generateTextWithUsage()`
- `src/agents/fallback-enrichment/index.ts` — removed Anthropic client passing
- `src/agents/fallback-enrichment/web-search.ts` — removed `Anthropic` parameter, uses `generateTextWithUsage()`

### Admin API Routes (6 files)
- 5 routes: `ANTHROPIC_API_KEY` → `GEMINI_API_KEY` env var check
- `anomalies/verify/route.ts` — replaced Haiku→Sonnet escalation pattern with single Gemini call

### Tests (4 files)
- Updated all test mocks from `@anthropic-ai/sdk` to `@/lib/gemini`
- Simplified anomalies/verify test (no model escalation)

### Config
- `package.json` — added `@google/genai`, removed `@anthropic-ai/sdk` + `@anthropic-ai/claude-agent-sdk`
- `.env.local` — `ANTHROPIC_API_KEY` → `GEMINI_API_KEY`
- `.github/workflows/scrape.yml` — updated secret reference

## Model
All AI calls use `gemini-3.1-pro-preview` (replaces the previous split between `claude-3-5-haiku-20241022` and `claude-sonnet-4-20250514`).

## Verification
- `npx tsc --noEmit` — passes (1 pre-existing unrelated error)
- `npm run lint` — 0 errors (134 pre-existing warnings)
- `npm run test:run` — 658/658 tests pass
- `grep -r "@anthropic-ai" src/` — 0 results
