# BFI scraper — Cloudflare bypass + PDF importer revived

**PR**: TBD
**Date**: 2026-05-14

## Summary

The BFI scraper was returning 0 screenings in the 2026-05-12 unified `/scrape` run — the only silent-breaker reported by the health check. Multiple stacked failures across the Playwright path AND the playbook-preferred PDF importer path. This PR revives the PDF importer end-to-end:

- **Before**: `npm run scrape:bfi` → 0 screenings imported (Cloudflare timeout, calendar grid never loaded)
- **Before**: `npm run scrape:bfi-pdf` → 0 screenings (403 Forbidden on discovery, `Promise.try is not a function` on parse, line-based parser found 0 films on continuous text)
- **After**: `npm run scrape:bfi-pdf` → 99 screenings across 53 films imported successfully

## Failure modes (all stacked)

### 1. Shared browser launches cold every run

`utils/browser.ts:getBrowser()` calls `chromium.launch()` fresh each invocation. Cloudflare's `cf_clearance` cookie isn't persisted, so the challenge is re-issued on every scrape — typically takes 30-45s to clear, often timing out before the calendar grid renders.

### 2. `waitForCloudflare()` false-positives on embedded Cloudflare scripts

The original check searched the full HTML for strings like `"challenge-platform"`, `"Just a moment"`, `"Checking your browser"`. BFI's pages include inline Cloudflare scripts that contain these strings even when fully loaded — so the function returned `false` even after the challenge had cleared. Verified 2026-05-14 via diagnostic: loaded HTML had real BFI content but the string match still triggered.

### 3. `waitForCloudflare()` threw on transient navigation

`page.content()` throws `"Unable to retrieve content because the page is navigating"` mid-redirect — observed on BFI IMAX health check in the 2026-05-12 run. Stack-traced as `Health check failed`.

### 4. Click-based scraping is structurally broken under Cloudflare

The BFI calendar uses a Vista Online .asp form submit when a date is clicked. Each click triggers a fresh Cloudflare challenge that does not clear within reasonable timeouts. The Playwright click flow is unsalvageable locally.

### 5. PDF importer path also broken — four sub-failures

- `bfi_import_runs` table missing in prod DB. Migration `0006_add_bfi_import_runs.sql` was never applied.
- `bfi_import_status` enum was created elsewhere with stale values (`pending, processing, completed, failed`). The migration's `IF NOT EXISTS` skipped creation, leaving the DB out of sync with the schema (which expects `success, degraded, failed`).
- `unpdf@1.4.0` calls `Promise.try` internally. Promise.try is Stage-3 ES2026 / V8 13.3 / Node 22.7+. Node 22.22.2 in use lacks it → `TypeError: Promise.try is not a function` mid-parse.
- `extractText()` from unpdf returns the PDF as one continuous 57k-char string with no newlines. The parser's line-based logic finds 0 films.
- The discovery page `whatson.bfi.org.uk/.../bfisouthbankguide` is Cloudflare-protected → direct fetch returns 403 Forbidden.

## Fixes

### `utils/browser.ts` — `createPersistentPage()`

New helper. Launches `chromium.launchPersistentContext()` with a stable user-data directory keyed by `profileKey`. Cookies and TLS/JA3 fingerprint warmth persist across runs, so Cloudflare passes on subsequent visits.

Intentionally minimal config: only `--disable-blink-features=AutomationControlled`, `--no-sandbox`, `--window-size=1920,1080` and the `webdriver` flag eviction. The full anti-detection suite (plugins, hardware, languages, chrome.runtime overrides) caused fingerprint *inconsistencies* that Cloudflare detected — less is more.

```ts
export async function createPersistentPage(profileKey: string): Promise<{ context, page }> {
  const userDataDir = path.join(os.tmpdir(), `pictures-scraper-${profileKey}`);
  const context = await chromium.launchPersistentContext(userDataDir, { ... });
  ...
}
```

### `utils/browser.ts` — `waitForCloudflare()` title-based detection

Replaces HTML string-matching with page-title matching against a regex list of known Cloudflare interstitial titles:

```ts
const CLOUDFLARE_CHALLENGE_TITLES = [
  /^just a moment/i,
  /^one moment, please/i,
  /^please wait/i,
  /^checking your browser/i,
  /attention required.*cloudflare/i,
];
```

