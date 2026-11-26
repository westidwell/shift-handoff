#!/usr/bin/env node
/*
 * Draws the app icons as PNG files with no dependencies, from the same
 * shapes as icons/icon.svg: an amber tile with two arrows passing each other.
 * Run it only if you change the icon:  node tools/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
const TILE = [0xf2, 0xa9, 0x3b];
const INK = [0x14, 0x16, 0x1b];
const STROKE = 3; // half of stroke-width 6, in the 64-unit drawing
const SEGMENTS = [
  [14, 22, 44, 22], [36, 14, 44, 22], [44, 22, 36, 30],
  [50, 42, 20, 42], [28, 34, 20, 42], [20, 42, 28, 50]
];

function distToSegment(px, py, s) {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inRoundRect(x, y, size, r) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

// Returns RGBA for a point in 64-unit space.
function sample(u, v, opts) {
  const tile = opts.fullBleed ? (u >= 0 && v >= 0 && u <= 64 && v <= 64) : inRoundRect(u, v, 64, 14);
  if (!tile) return [0, 0, 0, 0];
  // Maskable icons keep the arrows inside the middle safe zone.
  const k = opts.glyphScale;
  const gu = 32 + (u - 32) / k;
  const gv = 32 + (v - 32) / k;
  const ink = SEGMENTS.some(function (s) { return distToSegment(gu, gv, s) <= STROKE; });
  return ink ? INK.concat(255) : TILE.concat(255);
}

function render(size, opts) {
  const n = 4; // 4x4 samples per pixel for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const u = ((x + (sx + 0.5) / n) / size) * 64;
          const v = ((y + (sy + 0.5) / n) / size) * 64;
          const c = sample(u, v, opts);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (y * size + x) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round(a / (n * n));
    }
  }
  return px;
}

const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const jobs = [
  ['icon-192.png', 192, { fullBleed: false, glyphScale: 1 }],
  ['icon-512.png', 512, { fullBleed: false, glyphScale: 1 }],
  ['icon-maskable-512.png', 512, { fullBleed: true, glyphScale: 0.72 }],
  ['apple-touch-icon.png', 180, { fullBleed: true, glyphScale: 0.9 }]
];

fs.mkdirSync(OUT, { recursive: true });
jobs.forEach(function (j) {
  const file = path.join(OUT, j[0]);
  fs.writeFileSync(file, png(j[1], render(j[1], j[2])));
  console.log('wrote icons/' + j[0]);
});
