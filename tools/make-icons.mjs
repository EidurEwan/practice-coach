// Generates the PWA icons as real PNGs, with no image dependencies.
//
// Node ships zlib, and a PNG is just a zlib-compressed raw bitmap wrapped in
// four chunks — so the icons can be produced from the design tokens rather
// than checked in as binaries nobody can regenerate.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACCENT = [0x3b, 0x62, 0xd9]; // --accent
const INK = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * The mark: a rounded card with three lines, the last one short — a list with
 * one item still to go, which is what the product is about.
 */
function draw(size, { maskable }) {
  const px = (x, y) => {
    // Maskable icons must keep their content inside a 40% safe radius, so the
    // motif is drawn smaller when the platform may crop to a circle.
    const inset = maskable ? size * 0.28 : size * 0.2;
    const w = size - inset * 2;
    const cardR = w * 0.14;

    const cx = x - inset;
    const cy = y - inset;
    if (cx < 0 || cy < 0 || cx > w || cy > w) return ACCENT;

    // rounded-corner test for the card
    const nearL = cx < cardR, nearR = cx > w - cardR;
    const nearT = cy < cardR, nearB = cy > w - cardR;
    if ((nearL || nearR) && (nearT || nearB)) {
      const ax = nearL ? cardR - cx : cx - (w - cardR);
      const ay = nearT ? cardR - cy : cy - (w - cardR);
      if (ax * ax + ay * ay > cardR * cardR) return ACCENT;
    }

    // three lines inside the card, cut out of it
    const lineH = w * 0.09;
    const gap = w * 0.13;
    const top = w * 0.24;
    for (let i = 0; i < 3; i += 1) {
      const y0 = top + i * (lineH + gap);
      const len = i === 2 ? w * 0.34 : w * 0.56;
      if (cy >= y0 && cy <= y0 + lineH && cx >= w * 0.22 && cx <= w * 0.22 + len) {
        return ACCENT;
      }
    }
    return INK;
  };

  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o] = 0; // filter: none
    o += 1;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = px(x, y);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
      o += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(ROOT, 'icons'), { recursive: true });
const targets = [
  ['icons/icon-192.png', 192, { maskable: false }],
  ['icons/icon-512.png', 512, { maskable: false }],
  ['icons/icon-maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, opts] of targets) {
  const png = draw(size, opts);
  writeFileSync(join(ROOT, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