`page.title()` errors are now caught and treated as "still settling" rather than terminal — prevents the navigation-race throw seen on the IMAX health check.

### `cinemas/bfi.ts` — switch to persistent context

`initialize()` and `healthCheck()` now call `createPersistentPage()` instead of `getBrowser()` + `createPage()`. `cleanup()` closes its own context rather than the shared singleton (which is still in use by other parallel Playwright scrapers in the same wave).

Also: `initialize()` warms up on `${baseUrl}/default.asp` (the calendar URL we actually use) instead of `baseUrl` (which is a different URL that triggered a separate, fresh challenge when the scraper then navigated to the calendar).

### `bfi-pdf/fetcher.ts` — Playwright fallback for HTML

`proxyFetch()` now falls back to `fetchViaPlaywright(url)` when direct fetch returns 403 or 503. The persistent context fetches the HTML, returns it wrapped in a `Response` object so callers don't need to know about the fallback path.

PDF binary downloads on `core-cms.bfi.org.uk` are NOT Cloudflare-protected and continue to use plain fetch.

### `bfi-pdf/pdf-parser.ts` — `Promise.try` polyfill + text segmentation

Polyfill is defined at the top of the module, BEFORE the unpdf import, so it's in place when unpdf evaluates:

```ts
if (typeof (Promise as { try?: unknown }).try !== "function") {
  (Promise as ...).try = function<T>(fn, ...args) {
    return new Promise((resolve, reject) => {
      try { resolve(fn(...args)); } catch (err) { reject(err); }
    });
  };
}
```

`segmentBFIText()` injects newlines at structural boundaries (before screening patterns and before metadata patterns) so the existing line-based parser logic can work:

```ts
// Before screening lines
text.replace(/(?=\b(?:MON|TUE|...)\s+\d{1,2}\s+(?:JAN|FEB|...)\s+\d{1,2}:\d{2}\s+(?:NFT\d|IMAX|STUDIO|BFI\s+IMAX))/gi, "\n");
// Before metadata lines (Country YYYY. Director ...)
text.replace(/(?=\b[A-Z][A-Za-z\-À-ſ]*(?:\s+...)?\s+(?:19|20)\d{2}\.\s+(?:Director|Dir\.))/g, "\n");
```

Parser also filters parse-artifact titles: country-code-only stubs like `"UK-"` and lowercase sentence fragments are rejected.

### DB schema fixes (applied to prod)

- Applied `0006_add_bfi_import_runs.sql` (idempotent — uses `IF NOT EXISTS` everywhere)
- ALTERed `bfi_import_status` enum: `ADD VALUE IF NOT EXISTS 'success'`, `ADD VALUE IF NOT EXISTS 'degraded'`

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (pre-existing warnings only)
- `npm run test:run` — 910/910 pass
- `npm run test:run src/scrapers/bfi-pdf src/scrapers/utils/browser` — 20/20 pass
- `npm run scrape:bfi-pdf` — `Parsed 53 films with 99 screenings`, 99 saved to DB, status DEGRADED (programme changes still 403s, but PDF source is success)

## Known limitations / follow-ups

1. **Unified `/scrape` still runs the Playwright click flow**, which is broken. Two options:
   - Replace `createBFIScraper(venueId)` in `cinemas/bfi.ts` to delegate to `runBFIImport()` and return `[]` (PDF importer saves directly)
   - Drop `scraper-bfi` from the Playwright wave registry and rely on `npm run scrape:bfi-pdf` as a separate scheduled step
2. **Coverage at ~57%** — 99 imported vs 174 screening patterns found in the same PDF. The segmentation regex could be tightened to catch more boundaries (currently misses some films whose country name format doesn't match the regex).
3. **Only the most recent PDF is parsed** — `fetchAllRelevantPDFs()` exists but `runBFIImport` calls `fetchLatestPDF()`. Parsing both May + June PDFs would roughly double coverage.
4. **Programme changes page still 403s** — the Playwright fallback only fires through `proxyFetch`. `fetchProgrammeChanges` may bypass `proxyFetch` — needs investigation.
5. **`createPersistentPage` profile dirs are in `os.tmpdir()`** — survive across runs locally but get wiped on macOS reboot (which is fine; first run after reboot just takes the Cloudflare challenge once).
