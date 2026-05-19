# Add unit tests for src/agents/config.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/agents/config.test.ts` (new) — 10 vitest cases for `validateEnvironment` + `calculateCost`.

## Coverage
- validateEnvironment: throws when GEMINI_API_KEY unset/empty, does not throw when set
- calculateCost: per-model pricing (opus, sonnet, haiku), zero-token case, 4-decimal rounding, linear scaling, opus > sonnet > haiku price ordering

## Why
`validateEnvironment` is the boot guard for all agent runs — a regression that drops the GEMINI_API_KEY check produces opaque failures deep inside the AI call stack. `calculateCost` drives the cost-tracking dashboards on `/admin/agents`; a model-price regression silently distorts spend forecasts.

## Changelog deferral note
Per #523-#530.
