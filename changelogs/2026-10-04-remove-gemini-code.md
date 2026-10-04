# Remove Gemini-dependent code

**PR**: #PENDING
**Date**: 2026-10-04

## Changes
- Deleted `src/lib/gemini.ts` and every caller: the scraper-health and link-validator agents, the web-search fallback enrichment agent (`web-search`, `index`, `run`, `confidence` and its test), and the unused `src/lib/qa/utils/gemini-analyzer.ts`.
- Deleted the admin AI surfaces that sat behind `GEMINI_API_KEY`: the `/admin/agents` page and its three `/api/admin/agents/*` routes, AI Verify (`/api/admin/anomalies/verify` plus its button), the `/api/admin/data-quality` route with its "Run fallback enrichment" control, the "Phase 2: AI Verification" card on `/admin/anomalies` and the "About Cinema Tiers" card on `/admin/cinemas`.
- `src/agents/run-agents.ts` runs the DeepSeek enrichment agent alone, with the `GEMINI_API_KEY` check removed. `npm run agents` and `npm run agents:enrich` both point at it; `agents:links`, `agents:health` and `agents:fallback-enrich` are gone. `agents:verify` is unchanged.
- `src/agents/config.ts` loses `validateEnvironment` and `calculateCost` (and `config.test.ts`); `src/agents/types.ts` loses the link, health, issue and per-agent config types. The enrichment agent uses a single `AUTO_APPLY_THRESHOLD = 0.5`, the value it already read from `AGENT_CONFIGS.enrichment`, and logs tokens used in place of an estimated dollar cost.
- `src/scrapers/pipeline.ts`: removed the `ENABLE_AGENTS` post-scrape hook (`runPostScrapeAgents`). No env file sets that flag.
- `scripts/audit-and-fix-upcoming.ts`: removed the fallback enrichment pass. The remaining passes are renumbered 1 to 7 (poster audit is now pass 5, dodgy detection 6, final audit 7), so `--pass` and `--skip` numbers above 4 shift down by one.
- `src/lib/deepseek.ts` keeps only `generateTextWithUsage` with one model constant. `src/lib/scraper-verification.ts`, `src/lib/strip-code-fences.ts` and `src/lib/ai-clients-stripcodefences.test.ts` are deleted because nothing imported them.
- `scripts/data-check.ts` checks booking URLs with HTTP HEAD only; every failure files a `broken_booking_url` issue. `scripts/lib/booking-verifier.ts` (Stagehand on `google/gemini-2.0-flash`) and its tsconfig exclude are gone.
- `scripts/audit/mobile-audit.ts` drops the Stagehand visual check. `--no-ai` is still accepted and has no effect.
- Uninstalled `@posthog/ai`, `ai`, `@ai-sdk/openai-compatible` and `@browserbasehq/stagehand`. The lockfile loses 249 packages, including `@google/genai`; `openai` stays for DeepSeek.
- Docs: README, ARCHITECTURE.md, AI_CONTEXT.md, `.env.local.example` and `.claude/rules/data-quality.md` now describe DeepSeek enrichment and the 7-pass audit.

## Impact
- About 4,985 lines of source, tests and docs removed (excluding the lockfile). Gemini is banned and its key is dead by intent, so none of the deleted code could run.
- `npm run agents:enrich` works with only `DEEPSEEK_API_KEY` set. Before this change it exited at the Gemini key check.
- The admin sidebar loses the "AI Agents" item. Anomaly cards keep Re-scrape and Dismiss.
- Data-check booking spot-checks stop filing `extract_failed` issues caused by the dead Gemini key.
