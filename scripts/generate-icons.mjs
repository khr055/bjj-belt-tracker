// Draws the app icons and writes them into public/. Run with `npm run icons` after changing the
// design, and commit the result.
//
// There are two sets. The default icon (a blue belt with two stripes) is used until a rank is
// set. Then, for every rank, public/ranks/ gets that belt as a home-screen icon in the sizes iOS
// and the web app manifest need, a small tab icon, and a copy of the manifest that points at
// them. A page cannot redraw a home-screen icon and there is no server, so every variant has to
// exist as a file. src/domain/rankIcons.ts names these files for the page.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const RANKS_DIR = 'ranks';

// Rectangles as fractions of the icon size, painted in order. The belt's rank bar sits inside
// the central 80% so the icon survives the circular mask Android applies to maskable icons.
const DEFAULT_SHAPES = [
  { x: 0, y: 0, w: 1, h: 1, color: [0x14, 0x26, 0x4a] }, // background
  { x: 0, y: 0.36, w: 1, h: 0.28, color: [0x2f, 0x72, 0xd6] }, // belt
  { x: 0.46, y: 0.36, w: 0.3, h: 0.28, color: [0x11, 0x11, 0x11] }, // rank bar
  { x: 0.53, y: 0.36, w: 0.05, h: 0.28, color: [0xff, 0xff, 0xff] }, // stripe
  { x: 0.64, y: 0.36, w: 0.05, h: 0.28, color: [0xff, 0xff, 0xff] }, // stripe
];

// The belt colours and stripe limits of the app (`--belt-*` in src/styles.css, `maxStripes` in
// src/domain/rank.ts). `edge` outlines the belt, which a white belt needs on a pale tile.
const BELTS = [
  { belt: 'white', maxStripes: 4, color: '#f7f6f1', edge: '#a09c92' },
  { belt: 'blue', maxStripes: 4, color: '#1f5fbf', edge: '#174a96' },
  { belt: 'purple', maxStripes: 4, color: '#6b3fa0', edge: '#53307d' },
  { belt: 'brown', maxStripes: 4, color: '#6b4423', edge: '#523319' },
  { belt: 'black', maxStripes: 6, color: '#1b1b1b', edge: '#000000' },
];
const TILE = '#f3f2ee';
const BAR = '#111111';
const BLACK_BELT_BAR = '#c62828';
const STRIPE = '#ffffff';

const RANKS = BELTS.flatMap((belt) =>
  Array.from({ length: belt.maxStripes + 1 }, (_, stripes) => ({ ...belt, stripes })),
);

function rgb(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

/** Where each of `count` stripes of width `width` starts when spread evenly along `length`. */
function spread(count, width, length) {
  const gap = (length - count * width) / (count + 1);
  return Array.from({ length: count }, (_, index) => gap + index * (gap + width));
}

/**
 * The home-screen icon for a rank: the belt across a pale tile, with its rank bar and stripes.
 * A maskable icon may be cropped to a circle 80% of the icon wide. The bar and its stripes stay
 * inside that circle; only plain belt and tile are lost outside it.
 */
function rankShapes({ color, edge, belt, stripes }) {
  const top = 0.34;
  const height = 0.32;
  const edgeWidth = 0.012;
  const bar = { x: 0.4, w: 0.42 };
  const stripeWidth = 0.036;
  return [
    { x: 0, y: 0, w: 1, h: 1, color: rgb(TILE) },
    { x: 0, y: top - edgeWidth, w: 1, h: height + 2 * edgeWidth, color: rgb(edge) },
    { x: 0, y: top, w: 1, h: height, color: rgb(color) },
    { x: bar.x, y: top, w: bar.w, h: height, color: rgb(belt === 'black' ? BLACK_BELT_BAR : BAR) },
    ...spread(stripes, stripeWidth, bar.w).map((offset) => ({
      x: bar.x + offset,
      y: top,
      w: stripeWidth,
      h: height,
      color: rgb(STRIPE),
    })),
  ];
}

/**
 * The tab icon for a rank. A whole belt is a smear at 16 pixels, so this is the end of the belt
 * only: a block of the belt's colour, then the rank bar. It is drawn on a 16-unit grid with every
 * stripe one whole unit wide and at least one unit apart, so stripes stay countable at that size.
 */
function faviconSvg({ color, edge, belt, stripes, maxStripes }) {
  const barWidth = 2 * maxStripes + 1;
  // The bar runs to the end; the outline drawn over its last column stands in for the belt's tip.
  const barX = 16 - barWidth;
  const starts = spread(stripes, 1, barWidth).map(Math.round);
  // Rounding each start on its own can leave the stripes lopsided; mirror the second half.
  const stripeRects = starts
    .map((start, index) => (index < stripes / 2 ? start : barWidth - 1 - starts[stripes - 1 - index]))
    .map((start) => `<rect x="${barX + start}" y="2" width="1" height="12" fill="${STRIPE}" />`);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
    '  <clipPath id="belt"><rect y="2" width="16" height="12" rx="2" /></clipPath>',
    '  <g clip-path="url(#belt)">',
    `    <rect y="2" width="16" height="12" fill="${color}" />`,
    `    <rect x="${barX}" y="2" width="${barWidth}" height="12" fill="${belt === 'black' ? BLACK_BELT_BAR : BAR}" />`,
    ...stripeRects.map((rect) => `    ${rect}`),
    '  </g>',
    // The outline keeps a white belt visible on a light tab strip.
    `  <rect x="0.5" y="2.5" width="15" height="11" rx="1.5" fill="none" stroke="${edge}" />`,
    '</svg>',
    '',
  ].join('\n');
}

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

function renderPng(size, shapes) {
  const stride = size * 3 + 1; // one filter byte, then RGB per pixel
  const pixels = Buffer.alloc(stride * size);
  for (const { x, y, w, h, color } of shapes) {
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

function write(name, contents) {
  writeFileSync(resolve(PUBLIC_DIR, name), contents);
}

mkdirSync(PUBLIC_DIR, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  write(name, renderPng(size, DEFAULT_SHAPES));
  console.log(`wrote public/${name} (${size}x${size})`);
}

// Every rank's manifest is the default one with only its icons swapped, so the browser sees one
// app (same id, start URL and scope) whichever of them the page links to.
const manifest = JSON.parse(readFileSync(resolve(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8'));

// Start from nothing so a renamed or dropped file does not linger.
rmSync(resolve(PUBLIC_DIR, RANKS_DIR), { recursive: true, force: true });
mkdirSync(resolve(PUBLIC_DIR, RANKS_DIR));
for (const rank of RANKS) {
  const base = `${RANKS_DIR}/${rank.belt}-${rank.stripes}`;
  const shapes = rankShapes(rank);
  for (const size of [180, 192, 512]) write(`${base}-${size}.png`, renderPng(size, shapes));
  write(`${base}.svg`, faviconSvg(rank));
  const icons = manifest.icons.map((icon) => ({
    ...icon,
    src: `/${base}-${icon.sizes.split('x')[0]}.png`,
  }));
  write(`${base}.webmanifest`, `${JSON.stringify({ ...manifest, icons }, null, 2)}\n`);
}
console.log(`wrote public/${RANKS_DIR}/ (${RANKS.length} ranks: 3 icons, a tab icon and a manifest each)`);
