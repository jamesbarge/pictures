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
import { screenings } from "./screenings";
import { users } from "./users";

/**
 * Festival interest levels for user preferences
 */
export type FestivalInterestLevel = "following" | "highly_interested" | "attending";

/**
 * Festival schedule item status
 */
export type FestivalScheduleStatus = "wishlist" | "booked" | "attended" | "missed";

/**
 * Festivals table - represents discrete film festivals in London
 * Examples: BFI London Film Festival, BFI Flare, Raindance, FrightFest
 */
export const festivals = pgTable(
  "festivals",
  {
    // Primary key - UUID
    id: text("id").primaryKey(),

    // Identity
    name: text("name").notNull(), // "BFI London Film Festival"
    slug: text("slug").notNull().unique(), // "bfi-lff-2025"
    shortName: text("short_name"), // "LFF" for compact display
    year: integer("year").notNull(), // 2025

    // Description
    description: text("description"),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),

    // Dates
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),

    // Ticket sale dates (critical for alerts)
    programmAnnouncedDate: date("programme_announced_date"),
    memberSaleDate: timestamp("member_sale_date", { withTimezone: true }),
    publicSaleDate: timestamp("public_sale_date", { withTimezone: true }),

    // Classification
    genreFocus: text("genre_focus").array().default([]), // ["horror", "documentary"]
    venues: text("venues").array().default([]), // Cinema slugs: ["bfi-southbank", "curzon-soho"]

    // Status
    isActive: boolean("is_active").notNull().default(true),

    // Source tracking
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // For listing festivals by date
    index("idx_festivals_dates").on(table.startDate, table.endDate),
    // For filtering by year
    index("idx_festivals_year").on(table.year),
    // For active festival queries
    index("idx_festivals_active").on(table.isActive),
  ]
);

/**
 * Festival Screenings - links screenings to festivals (many-to-many)
 * A screening can belong to multiple festivals (rare but possible)
 * A festival has many screenings
 */
export const festivalScreenings = pgTable(
  "festival_screenings",
  {
    festivalId: text("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "cascade" }),
    screeningId: text("screening_id")
      .notNull()
      .references(() => screenings.id, { onDelete: "cascade" }),

    // Festival-specific metadata
    festivalSection: text("festival_section"), // "Gala", "Competition", "Debate"
    isPremiere: boolean("is_premiere").notNull().default(false),
    premiereType: text("premiere_type"), // "world", "international", "european", "uk"

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.festivalId, table.screeningId] }),
    // For listing all screenings in a festival
    index("idx_festival_screenings_festival").on(table.festivalId),
    // For checking if a screening is part of any festival
    index("idx_festival_screenings_screening").on(table.screeningId),
  ]
);

/**
 * User Festival Interests - tracks which festivals a user follows
 * Used for notification preferences
 */
export const userFestivalInterests = pgTable(
  "user_festival_interests",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    festivalId: text("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "cascade" }),

    // Interest level
    interestLevel: text("interest_level")
      .$type<FestivalInterestLevel>()
      .notNull()
      .default("following"),

    // Notification preferences
    notifyOnSale: boolean("notify_on_sale").notNull().default(true),
    notifyProgramme: boolean("notify_programme").notNull().default(true),
    notifyReminders: boolean("notify_reminders").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.festivalId] }),
    // For listing all festivals a user follows
    index("idx_user_festival_interests_user").on(table.userId),
    // For listing all users following a festival (for notifications)
    index("idx_user_festival_interests_festival").on(table.festivalId),
  ]
);

/**
 * User Festival Schedule - tracks user's personal festival planning
 * Separate from userFilmStatuses to allow festival-specific metadata
 */
export const userFestivalSchedule = pgTable(
  "user_festival_schedule",
  {
    // Primary key - UUID for easy reference
    id: text("id").primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    screeningId: text("screening_id")
      .notNull()
      .references(() => screenings.id, { onDelete: "cascade" }),
    festivalId: text("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "cascade" }),

    // Status tracking
    status: text("status")
      .$type<FestivalScheduleStatus>()
      .notNull()
      .default("wishlist"),

    // Booking info (optional)
    bookingConfirmation: text("booking_confirmation"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // For listing user's schedule for a specific festival
    index("idx_user_festival_schedule_user_festival").on(
      table.userId,
      table.festivalId
    ),
    // For checking if a user has a specific screening scheduled
    uniqueIndex("idx_user_festival_schedule_unique").on(
      table.userId,
      table.screeningId
    ),
    // For status queries (e.g., all booked screenings)
    index("idx_user_festival_schedule_status").on(table.userId, table.status),
  ]
);

// Type exports
export type FestivalInsert = typeof festivals.$inferInsert;
export type FestivalSelect = typeof festivals.$inferSelect;

export type FestivalScreeningInsert = typeof festivalScreenings.$inferInsert;
export type FestivalScreeningSelect = typeof festivalScreenings.$inferSelect;

export type UserFestivalInterestInsert = typeof userFestivalInterests.$inferInsert;
export type UserFestivalInterestSelect = typeof userFestivalInterests.$inferSelect;

export type UserFestivalScheduleInsert = typeof userFestivalSchedule.$inferInsert;
export type UserFestivalScheduleSelect = typeof userFestivalSchedule.$inferSelect;
