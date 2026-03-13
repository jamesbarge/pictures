/**
 * Shared fetch-with-retry utility for scraper proxy calls.
 *
 * Retries once after a 2-second delay on server errors or network failures.
 * Used by BFI PDF fetcher and programme changes parser.
 */

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

interface FetchWithRetryOptions extends RequestInit {
  maxResponseSize?: number;
}

/**
 * Attempt a fetch with retry on failure (for proxy calls that have transient errors).
 * Retries once after a 2-second delay.
 *
 * Checks Content-Length header against maxResponseSize (default 10MB) to prevent
 * memory exhaustion from oversized responses.
 */
export async function fetchWithRetry(
  url: string,
  options?: FetchWithRetryOptions,
  label = "proxy"
): Promise<Response> {
  const maxSize = options?.maxResponseSize ?? DEFAULT_MAX_RESPONSE_SIZE;

  async function doFetch(): Promise<Response> {
    const response = await fetch(url, options);

    // Check Content-Length header if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      throw new Error(
        `${label}: Response size ${contentLength} bytes exceeds limit of ${maxSize} bytes`
      );
    }

    return response;
  }

  try {
    const response = await doFetch();
    if (response.ok || response.status < 500) return response;
    // Server error — worth retrying
    console.warn(`${label} returned ${response.status}, retrying in 2s...`);
  } catch (error) {
    console.warn(`${label} failed: ${error instanceof Error ? error.message : error}, retrying in 2s...`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return doFetch();
}
