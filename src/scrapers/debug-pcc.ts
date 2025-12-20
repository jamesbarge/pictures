// @ts-nocheck
/**
 * Debug Prince Charles Cinema parsing
 */

import * as cheerio from "cheerio";

async function debugPCC() {
  console.log("🔍 Debugging PCC parsing...\n");

  const response = await fetch("https://princecharlescinema.com/whats-on/");
  const html = await response.text();

  console.log(`Got ${html.length} bytes of HTML\n`);

  const $ = cheerio.load(html);

  // Check for film containers
  const films = $(".jacro-event.movie-tabs");
  console.log(`Found ${films.length} .jacro-event.movie-tabs elements\n`);

  if (films.length === 0) {
    // Try alternative selectors
    console.log("Trying alternative selectors...");
    console.log("  .jacro-event:", $(".jacro-event").length);
    console.log("  .movie-tabs:", $(".movie-tabs").length);
    console.log("  .jacrofilm-list:", $(".jacrofilm-list").length);
    console.log("  .film_list-outer:", $(".film_list-outer").length);
    console.log("  .liveeventtitle:", $(".liveeventtitle").length);
    console.log();
  }

  // Sample first few films
  films.slice(0, 3).each((i, el) => {
    const $film = $(el);
    console.log(`\n--- Film ${i + 1} ---`);
    console.log("Title:", $film.find(".liveeventtitle").text().trim());
    console.log("Classes:", $film.attr("class"));

    const perfList = $film.find(".performance-list-items");
    console.log("Performance lists found:", perfList.length);

    if (perfList.length > 0) {
      const children = perfList.first().children();
      console.log("Children in first perf list:", children.length);

      children.slice(0, 10).each((j, child) => {
        const $child = $(child);
        console.log(`  Child ${j}: <${child.tagName}> class="${$child.attr("class") || ""}" text="${$child.text().trim().slice(0, 50)}"`);
      });
    }
  });
}

debugPCC()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
