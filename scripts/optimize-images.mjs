// Resizes and recompresses band photos in place. Originals stay in git history.
// Usage: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const MAX_WIDTH = {
  'hero-band.jpg': 1600,
  'band-live.jpg': 1400,
  'jacob-wolfe.jpg': 600,
  'james-kawasaki.jpg': 600,
  'ave-stimeling.jpg': 600,
};

for (const [file, width] of Object.entries(MAX_WIDTH)) {
  const path = `images/band/${file}`;
  const input = await readFile(path);
  const output = await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  await writeFile(path, output);
  const { width: w, height: h } = await sharp(output).metadata();
  console.log(`${file}: ${Math.round(input.length / 1024)} KB → ${Math.round(output.length / 1024)} KB (${w}×${h})`);
}
