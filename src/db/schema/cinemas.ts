import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import type { CinemaAddress, CinemaCoordinates } from "@/types/cinema";

/**
 * Cinemas table - stores venue information
 */
export const cinemas = pgTable("cinemas", {
  // Primary key - slug format: "bfi-southbank"
  id: text("id").primaryKey(),

  // Basic info
  name: text("name").notNull(),
  shortName: text("short_name"),
  chain: text("chain"), // e.g., "BFI", "Curzon", "Picturehouse"

  // Location
  address: jsonb("address").$type<CinemaAddress>(),
  coordinates: jsonb("coordinates").$type<CinemaCoordinates>(),

  // Characteristics
  screens: integer("screens"),
  features: text("features").array().notNull().default([]),
  programmingFocus: text("programming_focus").array().notNull().default([]),

  // URLs
  website: text("website").notNull(),
  bookingUrl: text("booking_url"),

  // Data sourcing
  dataSourceType: text("data_source_type").$type<
    "scrape" | "api" | "manual"
  >(),
  dataSourceEndpoint: text("data_source_endpoint"),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),

  // Metadata
  description: text("description"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CinemaInsert = typeof cinemas.$inferInsert;
export type CinemaSelect = typeof cinemas.$inferSelect;
