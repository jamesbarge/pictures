# BFI IMAX regression — 2026-04-28 diagnostic

## Surfaced by

`npx tsx --env-file=.env.local scripts/audit/local-vs-baseline.ts`
(Phase 8 audit script). Status: 🔴 regressed (recent 0 vs baseline 4.5).

## Findings

Last 5 `scraper_runs` for `bfi-imax`:

| When | Status | Count | Notes |
|---|---|---|---|
| 2026-04-28 03:18 | success | **0** | silent breaker |
| 2026-04-27 03:13 | success | **0** | silent breaker |
| 2026-04-26 10:48 | success | 93 | last good run |
| 2026-04-20 03:42 | success | 35 | |
| 2026-04-16 00:01 | success | 6 | |

The scraper is **completing successfully** (no exception, no anomaly) but returning **0 screenings** for two consecutive nights. This is the classic silent-breaker pattern: status=success masks a structural extraction failure.

The DB still has 5+ upcoming BFI IMAX screenings, but they were all scraped on 2026-04-26 (the last good run): "Michael" ×3, "Akira", "Project Hail Mary". After that, fresh scrapes have produced nothing.

## Likely root cause

One of:
1. **Page structure changed** — BFI IMAX whatson listings page returns HTML that the scraper's selectors no longer match
2. **Cloudflare / WAF block** — scraper now gets a challenge page or empty body, no exception, no items extracted
3. **Date-window mismatch** — scraper queries a window where no upcoming films are listed (e.g. it asks for "today" and the IMAX schedule jumped forward)

Compare: `bfi-southbank` had 514 screenings on the same 2026-04-28 run (healthy). So the BFI scraper code is mostly fine — just the IMAX-specific path (`createBFIScraper("bfi-imax")` in `src/scrapers/cinemas/bfi.ts`) that's failing.

## What the new local pipeline does about this

After PR #469 merges and the local Bree scheduler is started, **silent breakers like this fire a Telegram alert automatically** via the anomaly digest in `runScrapeAll()`. Specifically:

```ts
// src/lib/jobs/scrape-all.ts — summariseRunsSince()
} else if (r.status === "success" && (r.screeningCount ?? 0) === 0) {
  zeroCounts.push({ name: r.cinemaName });
}
```

So the user would have known about this within 24h of switching to local.

## Suggested next step

Open `src/scrapers/cinemas/bfi.ts`, look at the `createBFIScraper("bfi-imax")` path, and run it locally:

```bash
npm run scrape:bfi -- imax
```

Inspect what the scraper actually returns. Likely fixes:
- Update DOM selector for the listings container
- Add `await page.waitForSelector(...)` if the page is JS-rendered and the scraper races
- Check whether `bfi-imax` venue page URL still resolves (cinema sites sometimes restructure paths)

After fix: re-run `local-vs-baseline.ts --window 1` to confirm it's back to 🟢 OK.
