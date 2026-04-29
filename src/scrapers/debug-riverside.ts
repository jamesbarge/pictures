// @ts-nocheck
/**
 * Debug script to investigate Riverside Studios website
 */

import { chromium } from "rebrowser-playwright";

async function debugRiverside() {
  console.log("[debug] Starting Riverside Studios investigation...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const apiCalls: { url: string; method: string; size?: number }[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("api") ||
      url.includes("json") ||
      url.includes("graphql") ||
      url.includes("film") ||
      url.includes("cinema") ||
      url.includes("event") ||
      url.includes("screening")
    ) {
      console.log("[request]", request.method(), url.substring(0, 150));
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    if (contentType.includes("json")) {
      try {
        const text = await response.text();
        console.log("\n[JSON Response]", url.substring(0, 100), "Size:", text.length);

        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            console.log("Array length:", json.length);
            if (json.length > 0) console.log("Sample keys:", Object.keys(json[0]).slice(0, 10));
          } else {
            console.log("Object keys:", Object.keys(json).slice(0, 15));
          }
        } catch {}

        apiCalls.push({ url, method: "GET", size: text.length });
      } catch {}
    }
  });

  try {
    // Try the main page first
    console.log("\n[debug] Loading main page...");
    await page.goto("https://riversidestudios.co.uk/", {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // Get page title
    const title = await page.title();
    console.log("[Page title]", title);

    // Look for navigation links
    const navLinks = await page.locator("a").all();
    const linkHrefs: string[] = [];
    for (const link of navLinks.slice(0, 50)) {
      try {
        const href = await link.getAttribute("href");
        if (href && (href.includes("cinema") || href.includes("film") || href.includes("what"))) {
          linkHrefs.push(href);
        }
      } catch {}
    }
    console.log("\n[Cinema/Film links found]", [...new Set(linkHrefs)]);

    // Check for embedded content
    const bodyText = await page.locator("body").textContent();
    const words = (bodyText || "").split(/\s+/).filter(w => w.length > 3).slice(0, 100);
    console.log("\n[Page content sample]", words.join(" ").substring(0, 500));

    // Try the whats-on page
    console.log("\n[debug] Loading whats-on page...");
    await page.goto("https://riversidestudios.co.uk/whats-on/", {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // Look for event titles
    const titles = await page.locator("h1, h2, h3, h4, .title, .event-title").allTextContents();
    console.log("\n[Titles found]", titles.filter(t => t.trim().length > 2).slice(0, 20));

    console.log("\n\n[debug] API calls captured:", apiCalls.length);
    for (const call of apiCalls.slice(0, 20)) {
      console.log(" -", call.url.substring(0, 120), `(${call.size} bytes)`);
    }

    await page.screenshot({ path: "/tmp/riverside-debug.png", fullPage: true });
    console.log("\n[debug] Screenshot saved to /tmp/riverside-debug.png");

  } finally {
    await browser.close();
  }
}

debugRiverside().catch(console.error);
