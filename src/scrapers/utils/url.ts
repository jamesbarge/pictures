/**
 * URL utilities for scrapers
 */

/**
 * Normalize a URL to be absolute, using the given base URL for relative paths.
 *
 * Handles three forms:
 * - Absolute URLs (`http://...`) — returned as-is
 * - Root-relative paths (`/path`) — prepended with baseUrl
 * - Bare paths (`path`) — prepended with baseUrl + "/"
 */
export function normalizeUrl(url: string, baseUrl: string): string {
  if (url.startsWith("http")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${baseUrl}${url}`;
  }
  return `${baseUrl}/${url}`;
}
