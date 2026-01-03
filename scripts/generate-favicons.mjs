/**
 * Generate favicon assets from the SVG icon
 * Run with: node scripts/generate-favicons.mjs
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Read the SVG
const svgPath = join(ROOT, 'src/app/icon.svg');
const svgBuffer = readFileSync(svgPath);

// Define output sizes
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

async function generateFavicons() {
  console.log('Generating favicon assets from icon.svg...\n');

  for (const { name, size } of sizes) {
    const outputPath = join(ROOT, 'public', name);

    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated ${name} (${size}x${size})`);
  }

  // Also copy to src/app for Next.js automatic handling
  const appIconPath = join(ROOT, 'src/app/icon.png');
  await sharp(svgBuffer)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(appIconPath);
  console.log(`✓ Generated src/app/icon.png (32x32)`);

  // Generate apple-icon for Next.js app directory
  const appleIconPath = join(ROOT, 'src/app/apple-icon.png');
  await sharp(svgBuffer)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(appleIconPath);
  console.log(`✓ Generated src/app/apple-icon.png (180x180)`);

  console.log('\n✅ All favicon assets generated!');
  console.log('\nNote: For favicon.ico, use an online converter or the generated PNGs.');
  console.log('Next.js will automatically use icon.svg and icon.png from src/app/');
}

generateFavicons().catch(console.error);
