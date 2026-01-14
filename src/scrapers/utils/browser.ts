/**
 * Browser utilities for Playwright-based scraping
 * Handles sites with JavaScript rendering and bot protection
 * Uses playwright-extra with stealth plugin to bypass Cloudflare
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page, BrowserContext } from "playwright";

// Add stealth plugin with all evasions enabled
const stealth = StealthPlugin();
stealth.enabledEvasions.add("chrome.app");
stealth.enabledEvasions.add("chrome.csi");
stealth.enabledEvasions.add("chrome.loadTimes");
stealth.enabledEvasions.add("chrome.runtime");
stealth.enabledEvasions.add("defaultArgs");
stealth.enabledEvasions.add("iframe.contentWindow");
stealth.enabledEvasions.add("media.codecs");
stealth.enabledEvasions.add("navigator.hardwareConcurrency");
stealth.enabledEvasions.add("navigator.languages");
stealth.enabledEvasions.add("navigator.permissions");
stealth.enabledEvasions.add("navigator.plugins");
stealth.enabledEvasions.add("navigator.webdriver");
stealth.enabledEvasions.add("sourceurl");
stealth.enabledEvasions.add("user-agent-override");
stealth.enabledEvasions.add("webgl.vendor");
stealth.enabledEvasions.add("window.outerdimensions");
chromium.use(stealth);

let browser: Browser | null = null;

/**
 * Get or create a shared browser instance with stealth mode
 */
export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    // Use "new" headless mode which is harder to detect than legacy headless
    browser = await chromium.launch({
      headless: true,
      args: [
        "--headless=new", // New headless mode, harder to detect
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
  const b = await getBrowser();

  // Randomize viewport slightly to avoid fingerprinting
  const width = 1920 + Math.floor(Math.random() * 100);
  const height = 1080 + Math.floor(Math.random() * 50);

  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
 * Wait for Cloudflare challenge to complete with human-like behavior
 */
export async function waitForCloudflare(page: Page, maxWaitSeconds = 60): Promise<boolean> {
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    const html = await page.content();

    // Check if challenge is complete
    if (!html.includes("challenge-platform") &&
        !html.includes("Checking your browser") &&
        !html.includes("Just a moment") &&
        !html.includes("cf-spinner")) {
      return true;
    }

    // Simulate human-like mouse movement during challenge
    try {
      const x = 100 + Math.random() * 200;
      const y = 100 + Math.random() * 200;
      await page.mouse.move(x, y);

      // Occasionally click (but not on the challenge itself)
      if (Math.random() < 0.1) {
        await page.mouse.click(x, y);
      }
    } catch {
      // Ignore mouse movement errors
    }

    // Random delay between checks (1-2 seconds)
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
