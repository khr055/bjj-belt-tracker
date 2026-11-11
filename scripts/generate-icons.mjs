// Draws the app icon (a blue belt with two stripes) and writes the PNG sizes the web app
// manifest and iOS need into public/. Run with `npm run icons` after changing the design.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Rectangles as fractions of the icon size, painted in order. The belt's rank bar sits inside
// the central 80% so the icon survives the circular mask Android applies to maskable icons.
const SHAPES = [
  { x: 0, y: 0, w: 1, h: 1, color: [0x14, 0x26, 0x4a] }, // background
  { x: 0, y: 0.36, w: 1, h: 0.28, color: [0x2f, 0x72, 0xd6] }, // belt
  { x: 0.46, y: 0.36, w: 0.3, h: 0.28, color: [0x11, 0x11, 0x11] }, // rank bar
  { x: 0.53, y: 0.36, w: 0.05, h: 0.28, color: [0xff, 0xff, 0xff] }, // stripe
  { x: 0.64, y: 0.36, w: 0.05, h: 0.28, color: [0xff, 0xff, 0xff] }, // stripe
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function renderPng(size) {
  const stride = size * 3 + 1; // one filter byte, then RGB per pixel
  const pixels = Buffer.alloc(stride * size);
  for (const { x, y, w, h, color } of SHAPES) {
    const left = Math.round(x * size);
    const right = Math.round((x + w) * size);
    const top = Math.round(y * size);
    const bottom = Math.round((y + h) * size);
    for (let row = top; row < bottom; row += 1) {
      for (let col = left; col < right; col += 1) {
        pixels.set(color, row * stride + 1 + col * 3);
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(PUBLIC_DIR, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(resolve(PUBLIC_DIR, name), renderPng(size));
  console.log(`wrote public/${name} (${size}x${size})`);
}
