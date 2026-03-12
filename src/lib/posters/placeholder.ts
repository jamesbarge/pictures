/**
 * Poster Placeholder Generator
 *
 * When no poster is found from any source, generates a stylized
 * placeholder with a film reel icon and title. Uses a deterministic
 * color based on the title for visual variety.
 *
 * Design: Uses the brand color palette (prussian blue, jasmine gold, teal, reds)
 */

import { brand } from "@/lib/brand";

const PLACEHOLDER_COLORS = brand.placeholderPalette;

/**
 * Generate a consistent color based on film title
 */
function getTitleColor(title: string): { bg: string; accent: string } {
  // Simple hash function for consistent color selection
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % PLACEHOLDER_COLORS.length;
  return PLACEHOLDER_COLORS[index];
}

/**
 * Generate SVG placeholder poster with film reel icon
 */
export function generatePosterPlaceholder(
  title: string,
  year?: number | null,
  width = 342,
  height = 513
): string {
  const colors = getTitleColor(title);
  const displayYear = year ? `(${year})` : "";

  // Truncate title if too long
  const displayTitle =
    title.length > 30 ? title.substring(0, 27) + "..." : title;

  const cx = width / 2;
  const cy = height / 2 - 30;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#000;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="reelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.accent};stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:${colors.accent};stop-opacity:0.1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg)"/>

  <!-- Film strip borders -->
  <rect x="0" y="0" width="18" height="100%" fill="${colors.bg}"/>
  <rect x="${width - 18}" y="0" width="18" height="100%" fill="${colors.bg}"/>

  <!-- Sprocket holes -->
  ${Array.from({ length: 13 }, (_, i) => `
    <rect x="4" y="${15 + i * 38}" width="10" height="22" rx="2" fill="#0a0a0a"/>
    <rect x="${width - 14}" y="${15 + i * 38}" width="10" height="22" rx="2" fill="#0a0a0a"/>
  `).join("")}

  <!-- Film reel icon -->
  <!-- Outer ring -->
  <circle cx="${cx}" cy="${cy}" r="55" fill="none" stroke="${colors.accent}" stroke-width="3" opacity="0.3"/>
  <circle cx="${cx}" cy="${cy}" r="48" fill="url(#reelGrad)" stroke="${colors.accent}" stroke-width="1.5" opacity="0.5"/>

  <!-- Center hub -->
  <circle cx="${cx}" cy="${cy}" r="12" fill="${colors.accent}" opacity="0.4"/>
  <circle cx="${cx}" cy="${cy}" r="6" fill="${colors.bg}"/>

  <!-- Film reel spokes/holes (6 around the center) -->
  ${Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 - 90) * (Math.PI / 180);
    const holeX = cx + Math.cos(angle) * 30;
    const holeY = cy + Math.sin(angle) * 30;
    return `<circle cx="${holeX}" cy="${holeY}" r="10" fill="${colors.bg}" opacity="0.8"/>`;
  }).join("")}

  <!-- Title -->
  <text
    x="${cx}"
    y="${cy + 85}"
    font-family="Georgia, serif"
    font-size="16"
    fill="#fff"
    text-anchor="middle"
    opacity="0.9"
  >${escapeXml(displayTitle)}</text>

  <!-- Year -->
  <text
    x="${cx}"
    y="${cy + 108}"
    font-family="sans-serif"
    font-size="13"
    fill="${colors.accent}"
    text-anchor="middle"
    opacity="0.6"
  >${displayYear}</text>

  <!-- "No Poster" label -->
  <text
    x="${cx}"
    y="${height - 25}"
    font-family="sans-serif"
    font-size="9"
    fill="#555"
    text-anchor="middle"
    letter-spacing="2"
    text-transform="uppercase"
  >NO POSTER AVAILABLE</text>
</svg>`.trim();

  return svg;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a data URL for the placeholder SVG
 */
export function getPosterPlaceholderDataUrl(
  title: string,
  year?: number | null
): string {
  const svg = generatePosterPlaceholder(title, year);
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Get URL for server-generated placeholder
 * This can be served from an API route for better caching
 */
export function getPosterPlaceholderUrl(
  title: string,
  year?: number | null
): string {
  const params = new URLSearchParams({ title });
  if (year) {
    params.set("year", year.toString());
  }
  return `/api/poster-placeholder?${params.toString()}`;
}
