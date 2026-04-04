import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';

const svg = readFileSync('./public/icons/app-icon-source.svg');
mkdirSync('./public/icons', { recursive: true });

console.log('Generating PWA icons...');

await sharp(svg).resize(192, 192).png().toFile('./public/icons/pwa-192x192.png');
console.log('  ✓ pwa-192x192.png');

await sharp(svg).resize(512, 512).png().toFile('./public/icons/pwa-512x512.png');
console.log('  ✓ pwa-512x512.png');

await sharp(svg).resize(180, 180).png().toFile('./public/icons/apple-touch-icon.png');
console.log('  ✓ apple-touch-icon.png (180×180)');

// Maskable: composite icon art at 60% scale (307px) centered on solid green bg
// The W3C maskable safe zone is the central 80% circle — staying within 60% square is safe.
const inner = await sharp(svg).resize(307, 307).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 74, g: 122, b: 90, alpha: 1 } } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile('./public/icons/maskable-icon-512x512.png');
console.log('  ✓ maskable-icon-512x512.png');

console.log('Done.');
