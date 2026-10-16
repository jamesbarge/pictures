#!/usr/bin/env npx tsx
/**
 * Cinema ID Canonicalization Migration
 *
 * Migrates screenings from legacy cinema IDs to canonical IDs.
 *
 * Legacy ID mappings:
 * - nickel → the-nickel
 * - genesis-mile-end → genesis
 * - garden-cinema → garden
 * - close-up → close-up-cinema
 * - phoenix → phoenix-east-finchley
 * - phoenix-cinema → phoenix-east-finchley
 * - olympic → olympic-studios
 * - david-lean → david-lean-cinema
 * - riverside → riverside-studios
 * - electric → electric-portobello
 * - gate-notting-hill → gate-picturehouse
 * - picturehouse-ritzy → ritzy-brixton
 * - everyman-screen-on-the-green → screen-on-the-green
 *
 * A legacy row collides with a canonical row when they are the same showing:
 * the same film at the same time, the same source id, or the same booking URL
 * at the same time. The Nickel split stored one showing twice, once under a
 * dirtier film title (`THE UNKNOWN (ON 16MM` vs `The Unknown`), so film id
 * alone did not see the collision and the update then hit the
 * (cinema_id, source_id) unique index.
 *
 * Legacy cinema rows with no screenings left are deleted. Every foreign key to
 * cinemas.id cascades, so the delete also removes that row's scraper runs,
 * baselines and health snapshots.
 *
 * Usage:
 *   npm run db:migrate-cinema-ids             # Dry run (shows what would change)
 *   npm run db:migrate-cinema-ids -- --execute  # Apply changes
 *
 * The flag is `--execute`. `--apply` is a dry run.
 */

import { db } from "../index";
import { screenings, cinemas } from "../schema";
import { eq, count, inArray } from "drizzle-orm";
import { getLegacyIdMappings, getCinemaById, getCinemasSeedData } from "@/config/cinema-registry";

// ============================================================================
// Configuration
// ============================================================================

const DRY_RUN = !process.argv.includes("--execute");

/** Identity used to decide whether a legacy screening is already stored canonically. */
export interface ScreeningIdentity {
  filmId: string;
  datetime: Date;
  sourceId: string | null;
  bookingUrl: string;
}

/**
 * True when the legacy row is the same showing as one already under the
 * canonical cinema. Those rows are deleted. The rest are moved.
 *
 * Booking URL is only a collision at the same instant. Rio reuses one film-page
 * URL for every performance, and those are different showings.
 */
export function legacyScreeningCollides(
  legacy: ScreeningIdentity,
  canonical: ScreeningIdentity,
): boolean {
  const sameInstant = legacy.datetime.getTime() === canonical.datetime.getTime();
  if (legacy.filmId === canonical.filmId && sameInstant) return true;
  if (legacy.sourceId && legacy.sourceId === canonical.sourceId) return true;
  if (legacy.bookingUrl && sameInstant && legacy.bookingUrl === canonical.bookingUrl) return true;
  return false;
}

// ============================================================================
// Migration Steps
// ============================================================================

async function ensureCanonicalCinemasExist(): Promise<void> {
  console.log("\n📍 Step 1: Ensuring canonical cinema records exist...\n");

  const cinemasSeedData = getCinemasSeedData();
  let created = 0;
  let existing = 0;

  for (const cinema of cinemasSeedData) {
    // Check if cinema exists
    const [existingCinema] = await db
      .select({ id: cinemas.id })
      .from(cinemas)
      .where(eq(cinemas.id, cinema.id));

    if (existingCinema) {
      existing++;
      continue;
    }

    // Create cinema if not exists
    if (!DRY_RUN) {
      await db.insert(cinemas).values({
        id: cinema.id,
        name: cinema.name,
        shortName: cinema.shortName,
        chain: cinema.chain,
        address: cinema.address,
        coordinates: cinema.coordinates,
        screens: cinema.screens,
        features: cinema.features,
        programmingFocus: cinema.programmingFocus,
        website: cinema.website,
        bookingUrl: cinema.bookingUrl,
        dataSourceType: cinema.dataSourceType,
        description: cinema.description,
      });
      console.log(`  ✅ Created: ${cinema.id} (${cinema.name})`);
    } else {
      console.log(`  [DRY RUN] Would create: ${cinema.id} (${cinema.name})`);
    }
    created++;
  }

  console.log(`\n  Summary: ${existing} existing, ${created} ${DRY_RUN ? "would be " : ""}created`);
}

