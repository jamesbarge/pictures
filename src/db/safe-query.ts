/**
 * Safe database query utilities for build-time resilience.
 *
 * These utilities wrap database queries to handle the case when
 * DATABASE_URL is not set (e.g., in CI builds). This allows pages
 * to build successfully even without a database connection.
 */

// Check if we have a valid database URL
const hasDatabaseUrl = !!process.env.DATABASE_URL &&
  process.env.DATABASE_URL !== "" &&
  !process.env.DATABASE_URL.includes("localhost:5432/postgres");

/**
 * Execute a database query safely, returning a fallback value if the database is unavailable.
 *
 * @param queryFn - Async function that performs the database query
 * @param fallback - Value to return if the database is unavailable or query fails
 * @returns The query result or the fallback value
 */
export async function safeQuery<T>(
  queryFn: () => Promise<T>,
  fallback: T
): Promise<T> {
  // If no database URL, return fallback immediately
  if (!hasDatabaseUrl) {
    console.log("[DB] No DATABASE_URL set, returning fallback data");
    return fallback;
  }

  try {
    return await queryFn();
  } catch (error) {
    // Log the error but don't crash - return fallback
    console.error("[DB] Query failed, returning fallback:", error);
    return fallback;
  }
}

/**
 * Check if the database is available.
 * Useful for conditionally rendering content that requires database data.
 */
export function isDatabaseAvailable(): boolean {
  return hasDatabaseUrl;
}
