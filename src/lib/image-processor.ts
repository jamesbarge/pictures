/**
 * Image utility — checks whether remote image URLs are accessible.
 */

import { CHROME_USER_AGENT } from "@/scrapers/constants";

/**
 * Check if an image URL is accessible
 */
export async function isImageAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": CHROME_USER_AGENT,
      },
    });
    const contentType = response.headers.get("content-type") || "";
    return response.ok && contentType.startsWith("image/");
  } catch {
    return false;
  }
}

