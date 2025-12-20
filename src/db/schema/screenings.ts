import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { films } from "./films";
import { cinemas } from "./cinemas";
import type { ScreeningFormat, EventType } from "@/types/screening";

/**
 * Screenings table - individual film showings at cinemas
 */
export const screenings = pgTable(
  "screenings",
  {
    // Primary key - UUID
    id: text("id").primaryKey(),

    // Foreign keys
    filmId: text("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),
    cinemaId: text("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),

    // Timing
    datetime: timestamp("datetime", { withTimezone: true }).notNull(),

    // Screen info
    screen: text("screen"), // "NFT1", "Screen 2", etc.
    format: text("format").$type<ScreeningFormat>(),
    is3D: boolean("is_3d").notNull().default(false),

    // Event info
    isSpecialEvent: boolean("is_special_event").notNull().default(false),
    eventType: text("event_type").$type<EventType>(),
    eventDescription: text("event_description"),
    season: text("season"), // "Hitchcock: Master of Suspense"

    // Booking
    bookingUrl: text("booking_url").notNull(),
    isSoldOut: boolean("is_sold_out").notNull().default(false),

    // Accessibility
    hasSubtitles: boolean("has_subtitles").notNull().default(false),
    subtitleLanguage: text("subtitle_language"),
    hasAudioDescription: boolean("has_audio_description")
      .notNull()
      .default(false),
    isRelaxedScreening: boolean("is_relaxed_screening").notNull().default(false),

    // Source tracking
    sourceId: text("source_id"), // Original ID from cinema website
    scrapedAt: timestamp("scraped_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Indexes for common query patterns
    index("idx_screenings_datetime").on(table.datetime),
    index("idx_screenings_film").on(table.filmId),
    index("idx_screenings_cinema").on(table.cinemaId),
    // Composite index for calendar queries
    index("idx_screenings_calendar").on(table.datetime, table.cinemaId),
    // Index for upcoming screenings query
    index("idx_screenings_upcoming").on(table.datetime, table.filmId),
  ]
);

export type ScreeningInsert = typeof screenings.$inferInsert;
export type ScreeningSelect = typeof screenings.$inferSelect;
