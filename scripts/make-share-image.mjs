// Builds the link-preview image (Open Graph, 1200×630) from a band photo and the wordmark.
// Usage: node scripts/make-share-image.mjs
import sharp from 'sharp';

const W = 1200, H = 630;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="159" viewBox="0 0 656 100"><g fill="none" stroke="#EEEAE3" stroke-width="13" stroke-miterlimit="10"><path d="M6.5-10V80M0 93.5H44"/><path d="M78-10L123 108 168-10"/><path d="M206.5-10V110M204-12L284 112M281.5-10V110"/><path d="M318 110L363-8 408 110"/><path d="M446.5-10V110M440 6.5H497a25 25 0 0 1 0 50H446M486 56L528 110"/><path d="M560-10L605 54 650-10M605 50V110"/></g></svg>`;

const photo = await sharp('images/band/band-live.jpg')
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .grayscale()
  .linear(1.45, -40)
  .modulate({ brightness: 0.62 })
  .toBuffer();

await sharp(photo)
  .composite([
    { input: { create: { width: W, height: H, channels: 3, background: '#9D5CFF' } }, blend: 'multiply' },
    { input: Buffer.from(logo), left: 80, top: H - 159 - 72 },
  ])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('images/og/lvnary-share.jpg');

console.log('wrote images/og/lvnary-share.jpg');
