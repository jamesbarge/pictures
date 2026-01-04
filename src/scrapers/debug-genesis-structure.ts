import * as cheerio from "cheerio";

async function debug() {
  const url = "https://genesiscinema.co.uk/event/105991";
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  console.log("\n=== TITLE ===");
  console.log("h1:", $("h1").first().text().trim().slice(0, 100));

  console.log("\n=== FIRST WHATSON_PANEL CONTENT ===");
  const firstPanel = $(".whatson_panel").first();
  console.log("Panel ID:", firstPanel.attr("id"));
  console.log("\nAll links in this panel:");
  firstPanel.find("a").each((i, el) => {
    const link = $(el);
    const href = link.attr("href") || "";
    const text = link.text().trim().slice(0, 50);
    console.log(`  ${i}: "${text}" -> ${href.slice(0, 80)}`);
  });

  console.log("\n=== LOOKING FOR SHOWTIME PATTERNS ===");
  // Look for any time-like text patterns
  firstPanel.find("a").each((i, el) => {
    const link = $(el);
    const text = link.text().trim();
    if (/\d{1,2}:\d{2}/.test(text)) {
      console.log(`Time link: "${text}" -> ${link.attr("href")}`);
    }
  });

  console.log("\n=== RAW PANEL HTML (first 2000 chars) ===");
  console.log(firstPanel.html()?.slice(0, 2000));
}

debug().catch(console.error);