async function migrateScreeningIds(): Promise<void> {
  console.log("\n📍 Step 2: Migrating screening cinema IDs...\n");

  const legacyMappings = getLegacyIdMappings();
  let totalMigrated = 0;
  let totalCollisions = 0;

  for (const [legacyId, canonicalId] of legacyMappings) {
    // Get all screenings with legacy ID
    const legacyScreenings = await db
      .select({
        id: screenings.id,
        filmId: screenings.filmId,
        datetime: screenings.datetime,
        sourceId: screenings.sourceId,
        bookingUrl: screenings.bookingUrl,
      })
      .from(screenings)
      .where(eq(screenings.cinemaId, legacyId));

    if (legacyScreenings.length === 0) {
      console.log(`  ⏭️  ${legacyId} → ${canonicalId}: No screenings to migrate`);
      continue;
    }

    const canonicalScreenings = await db
      .select({
        filmId: screenings.filmId,
        datetime: screenings.datetime,
        sourceId: screenings.sourceId,
        bookingUrl: screenings.bookingUrl,
      })
      .from(screenings)
      .where(eq(screenings.cinemaId, canonicalId));

    // Check for collisions: legacy screenings that would conflict with existing
    // canonical ones, including the same showing stored under a different film.
    const collisionIds: string[] = [];
    const migrateIds: string[] = [];
    const reserved: ScreeningIdentity[] = [...canonicalScreenings];

    for (const ls of legacyScreenings) {
      const identity: ScreeningIdentity = {
        filmId: ls.filmId,
        datetime: ls.datetime,
        sourceId: ls.sourceId,
        bookingUrl: ls.bookingUrl,
      };
      if (reserved.some((existing) => legacyScreeningCollides(identity, existing))) {
        collisionIds.push(ls.id);
      } else {
        migrateIds.push(ls.id);
        reserved.push(identity);
      }
    }

    if (!DRY_RUN) {
      // Delete collisions (canonical version already exists)
      if (collisionIds.length > 0) {
        await db.delete(screenings).where(inArray(screenings.id, collisionIds));
        console.log(`  🗑️  ${legacyId} → ${canonicalId}: Deleted ${collisionIds.length} colliding legacy screenings`);
      }

      // Migrate non-colliding screenings
      if (migrateIds.length > 0) {
        await db
          .update(screenings)
          .set({ cinemaId: canonicalId })
          .where(inArray(screenings.id, migrateIds));
      }

      console.log(`  ✅ ${legacyId} → ${canonicalId}: Migrated ${migrateIds.length}, deleted ${collisionIds.length} collisions`);
    } else {
      console.log(`  [DRY RUN] ${legacyId} → ${canonicalId}: Would migrate ${migrateIds.length}, delete ${collisionIds.length} collisions`);
    }

    totalMigrated += migrateIds.length;
    totalCollisions += collisionIds.length;
  }

  console.log(`\n  Total: ${totalMigrated} migrated, ${totalCollisions} collisions deleted ${DRY_RUN ? "(would be) " : ""}`);
}

async function retireLegacyCinemas(): Promise<void> {
  console.log("\n📍 Step 3: Retiring legacy cinema rows with no screenings left...\n");

  const legacyMappings = getLegacyIdMappings();

  for (const [legacyId, canonicalId] of legacyMappings) {
    const [legacyCinema] = await db
      .select({ id: cinemas.id, name: cinemas.name })
      .from(cinemas)
      .where(eq(cinemas.id, legacyId));

    if (!legacyCinema) {
      console.log(`  ⏭️  ${legacyId}: no cinema row`);
      continue;
    }

    // Step 2 moves or deletes every legacy screening, but only with --execute.
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would delete ${legacyId} (${legacyCinema.name}) once step 2 empties it; canonical is ${canonicalId}`);
      continue;
    }

    const [result] = await db
      .select({ count: count() })
      .from(screenings)
      .where(eq(screenings.cinemaId, legacyId));

    const screeningCount = Number(result?.count) || 0;
    if (screeningCount > 0) {
      console.log(`  ⚠️  ${legacyId}: ${screeningCount} screenings remain; cinema row kept`);
      continue;
    }

    await db.delete(cinemas).where(eq(cinemas.id, legacyId));
    console.log(`  🗑️  Deleted ${legacyId} (${legacyCinema.name})`);
  }
}

async function verifyMigration(): Promise<void> {
  console.log("\n📍 Step 4: Verification...\n");

  // Get all unique cinema IDs from screenings
  const uniqueIds = await db
    .selectDistinct({ cinemaId: screenings.cinemaId })
    .from(screenings);

  const legacyMappings = getLegacyIdMappings();
  const remainingLegacy: string[] = [];

  for (const { cinemaId } of uniqueIds) {
    if (legacyMappings.has(cinemaId)) {
      remainingLegacy.push(cinemaId);
    }
  }

  if (remainingLegacy.length === 0) {
    console.log("  ✅ No legacy IDs found in screenings table");
  } else {
    console.log("  ⚠️  Legacy IDs still present in screenings:");
    for (const id of remainingLegacy) {
      const canonicalId = legacyMappings.get(id);
      console.log(`     - ${id} (should be ${canonicalId})`);
    }
  }

  // Check for cinema records that don't exist in registry
  const allCinemas = await db.select({ id: cinemas.id }).from(cinemas);
  const unknownCinemas: string[] = [];

  for (const { id } of allCinemas) {
    const cinema = getCinemaById(id);
    if (!cinema) {
      unknownCinemas.push(id);
    }
  }

  if (unknownCinemas.length > 0) {
    console.log("\n  ℹ️  Cinema records not in registry (may be custom/test):");
    for (const id of unknownCinemas) {
      console.log(`     - ${id}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        Cinema ID Canonicalization Migration                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN MODE - No changes will be made");
    console.log("   Run with --execute to execute migration\n");
  } else {
    console.log("\n⚡ APPLYING CHANGES\n");
  }

  try {
    await ensureCanonicalCinemasExist();
    await migrateScreeningIds();
    await retireLegacyCinemas();
    await verifyMigration();

    console.log("\n══════════════════════════════════════════════════════════════");
    if (DRY_RUN) {
      console.log("✅ Dry run complete. Run with --execute to execute migration.");
    } else {
      console.log("✅ Migration complete!");
    }
    console.log("══════════════════════════════════════════════════════════════\n");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

// Vitest imports the collision helper from this file. Only the CLI should run.
const invokedDirectly = /canonicalize-cinema-ids\.(ts|js|mjs|cjs)$/.test(
  process.argv[1]?.replace(/\\/g, "/") ?? "",
);
if (invokedDirectly) {
  main().then(() => process.exit(0));
}
