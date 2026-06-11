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
 * Usage:
 *   npm run db:migrate-cinema-ids             # Dry run (shows what would change)
 *   npm run db:migrate-cinema-ids -- --execute  # Apply changes
 */

import { db } from "../index";
import { screenings, cinemas } from "../schema";
import { eq, sql, count, and, inArray } from "drizzle-orm";
import { getLegacyIdMappings, getCinemaById, getCinemasSeedData } from "@/config/cinema-registry";

// ============================================================================
// Configuration
// ============================================================================

const DRY_RUN = !process.argv.includes("--execute");

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
      })
      .from(screenings)
      .where(eq(screenings.cinemaId, legacyId));

    if (legacyScreenings.length === 0) {
      console.log(`  ⏭️  ${legacyId} → ${canonicalId}: No screenings to migrate`);
      continue;
    }

    // Check for collisions: legacy screenings that would conflict with existing canonical ones
    const collisionIds: string[] = [];
    const migrateIds: string[] = [];

    for (const ls of legacyScreenings) {
      const [existing] = await db
        .select({ id: screenings.id })
        .from(screenings)
        .where(
          and(
            eq(screenings.filmId, ls.filmId),
            eq(screenings.cinemaId, canonicalId),
            eq(screenings.datetime, ls.datetime)
          )
        )
        .limit(1);

      if (existing) {
        collisionIds.push(ls.id);
      } else {
        migrateIds.push(ls.id);
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

async function reportOrphanedCinemas(): Promise<void> {
  console.log("\n📍 Step 3: Checking for orphaned cinema records...\n");

  const legacyMappings = getLegacyIdMappings();
  const orphaned: string[] = [];

  for (const [legacyId] of legacyMappings) {
    // Check if legacy cinema still exists
    const [legacyCinema] = await db
      .select({ id: cinemas.id, name: cinemas.name })
      .from(cinemas)
      .where(eq(cinemas.id, legacyId));

    if (legacyCinema) {
      // Check if it has any screenings
      const [result] = await db
        .select({ count: count() })
        .from(screenings)
        .where(eq(screenings.cinemaId, legacyId));

      const screeningCount = Number(result?.count) || 0;

      if (screeningCount === 0) {
        orphaned.push(`${legacyId} (${legacyCinema.name})`);
      }
    }
  }

  if (orphaned.length === 0) {
    console.log("  ✅ No orphaned cinema records found");
  } else {
    console.log("  ⚠️  Orphaned cinema records (no screenings):");
    for (const cinema of orphaned) {
      console.log(`     - ${cinema}`);
    }
    console.log(`\n  These can be manually deleted after verification.`);
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
    await reportOrphanedCinemas();
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

main().then(() => process.exit(0));
