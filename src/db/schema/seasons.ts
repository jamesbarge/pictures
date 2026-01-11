import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { films } from "./films";

/**
 * Seasons table - curated film collections organized by director or theme
 *
 * Seasons represent collections of films grouped together by cinemas,
 * typically focused on a single director (e.g., "Kurosawa at BFI").
 * Unlike festivals which link directly to screenings, seasons link to films
 * and leverage the existing film → screening relationship.
 *
 * Cross-cinema support: A season can run across multiple venues
 * (e.g., a Hitchcock retrospective at both BFI and Barbican).
 */
export const seasons = pgTable(
  "seasons",
  {
    // Primary key - UUID
    id: text("id").primaryKey(),

    // Identity
    name: text("name").notNull(), // "Kurosawa: Master of Cinema"
    slug: text("slug").notNull().unique(), // "kurosawa-master-of-cinema-2025"

    // Description
    description: text("description"),

    // Director association (for director-focused seasons)
    directorName: text("director_name"), // "Akira Kurosawa"
    directorTmdbId: integer("director_tmdb_id"), // TMDB person ID for enrichment

    // Date range
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),

    // Display
    posterUrl: text("poster_url"),
    websiteUrl: text("website_url"), // Link to season page on cinema website

    // Source tracking
    sourceUrl: text("source_url"), // Where we scraped this from
    sourceCinemas: text("source_cinemas").array().default([]), // Cinema slugs ["bfi-southbank", "barbican"]
    
    // Raw film titles scraped from cinema website (for re-matching when new films added)
    rawFilmTitles: text("raw_film_titles").array().default([]),

    // Status
    isActive: boolean("is_active").notNull().default(true),

    // Timestamps
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // For listing seasons by date (current/upcoming)
    index("idx_seasons_dates").on(table.startDate, table.endDate),
    // For director pages - find all seasons by director
    index("idx_seasons_director").on(table.directorName),
    // For filtering active seasons
    index("idx_seasons_active").on(table.isActive),
    // Slug is unique (covered by .unique() constraint, but explicit index for lookups)
    uniqueIndex("idx_seasons_slug").on(table.slug),
  ]
);

/**
 * Season Films - junction table linking seasons to films (many-to-many)
 *
 * A season contains multiple films, and a film can be part of multiple seasons
 * (e.g., "Seven Samurai" could be in both a Kurosawa season and a "Greatest Films" season).
 */
export const seasonFilms = pgTable(
  "season_films",
  {
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    filmId: text("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),

    // Optional ordering within the season (for curated order)
    orderIndex: integer("order_index"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.seasonId, table.filmId] }),
    // For listing all films in a season
    index("idx_season_films_season").on(table.seasonId),
    // For finding what seasons a film is part of
    index("idx_season_films_film").on(table.filmId),
  ]
);

// Type exports
export type SeasonInsert = typeof seasons.$inferInsert;
export type SeasonSelect = typeof seasons.$inferSelect;

export type SeasonFilmInsert = typeof seasonFilms.$inferInsert;
export type SeasonFilmSelect = typeof seasonFilms.$inferSelect;
