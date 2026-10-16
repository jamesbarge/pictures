import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { ProgrammingType, TimeOfDay } from "@/lib/filter-constants";

/**
 * Types matching the Zustand stores for JSON storage
 */
export interface StoredPreferences {
  // From preferences store
  selectedCinemas: string[];
  defaultView: "list" | "grid";
  showRepertoryOnly: boolean;
  hidePastScreenings: boolean;
  defaultDateRange: "today" | "tomorrow" | "week" | "weekend" | "all";
  preferredFormats: string[];
}

export interface StoredFilters {
  // Persisted filter state (excludes search/date which reset per session)
  cinemaIds: string[];
  formats: string[];
  programmingTypes: ProgrammingType[];
  decades: string[];
  genres: string[];
  timesOfDay: TimeOfDay[];
  hideSeen: boolean;
  hideNotInterested: boolean;
}

/**
 * User Preferences table - stores user settings and filter defaults
 * Syncs with local preferences and filters Zustand stores
 */
export const userPreferences = pgTable("user_preferences", {
  // Primary key - direct reference to user
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  // Preferences JSON blob (cinema selections, view settings)
  preferences: jsonb("preferences")
    .$type<StoredPreferences>()
    .notNull()
    .default({
      selectedCinemas: [],
      defaultView: "list",
      showRepertoryOnly: false,
      hidePastScreenings: true,
      defaultDateRange: "all",
      preferredFormats: [],
    }),

  // Persisted filters JSON blob
  persistedFilters: jsonb("persisted_filters")
    .$type<StoredFilters>()
    .notNull()
    .default({
      cinemaIds: [],
      formats: [],
      programmingTypes: [],
      decades: [],
      genres: [],
      timesOfDay: [],
      hideSeen: false,
      hideNotInterested: true,
    }),

  // Timestamp for sync conflict resolution
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserPreferencesInsert = typeof userPreferences.$inferInsert;
export type UserPreferencesSelect = typeof userPreferences.$inferSelect;
