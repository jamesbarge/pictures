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

import { createClient } from "@supabase/supabase-js";

// Poster aspect ratio (width:height = 2:3, like movie posters)
const POSTER_ASPECT_RATIO = 2 / 3;
const POSTER_WIDTH = 500; // Standard poster width
const POSTER_HEIGHT = Math.round(POSTER_WIDTH / POSTER_ASPECT_RATIO); // 750

export interface ProcessedImage {
  url: string;
  width: number;
  height: number;
  source: "processed" | "original" | "placeholder";
}

export interface ImageProcessorOptions {
  /** Target width for the processed image */
  width?: number;
  /** Target height for the processed image */
  height?: number;
  /** Quality (1-100) */
  quality?: number;
  /** Cache key prefix */
  cacheKey?: string;
}

/**
 * Check if an image URL is accessible
 */
export async function isImageAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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

/**
 * Calculate crop parameters for poster aspect ratio
 * Uses center-weighted cropping (best for event images/hero images)
 */
export function calculatePosterCrop(
  width: number,
  height: number
): { x: number; y: number; cropWidth: number; cropHeight: number } {
  const currentRatio = width / height;

  if (currentRatio > POSTER_ASPECT_RATIO) {
    // Image is too wide - crop from sides (center horizontally)
    const newWidth = height * POSTER_ASPECT_RATIO;
    const x = (width - newWidth) / 2;
    return {
      x: Math.round(x),
      y: 0,
      cropWidth: Math.round(newWidth),
      cropHeight: height,
    };
  } else {
    // Image is too tall - crop from top/bottom (favor top for faces)
    const newHeight = width / POSTER_ASPECT_RATIO;
    // Favor top 40% of the image (usually where faces/main content is)
    const y = (height - newHeight) * 0.3;
    return {
      x: 0,
      y: Math.round(Math.max(0, y)),
      cropWidth: width,
      cropHeight: Math.round(newHeight),
    };
  }
}

/**
 * Generate a URL for on-demand image processing via Next.js Image Optimization
 * This leverages Vercel's image optimization or next/image built-in processing
 */
export function generateProcessedImageUrl(
  sourceUrl: string,
  options: ImageProcessorOptions = {}
): string {
  const width = options.width ?? POSTER_WIDTH;
  const quality = options.quality ?? 80;

  // Use Next.js Image Optimization API
  // This will resize, crop, and optimize the image on-demand
  const params = new URLSearchParams({
    url: sourceUrl,
    w: width.toString(),
    q: quality.toString(),
  });

  return `/_next/image?${params.toString()}`;
}

/**
 * Generate a placeholder poster URL for films without images
 * Uses the API route that generates SVG placeholders
 */
export function generatePlaceholderUrl(title: string, year?: number): string {
  const params = new URLSearchParams({ title });
  if (year) {
    params.set("year", year.toString());
  }
  return `/api/poster-placeholder?${params.toString()}`;
}

/**
 * Validate and prepare an image URL for use as a poster
 * Returns the best available URL (processed, original, or placeholder)
 */
export async function prepareImageForPoster(
  sourceUrl: string | null | undefined,
  title: string,
  year?: number
): Promise<ProcessedImage> {
  // No source URL - use placeholder
  if (!sourceUrl) {
    return {
      url: generatePlaceholderUrl(title, year),
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      source: "placeholder",
    };
  }

  // Check if the source image is accessible
  const isAccessible = await isImageAccessible(sourceUrl);
  if (!isAccessible) {
    console.warn(`[ImageProcessor] Source image not accessible: ${sourceUrl}`);
    return {
      url: generatePlaceholderUrl(title, year),
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      source: "placeholder",
    };
  }

  // For now, return the original URL
  // In production, this could process and upload to Supabase Storage
  return {
    url: sourceUrl,
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    source: "original",
  };
}

/**
 * Batch process multiple images (for backfill operations)
 */
export async function batchPrepareImages(
  items: Array<{
    sourceUrl: string | null | undefined;
    title: string;
    year?: number;
  }>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Map<string, ProcessedImage>> {
  const { concurrency = 3, delayMs = 200 } = options;
  const results = new Map<string, ProcessedImage>();

  // Process in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map((item) =>
        prepareImageForPoster(item.sourceUrl, item.title, item.year)
      )
    );

    batch.forEach((item, index) => {
      results.set(item.title, batchResults[index]);
    });

    // Rate limiting delay between batches
    if (i + concurrency < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// Export constants for use elsewhere
export { POSTER_ASPECT_RATIO, POSTER_WIDTH, POSTER_HEIGHT };
