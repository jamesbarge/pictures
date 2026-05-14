/**
 * Browser utilities for Playwright-based scraping. Handles sites with
 * JavaScript rendering and bot protection.
 *
 * Stealth posture: rebrowser-playwright's binary CDP patches (the
 * Runtime.Enable leak Cloudflare/DataDome detect in 2026) plus the
 * hand-rolled `addInitScript` evasions in `createPage()` below.
 *
 * The previous double-layer (`addExtra(rebrowserChromium).use(stealth)`)
 * was dropped 2026-05-03 — `playwright-extra` has no meaningful commit
 * since March 2023 and `puppeteer-extra-plugin-stealth` is consistently
 * blocked by Cloudflare's 2024+ behavioural analysis. The hand-rolled
 * evasions in `createPage()` cover the same surface deterministically.
 *
 * For reasoning + replacement options (Patchright, Camoufox), see
 * `Pictures/Research/scraping-rethink-2026-05/01-browser-automation-libraries.md`.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "rebrowser-playwright";
import { CHROME_USER_AGENT_FULL } from "../constants";
import * as os from "os";
import * as path from "path";

let browser: Browser | null = null;

/** Get or create a shared browser instance with stealth flags. */
export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--headless=new",
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--start-maximized",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-infobars",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--ignore-certificate-errors",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
  }
  return browser;
}

/**
 * Close the shared browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Create a new page with anti-detection settings
 */
export async function createPage(): Promise<Page> {
  const activeBrowser = await getBrowser();

  // Randomize viewport slightly to avoid fingerprinting
  const width = 1920 + Math.floor(Math.random() * 100);
  const height = 1080 + Math.floor(Math.random() * 50);

  const context = await activeBrowser.newContext({
    userAgent: CHROME_USER_AGENT_FULL,
    viewport: { width, height },
    locale: "en-GB",
    timezoneId: "Europe/London",
    geolocation: { latitude: 51.5074, longitude: -0.1278 }, // London
    permissions: ["geolocation"],
    colorScheme: "light",
    reducedMotion: "no-preference",
    forcedColors: "none",
    acceptDownloads: false,
    hasTouch: false,
    isMobile: false,
    javaScriptEnabled: true,
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Comprehensive anti-detection script
  await page.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Mock plugins array
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });

    // Mock languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-GB", "en-US", "en"],
    });

    // Mock hardware concurrency (number of CPU cores)
    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => 8,
    });

    // Mock device memory
    Object.defineProperty(navigator, "deviceMemory", {
      get: () => 8,
    });

    // Override permissions query (anti-detection requires non-standard API manipulation)
    const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator.permissions as any).query = (parameters: PermissionDescriptor) => {
      if (parameters.name === "notifications") {
        return Promise.resolve({ state: "denied", onchange: null });
      }
      return originalQuery(parameters);
    };

    // Mock chrome runtime (anti-detection requires adding non-standard window properties)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = {
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    };

    // Prevent iframe detection
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get: function () {
        return window;
      },
    });
  });

  return page;
}

/**
 * Create a persistent-context Page for sites that require cookie persistence
 * across runs to bypass Cloudflare (notably BFI).
 *
 * Unlike `getBrowser()` + `createPage()`, this launches its own browser using
 * a stable user data directory on disk — Cloudflare's `cf_clearance` cookie
 * and the JA3/JA4 fingerprint warmth are preserved between runs. A cold
 * `chromium.launch()` re-issues the Cloudflare challenge every time; the
 * persistent context lets us pass it once and reuse the result.
 *
 * Verified 2026-05-14 against BFI Southbank: cold persistent run cleared
 * the challenge and returned real HTML; the previous shared-browser path
 * timed out the challenge and got 0 dates parsed.
 *
 * Returns `{ context, page }`. Caller MUST `context.close()` in cleanup
 * (do NOT call `closeBrowser()` — this context is independent of the
 * shared singleton).
 */
