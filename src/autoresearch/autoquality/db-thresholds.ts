/**
 * DB-backed threshold persistence for AutoQuality.
 *
 * Solves the #1 AutoResearch problem: Trigger.dev cloud has ephemeral
 * filesystems, so thresholds.json resets to bundled defaults on every deploy.
 * This module reads/writes thresholds to the `autoresearch_config` table,
 * falling back to bundled defaults if no DB row exists.
 */

import { db, isDatabaseAvailable } from "@/db";
import { autoresearchConfig } from "@/db/schema/admin";
import { eq } from "drizzle-orm";
import type { Thresholds } from "./load-thresholds";

// Static import: used as fallback when DB has no row yet
import defaultThresholds from "./thresholds.json";

const THRESHOLDS_KEY = "autoquality/thresholds";

/**
 * Load thresholds from the database.
 * Falls back to bundled thresholds.json defaults if no DB row exists
 * or if the database is unavailable.
 */
export async function loadThresholdsFromDb(): Promise<Thresholds> {
  if (!isDatabaseAvailable) {
    console.warn("[autoquality] DB unavailable — using bundled thresholds");
    return getBundledDefaults();
  }

  try {
    const [row] = await db
      .select()
      .from(autoresearchConfig)
      .where(eq(autoresearchConfig.key, THRESHOLDS_KEY))
      .limit(1);

    if (!row) {
      console.log("[autoquality] No thresholds in DB — using bundled defaults");
      return getBundledDefaults();
    }

    console.log(
      `[autoquality] Loaded thresholds from DB (updated: ${row.updatedAt.toISOString()}, by: ${row.updatedBy ?? "unknown"})`
    );
    return row.value as unknown as Thresholds;
  } catch (err) {
    console.error("[autoquality] Failed to load thresholds from DB — using bundled defaults:", err);
    return getBundledDefaults();
  }
}

/**
 * Save thresholds to the database.
 * Upserts the row so this works whether or not a seed row exists.
 */
export async function saveThresholdsToDb(
  thresholds: Thresholds,
  updatedBy = "autoquality-run"
): Promise<void> {
  if (!isDatabaseAvailable) {
    console.warn("[autoquality] DB unavailable — cannot persist thresholds");
    return;
  }

  try {
    await db
      .insert(autoresearchConfig)
      .values({
        key: THRESHOLDS_KEY,
        value: thresholds as unknown as Record<string, unknown>,
        updatedAt: new Date(),
        updatedBy,
      })
      .onConflictDoUpdate({
        target: autoresearchConfig.key,
        set: {
          value: thresholds as unknown as Record<string, unknown>,
          updatedAt: new Date(),
          updatedBy,
        },
      });

    console.log(`[autoquality] Saved thresholds to DB (by: ${updatedBy})`);
  } catch (err) {
    console.error("[autoquality] Failed to save thresholds to DB:", err);
    throw err; // Caller needs to know persistence failed
  }
}

function getBundledDefaults(): Thresholds {
  const copy = { ...defaultThresholds } as Record<string, unknown>;
  delete copy.$comment;
  return copy as unknown as Thresholds;
}
