/**
 * Shared health check utility for cinema scrapers.
 *
 * Performs a HEAD request to the given URL and returns true if the response is ok.
 * Pass optional `fetchOptions` to add headers, a timeout signal, etc.
 */
export async function checkHealth(
  url: string,
  fetchOptions?: RequestInit,
): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", ...fetchOptions });
    return response.ok;
  } catch {
    return false;
  }
}
