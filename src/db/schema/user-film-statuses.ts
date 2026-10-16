import { pgTable, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * User Film Statuses table - tracks user's relationship with films
 * Syncs with the local film-status Zustand store
 */
export const userFilmStatuses = pgTable(
  "user_film_statuses",
  {
    // Primary key - auto-generated UUID
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Foreign key to users table
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Film identifier (matches filmId in local store)
    filmId: text("film_id").notNull(),

    // Status: want_to_see, seen, or not_interested
    status: text("status")
      .$type<"want_to_see" | "seen" | "not_interested">()
      .notNull(),

    // When the film was first added to any list
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),

    // When marked as seen (null if not seen)
    seenAt: timestamp("seen_at", { withTimezone: true }),

    // User's rating (1-5 stars)
    rating: integer("rating"),

    // User's notes about the film
    notes: text("notes"),

    // Denormalized film metadata for display
    // (so we don't need to join with films table for simple lists)
    filmTitle: text("film_title"),
    filmYear: integer("film_year"),
    filmDirectors: text("film_directors").array(),
    filmPosterUrl: text("film_poster_url"),

    // Timestamp for sync conflict resolution (newest wins)
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Each user can only have one status per film
    uniqueIndex("user_film_unique").on(table.userId, table.filmId),
  ]
);
