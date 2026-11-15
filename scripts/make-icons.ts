// Renders the white-chicken app icon to PNG: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { iconSvg } from '../src/ui/chicken.ts';

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', iconSvg());

const jobs: [string, number, number][] = [
  ['icon-192.png', 192, 0.12],
  ['icon-512.png', 512, 0.12],
  ['icon-maskable-512.png', 512, 0.22],
  ['apple-touch-icon.png', 180, 0.12],
];
for (const [name, size, pad] of jobs) {
  await sharp(Buffer.from(iconSvg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log('wrote', name);
}
