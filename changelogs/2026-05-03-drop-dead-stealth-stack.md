# Drop deprecated playwright-extra + StealthPlugin

**PR**: TBD
**Date**: 2026-05-03
**Branch**: `feat/unified-scrape-slash-command`

## Why

Stream 1 of the scraping rethink ("Browser automation library survey") found:

- **`playwright-extra` is effectively dead** — last meaningful commit March 2023.
- **`puppeteer-extra-plugin-stealth` is consistently blocked by Cloudflare's 2024+ behavioural analysis** — it doesn't actually evade bot detection on the chains we care about.

Stream 3 reached the same conclusion independently: *"remove the deprecated playwright-extra/StealthPlugin layer (deprecated Feb 2025)"*.

The hand-rolled `addInitScript` evasions in `createPage()` (navigator.webdriver, plugins, languages, hardwareConcurrency, chrome.runtime, iframe.contentWindow, etc.) cover the same surface deterministically. `rebrowser-playwright`'s binary CDP patches do the actual heavy lifting against modern fingerprinting (Runtime.Enable leak).

The full Patchright migration that Stream 1 recommended is deferred to a follow-up PR — it requires `npm install` to add `patchright-nodejs`, and npm install hangs in the agent sandbox. The strategic move is queued; the immediate win (drop dead deps) lands now.

## Changes

### `src/scrapers/utils/browser.ts`

- Removed: `import { addExtra } from "playwright-extra"`
- Removed: `import StealthPlugin from "puppeteer-extra-plugin-stealth"`
- Removed: 17 lines of `stealth.enabledEvasions.add(...)` calls + `chromium.use(stealth)` + `addExtra(rebrowserChromium)` wrapper
- Removed: `as unknown as Browser` cast (the cast was needed only because playwright-extra returned a Browser typed against a different playwright-core version; now the types unify naturally)
- Header comment updated to reflect the simpler stealth posture and point to the research artefact for the Patchright follow-up

### `package.json`

Dropped: `playwright-extra` + `puppeteer-extra-plugin-stealth` from `dependencies`.

### `next.config.ts`

`serverExternalPackages` shrunk: removed `playwright-extra`, `puppeteer-extra`, `puppeteer-extra-plugin`, `puppeteer-extra-plugin-stealth`. Kept `playwright`, `playwright-core`, `rebrowser-playwright` (still needed for webpack to skip their .ttf/.html/electron assets in the production build).

## Verification

- `npx tsc --noEmit` — clean (the `as unknown as Browser` cast that was previously documented as "structural-shape-safe" is no longer needed; types unify)
- `npm run test:run` — 918/918 passing
- Hand-rolled init-script evasions in `createPage()` left untouched; they remain the front-line defence.

## Why not the full Patchright migration

Stream 1 explicitly recommended `patchright-nodejs` as the strategic replacement for the entire rebrowser+playwright-extra+stealth stack. That migration:
- Touches 18 files (every `from "rebrowser-playwright"`)
- Requires `npm install patchright-nodejs` then `npm uninstall rebrowser-playwright`
- Needs runtime validation against the chain trio (especially Curzon)

`npm install` hangs in the current agent sandbox. The migration is queued as a follow-up PR; this PR delivers the easy half (dropping verifiably-dead deps) without blocking on infrastructure.

## What's no longer in the codebase

| Removed | Why it was there | What replaces it |
|---|---|---|
| `playwright-extra` | Compose framework for stealth plugins | Nothing — single-layer `rebrowser-playwright` + hand-rolled init scripts |
| `puppeteer-extra-plugin-stealth` | 17 fingerprint evasions | Hand-rolled `addInitScript` block in `createPage()` |
| `as unknown as Browser` cast | Type mismatch between playwright-extra's resolved Browser and rebrowser-playwright's | Direct import — types now unify |
