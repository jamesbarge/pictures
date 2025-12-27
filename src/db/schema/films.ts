import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  // vector,
  // index,
} from "drizzle-orm/pg-core";
import type { CastMember, ReleaseStatus } from "@/types/film";

// OpenAI text-embedding-3-small produces 1536-dimensional vectors
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Films table - stores film metadata enriched from TMDB
 */
export const films = pgTable("films", {
  // Primary key - UUID
  id: text("id").primaryKey(),

  // External IDs
  tmdbId: integer("tmdb_id").unique(),
  imdbId: text("imdb_id"),

  // Core info
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  year: integer("year"),
  runtime: integer("runtime"), // Minutes

  // Credits
  directors: text("directors").array().notNull().default([]),
  cast: jsonb("cast").$type<CastMember[]>().notNull().default([]),

  // Classification
  genres: text("genres").array().notNull().default([]),
  countries: text("countries").array().notNull().default([]),
  languages: text("languages").array().notNull().default([]),
  certification: text("certification"), // "15", "PG", "U", etc.

  // Content
  synopsis: text("synopsis"),
  tagline: text("tagline"),

  // Media URLs (from TMDB)
  posterUrl: text("poster_url"),
  backdropUrl: text("backdrop_url"),
  trailerUrl: text("trailer_url"),

  // Categorization
  isRepertory: boolean("is_repertory").notNull().default(false),
  releaseStatus: text("release_status").$type<ReleaseStatus>(),
  decade: text("decade"), // "1970s", "1980s", etc.

  // External ratings
  tmdbRating: real("tmdb_rating"),
  letterboxdUrl: text("letterboxd_url"),

  // AI-powered duplicate detection (commented out until pgvector extension is enabled)
  // Embedding of title + year + director for semantic similarity search
  // titleEmbedding: vector("title_embedding", { dimensions: EMBEDDING_DIMENSIONS }),

  // Metadata
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FilmInsert = typeof films.$inferInsert;
export type FilmSelect = typeof films.$inferSelect;