/**
 * IMPORTANT: profileKey must be unique per concurrent caller. Chromium uses a
 * SingletonLock file inside the user-data directory; if two processes call
 * `launchPersistentContext` with the same dir simultaneously, the second one
 * will fail to start or silently corrupt the profile. In practice we always
 * use distinct keys ("bfi-southbank", "bfi-imax", "bfi-southbank-healthcheck",
 * "bfi-pdf-discovery") and the scrapers don't fan out beyond one venue per
 * Playwright wave slot — but if you add a new caller that may overlap with an
 * existing one, namespace your profileKey accordingly.
 */
export async function createPersistentPage(
  profileKey: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const userDataDir = path.join(os.tmpdir(), `pictures-scraper-${profileKey}`);

  // Intentionally minimal config. The standalone bypass test (see
  // `scripts/_tmp_bfi_persistent_test.ts`) showed that a *minimal* persistent
  // context with only the webdriver-flag eviction passes Cloudflare on BFI,
  // while the full anti-detection suite from `createPage()` (plugins, hardware,
  // languages, chrome.runtime overrides) trips fingerprint inconsistency
  // detection and the challenge never clears. Less is more here.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    userAgent: CHROME_USER_AGENT_FULL,
    viewport: { width: 1920, height: 1080 },
    locale: "en-GB",
    timezoneId: "Europe/London",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--window-size=1920,1080",
    ],
  });

  // Persistent contexts ship with one blank page already. Reuse it.
  const page = context.pages()[0] ?? await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return { context, page };
}

/**
 * Wait for Cloudflare challenge to complete with human-like behavior.
 *
 * The challenge state is detected via the page **title**, not HTML body. The
 * old body-string check (which looked for "challenge-platform" / "Just a
 * moment" / "Checking your browser" / "cf-spinner") false-positived on every
 * Cloudflare-protected site even when the challenge had cleared — those
 * strings persist in embedded Cloudflare scripts even on fully-loaded pages.
 * Verified 2026-05-14: BFI Southbank pages load fully with HTTP 200 and real
 * content but the body still contains "challenge-platform" via inline scripts.
 *
 * Title-based detection is reliable because Cloudflare uses dedicated
 * interstitial titles ("Just a moment...", "One moment, please...",
 * "Attention Required! | Cloudflare") during the actual challenge and the
 * real site title appears immediately on pass.
 *
 * Also: `page.title()` / `page.content()` can throw during in-flight
 * navigation (the "page is navigating" error seen on BFI IMAX health check
 * in the 2026-05-12 /scrape run). Treat thrown errors as "still settling"
 * rather than terminal — keep polling until the timeout.
 */
const CLOUDFLARE_CHALLENGE_TITLES = [
  /^just a moment/i,
  /^one moment, please/i,
  /^please wait/i,
  /^checking your browser/i,
  /attention required.*cloudflare/i,
];

export async function waitForCloudflare(page: Page, maxWaitSeconds = 60): Promise<boolean> {
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    let title = "";
    try {
      title = await page.title();
    } catch {
      // page may be navigating; retry after a tick
      await page.waitForTimeout(500);
      continue;
    }

    const stillChallenged = title === "" || CLOUDFLARE_CHALLENGE_TITLES.some(rx => rx.test(title));
    if (!stillChallenged) return true;

    // Simulate human-like mouse movement during challenge
    try {
      const x = 100 + Math.random() * 200;
      const y = 100 + Math.random() * 200;
      await page.mouse.move(x, y);

      if (Math.random() < 0.1) {
        await page.mouse.click(x, y);
      }
    } catch {
      // ignore mouse movement errors during navigation
    }

    await page.waitForTimeout(1000 + Math.random() * 1000);
  }

  return false;
}

/**
 * Fetch HTML from a URL using Playwright
 */
export async function fetchWithBrowser(
  url: string,
  options: {
    waitFor?: string; // CSS selector to wait for
    timeout?: number;
    delay?: number; // Additional delay after page load
  } = {}
): Promise<string> {
  const { waitFor, timeout = 30000, delay = 2000 } = options;

  const page = await createPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout,
    });

    // Wait for specific element if provided
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout });
    }

    // Additional delay to ensure dynamic content loads
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    return await page.content();
  } finally {
    await page.close();
  }
}
