/**
 * Image Processor Service
 *
 * Handles processing of source images for non-film content (concerts, events, etc.)
 * Main capabilities:
 * - Fetch images from URLs
 * - Crop to poster aspect ratio (2:3)
 * - Smart cropping that focuses on center/faces
 * - Cache processed images via Supabase Storage or local cache
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

/**
 * Get the dimensions of an image from its URL
 * Returns null if the image can't be fetched or parsed
 */
export async function getImageDimensions(
  url: string
): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": CHROME_USER_AGENT,
      },
    });

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Simple dimension extraction for JPEG, PNG, GIF, WebP
    const dimensions = extractDimensions(bytes);
    return dimensions;
  } catch {
    return null;
  }
}

/**
 * Extract image dimensions from buffer (supports JPEG, PNG, GIF, WebP)
 */
function extractDimensions(
  bytes: Uint8Array
): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR chunk with width/height
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width =
      (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height =
      (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG: Look for SOF0/SOF2 markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] === 0xff) {
        const marker = bytes[i + 1];
        // SOF0, SOF1, SOF2 markers contain dimensions
        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = (bytes[i + 5] << 8) | bytes[i + 6];
          const width = (bytes[i + 7] << 8) | bytes[i + 8];
          return { width, height };
        }
        // Skip to next marker
        const length = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + length;
      } else {
        i++;
      }
    }
  }

  // GIF: Logical screen descriptor at offset 6
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 // "GIF"
  ) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return { width, height };
  }

  // WebP: RIFF container
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 // "RIFF"
  ) {
    // VP8 chunk
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38) {
      // VP8 lossy
      if (bytes[15] === 0x20) {
        const width = ((bytes[26] | (bytes[27] << 8)) & 0x3fff);
        const height = ((bytes[28] | (bytes[29] << 8)) & 0x3fff);
        return { width, height };
      }
      // VP8L lossless
      if (bytes[15] === 0x4c) {
        const bits =
          bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
    }
  }

  return null;
}

