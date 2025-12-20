import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database connection for Postboxd
 *
 * Uses postgres.js driver with Drizzle ORM.
 * Connection string comes from environment variable.
 */

// Connection string from Supabase
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create postgres client
// For serverless environments, we use connection pooling
const client = postgres(connectionString, {
  prepare: false, // Required for Supabase connection pooling (transaction mode)
  max: 1, // Limit connections in serverless
});

// Create Drizzle instance with schema
export const db = drizzle(client, { schema });

// Export schema for use in queries
export { schema };

// Type exports for convenience
export type Database = typeof db;
