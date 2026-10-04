import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Users table - stores user records linked to Clerk
 * Uses Clerk user ID as primary key for direct mapping
 */
export const users = pgTable("users", {
  // Primary key - Clerk user ID (e.g., "user_2abc123...")
  id: text("id").primaryKey(),

  // Email from Clerk (may be null for some auth methods)
  email: text("email"),

  // Display name from Clerk
  displayName: text("display_name"),

  // Metadata
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
