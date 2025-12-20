// @ts-nocheck
/**
 * Debug script to analyze BFI website structure
 */

import { fetchWithBrowser, closeBrowser } from "./utils/browser";
import * as cheerio from "cheerio";
import * as fs from "fs";

async function debugBFI() {
  console.log("🔍 Debugging BFI website structure...\n");

  try {
    const url = "https://whatson.bfi.org.uk/Online/";
    console.log(`Fetching: ${url}`);

    const html = await fetchWithBrowser(url, {
      waitFor: "body",
      timeout: 60000,
      delay: 5000,
    });

    console.log(`Got ${html.length} bytes`);

    // Save raw HTML
    fs.writeFileSync("/tmp/bfi-debug.html", html);
    console.log("Saved to /tmp/bfi-debug.html");

    // Analyze structure
    const $ = cheerio.load(html);

    console.log("\n=== Page Title ===");
    console.log($("title").text());

    console.log("\n=== Main Containers ===");
    console.log("- #main:", $("#main").length);
    console.log("- .content:", $(".content").length);
    console.log("- .container:", $(".container").length);

    console.log("\n=== Film-related Classes ===");
    const classes = new Set<string>();
    $("[class]").each((_, el) => {
      const classList = $(el).attr("class")?.split(/\s+/) || [];
      classList.forEach((c) => {
        if (c.toLowerCase().includes("film") ||
            c.toLowerCase().includes("event") ||
            c.toLowerCase().includes("screen") ||
            c.toLowerCase().includes("show")) {
          classes.add(c);
        }
      });
    });
    console.log([...classes].slice(0, 20).join(", "));

    console.log("\n=== Links with 'Online' ===");
    const links = $('a[href*="Online"]').slice(0, 10);
    links.each((i, el) => {
      const $el = $(el);
      console.log(`  ${i + 1}. ${$el.text().trim().slice(0, 50)} -> ${$el.attr("href")?.slice(0, 60)}`);
    });

    console.log("\n=== Date-related Elements ===");
    $("[class*='date'], [class*='time'], .date, .time").slice(0, 5).each((_, el) => {
      console.log(`  - ${$(el).attr("class")}: "${$(el).text().trim().slice(0, 50)}"`);
    });

    console.log("\n=== h2/h3/h4 Elements (film titles?) ===");
    $("h2, h3, h4").slice(0, 10).each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 3 && text.length < 100) {
        console.log(`  - ${el.tagName}: "${text}"`);
      }
    });

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await closeBrowser();
  }
}

debugBFI().then(() => process.exit(0));
