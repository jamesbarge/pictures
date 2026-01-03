/**
 * Generate OG image for social sharing
 * 1200x630 with logo and branding
 */

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// OG Image dimensions
const WIDTH = 1200;
const HEIGHT = 630;

// Colors from design system
const CREAM = '#F7F4ED';
const CRITERION_BLUE = '#1E3A5F';
const CHARCOAL = '#1A1A1A';

// Create SVG for the OG image
const ogSvg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background - warm cream -->
  <rect width="100%" height="100%" fill="${CREAM}"/>

  <!-- Subtle grid pattern for texture -->
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${CHARCOAL}" stroke-width="0.5" opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Logo - scaled up cinema frame -->
  <g transform="translate(${WIDTH/2 - 120}, ${HEIGHT/2 - 100})">
    <!-- Outer frame -->
    <rect x="0" y="20" width="240" height="140" rx="16" fill="${CRITERION_BLUE}"/>
    <!-- Inner frame line -->
    <rect x="20" y="40" width="200" height="100" rx="8" fill="none" stroke="${CREAM}" stroke-width="8"/>
  </g>

  <!-- Brand text -->
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 130}"
        font-family="Georgia, serif"
        font-size="48"
        font-weight="400"
        fill="${CHARCOAL}"
        text-anchor="middle">
    Pictures
  </text>

  <!-- Tagline -->
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 175}"
        font-family="system-ui, sans-serif"
        font-size="24"
        fill="${CRITERION_BLUE}"
        text-anchor="middle"
        opacity="0.8">
    London Cinema Calendar
  </text>

  <!-- URL in corner -->
  <text x="${WIDTH - 40}" y="${HEIGHT - 30}"
        font-family="system-ui, sans-serif"
        font-size="18"
        fill="${CHARCOAL}"
        text-anchor="end"
        opacity="0.5">
    pictures.london
  </text>
</svg>
`;

async function generateOgImage() {
  console.log('Generating OG image...');

  const outputPath = join(ROOT, 'public', 'og-image.png');

  await sharp(Buffer.from(ogSvg))
    .png()
    .toFile(outputPath);

  console.log(`✓ Generated og-image.png (${WIDTH}x${HEIGHT})`);
}

generateOgImage().catch(console.error);
