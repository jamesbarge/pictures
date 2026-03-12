/**
 * Shared health check utility for cinema scrapers.
 *
 * Performs a HEAD request to the given URL and returns true if the response is ok.
 */
export async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
