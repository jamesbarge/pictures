/**
 * Storage Migration Utility
 * Migrates localStorage data from old "postboxd-*" keys to new "pictures-*" keys
 *
 * This ensures users don't lose their data during the rebrand from Postboxd to Pictures.
 */

/**
 * Migrate data from an old localStorage key to a new one
 * @param oldKey - The old localStorage key (e.g., "postboxd-filters")
 * @param newKey - The new localStorage key (e.g., "pictures-filters")
 * @returns true if migration occurred, false otherwise
 */
export function migrateStorageKey(oldKey: string, newKey: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const oldData = localStorage.getItem(oldKey);
    const newData = localStorage.getItem(newKey);

    // Only migrate if old data exists and new key is empty
    if (oldData && !newData) {
      localStorage.setItem(newKey, oldData);
      localStorage.removeItem(oldKey);
      console.log(`[Storage] Migrated ${oldKey} to ${newKey}`);
      return true;
    }

    // If both exist, prefer new data and clean up old
    if (oldData && newData) {
      localStorage.removeItem(oldKey);
      console.log(`[Storage] Cleaned up old key ${oldKey}`);
    }

    return false;
  } catch (error) {
    console.error(`[Storage] Migration failed for ${oldKey}:`, error);
    return false;
  }
}

/**
 * Run all storage migrations
 * Call this once on app initialization
 */
export function runAllStorageMigrations(): void {
  const migrations: [string, string][] = [
    ["postboxd-filters", "pictures-filters"],
    ["postboxd-preferences", "pictures-preferences"],
    ["postboxd-film-status", "pictures-film-status"],
    ["postboxd-discovery", "pictures-discovery"],
    ["postboxd-cookie-consent", "pictures-cookie-consent"],
    ["postboxd-reachable", "pictures-reachable"],
    ["postboxd-festivals", "pictures-festivals"],
  ];

  let migratedCount = 0;

  for (const [oldKey, newKey] of migrations) {
    if (migrateStorageKey(oldKey, newKey)) {
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    console.log(`[Storage] Completed ${migratedCount} migrations`);
  }
}
