/**
 * Shared fetch-with-retry utility for scraper proxy calls.
 *
 * Retries once after a 2-second delay on server errors or network failures.
 * Used by BFI PDF fetcher and programme changes parser.
 */

/**
 * Attempt a fetch with retry on failure (for proxy calls that have transient errors).
 * Retries once after a 2-second delay.
 */
export async function fetchWithRetry(url: string, options?: RequestInit, label = "proxy"): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.ok || response.status < 500) return response;
    // Server error — worth retrying
    console.log(`${label} returned ${response.status}, retrying in 2s...`);
  } catch (error) {
    console.log(`${label} failed: ${error instanceof Error ? error.message : error}, retrying in 2s...`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return fetch(url, options);
}
