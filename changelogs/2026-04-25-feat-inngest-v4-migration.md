# Migrate to Inngest SDK v4

**PR**: TBD
**Date**: 2026-04-25

## Changes
- `package.json`: `"inngest": "^3.54.0"` → `"inngest": "^4.2.4"`
- `package-lock.json`: refreshed; resolves to `inngest@4.2.4`
- `src/inngest/functions.ts`: migrated all 6 `createFunction` calls to v4's trigger-in-options-object signature.

## Why now
Today's Vercel-vulnerability-gate incident (forcing a same-day v3.52 → v3.54 bump) made the cost of staying on the v3 line concrete: v4 is GA (released 2026-03-17), and the v3 line will keep accumulating CVE-driven hotfix pressure until we move. The migration surface in this codebase is genuinely small, so we do it now while the context is fresh rather than waiting for the next gate to force the move under outage pressure.

## Migration mechanics

### 1. Triggers move into the options object (6 sites)

**Before (v3):**
```typescript
inngest.createFunction(
  { id: "run-cinema-scraper", retries: 2 },
  { event: "scraper/run" },
  async ({ event, step }) => { ... }
);
```

**After (v4):**
```typescript
inngest.createFunction(
  { id: "run-cinema-scraper", retries: 2, triggers: [{ event: "scraper/run" }] },
  async ({ event, step }) => { ... }
);
```

All six functions migrated:
- `runCinemaScraper` — `triggers: [{ event: "scraper/run" }]`
- `scheduledScrapeAll` — `triggers: [{ cron: "0 6 * * *" }]`
- `handleFunctionFailure` — `triggers: [{ event: "inngest/function.failed" }]`
- `scheduledBFIPDFImport` — `triggers: [{ cron: "0 6 * * 0" }]`
- `scheduledBFIChanges` — `triggers: [{ cron: "0 10 * * *" }]`
- `scheduledLetterboxdEnrichment` — `triggers: [{ cron: "0 8 * * *" }]`

> **Important:** `triggers` MUST be an array, even for a single trigger. v4's TypeScript signature is `triggers?: TTriggers extends InngestFunction.Trigger<string>[]` (`node_modules/inngest/components/InngestFunction.d.ts:100-101`) and the wire-format schema is `z.array(...)` (`node_modules/inngest/types.d.ts:1181`). The official migration guide's single-object example was misleading — TypeScript accepts the singular form because the generic default falls back to a permissive shape, but Inngest cloud will silently fail to register the trigger on the wire. First pass of this PR used the singular form; caught in code review before merge.

### 2. Things we did NOT migrate (and why)

- **`EventSchemas` → `eventType()`**: the v4 migration guide describes this as the recommended pattern for centralised event schemas, but our code never used `EventSchemas` to begin with — `src/inngest/client.ts` exports decorative `ScraperEvent` / `FestivalProgrammeDetectedEvent` / `Events` types that aren't connected to the `Inngest` instance via a generic or `schemas` option. So there's no v3 schema pattern to translate.
- **`step.invoke()` string-arg removal**: we don't use `step.invoke()` anywhere.
- **Manual `globalThis.fetch` binding**: we never bound it; v4's lazy-fetch resolution is purely beneficial.
- **`isDev` / `INNGEST_DEV` flag**: production already passes `INNGEST_SIGNING_KEY`, which is what v4's new cloud default requires.

## Verification
- `npx tsc --noEmit` — clean.
- `npm run test:run` — 913/913 pass.
- Local `next dev` smoke skipped because port 3000 was occupied by an existing dev session at the time. Vercel preview deploy provides the runtime check (a v4 incompatibility would surface at module-load on cold start, immediately and visibly).
- After merge, watch the first scheduled cron (`0 6 * * *` UTC for `scheduledScrapeAll`) and the next ad-hoc `scraper/run` event to confirm functions register and execute under the v4 protocol.

## Rollback plan
If the preview deploy or the first post-merge cron exposes a regression, revert is straightforward:
```
npm install inngest@^3.54.0
git revert <merge-commit>
```
The v3 → v4 changes are entirely localised to the trigger-arg shape; reverting to v3 is mechanically symmetrical to the migration.

## References
- [TypeScript SDK Migration Guide: v3 to v4](https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4)
- [TypeScript SDK v4 GA changelog](https://www.inngest.com/changelog/2026-03-17-typescript-sdk-v4-ga)
- [Tracking issue: inngest v3 → v4 migration](https://github.com/inngest/inngest-js/issues/1304)
