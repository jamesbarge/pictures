/**
 * Event Classification Script
 *
 * Classifies screenings based on their film titles to extract:
 * - Event types (Q&A, preview, singalong, etc.)
 * - Formats (35mm, 70mm, IMAX, 4K)
 * - Accessibility features
 * - Season/retrospective info
 *
 * Run with: npm run db:classify-events
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { sql, eq } from "drizzle-orm";
import {
  classifyEvent,
  likelyNeedsClassification,
} from "@/lib/event-classifier";

// Batch size for processing (smaller = more frequent progress updates)
const BATCH_SIZE = 5;
// Delay between requests to respect rate limits (5 req/min = 12s between)
const REQUEST_DELAY_MS = 13000;

async function classifyEvents() {
  console.log("🏷️  Classifying screening events...\n");

  // Find films that likely need classification
  const allFilms = await db
    .select({ id: films.id, title: films.title })
    .from(films);

  const filmsToClassify = allFilms.filter((f) =>
    likelyNeedsClassification(f.title)
  );

  console.log(
    `Found ${filmsToClassify.length} films that likely need classification\n`
  );

  if (filmsToClassify.length === 0) {
    console.log("✅ No films need classification!");
    process.exit(0);
  }

  let classified = 0;
  let updated = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < filmsToClassify.length; i += BATCH_SIZE) {
    const batch = filmsToClassify.slice(i, i + BATCH_SIZE);

    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(filmsToClassify.length / BATCH_SIZE)}...`
    );

    for (let j = 0; j < batch.length; j++) {
      const film = batch[j];

      // Delay between requests to respect rate limits (5 req/min)
      if (j > 0) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }

      try {
        const classification = await classifyEvent(film.title);
        classified++;

        // Only update if we found something meaningful
        if (
          classification.eventTypes.length > 0 ||
          classification.format ||
          classification.hasSubtitles ||
          classification.hasAudioDescription ||
          classification.isRelaxedScreening ||
          classification.season
        ) {
          // Update all screenings for this film
          await db
            .update(screenings)
            .set({
              isSpecialEvent: classification.isSpecialEvent,
              eventType: classification.eventTypes[0] || null, // Primary event type
              eventDescription:
                classification.eventTypes.length > 1
                  ? `Also: ${classification.eventTypes.slice(1).join(", ")}`
                  : classification.eventDescription,
              format: classification.format,
              is3D: classification.is3D,
              hasSubtitles: classification.hasSubtitles,
              subtitleLanguage: classification.subtitleLanguage,
              hasAudioDescription: classification.hasAudioDescription,
              isRelaxedScreening: classification.isRelaxedScreening,
              season: classification.season,
              updatedAt: new Date(),
            })
            .where(eq(screenings.filmId, film.id));

          console.log(
            `  ✓ "${film.title}" → ${classification.eventTypes.join(", ") || "format/accessibility only"}`
          );
          updated++;
        } else {
          console.log(`  - "${film.title}" → no special event detected`);
        }
      } catch (e) {
        console.error(`  ✗ Failed: "${film.title}"`, e);
        failed++;
      }
    }

    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < filmsToClassify.length) {
      console.log(`  Waiting ${REQUEST_DELAY_MS / 1000}s before next batch...`);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  console.log(`
==================================================
Classification complete:
  Classified: ${classified} films
  Updated:    ${updated} films with event data
  Failed:     ${failed} films
==================================================
`);

  // Show summary of event types found
  const summary = await db.execute(sql`
    SELECT event_type, COUNT(*) as count
    FROM screenings
    WHERE event_type IS NOT NULL
    GROUP BY event_type
    ORDER BY count DESC
  `);

  console.log("\nEvent type distribution:");
  const rows = summary as unknown as Array<{ event_type: string; count: string }>;
  for (const row of rows) {
    console.log(`  ${row.event_type}: ${row.count}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

classifyEvents().catch(console.error);
