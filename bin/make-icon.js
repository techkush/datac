#!/usr/bin/env node
'use strict';

/*
 * Generates a document icon for .dc files — a white note page with an
 * indigo footer band and a ◆ mark — rendered with anti-aliasing and
 * written as a 1024x1024 PNG. No dependencies (pure Node + zlib).
 *
 *   node make-icon.js [outPng] [bandHex]
 *     bandHex defaults to 6366f1 (indigo). Pass e.g. 71717a for a gray icon.
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', 'assets', 'dc-icon-1024.png');
const hexToRgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const BAND = process.argv[3] ? hexToRgb(process.argv[3]) : [99, 102, 241];
const S = 1024;        // output size
const SS = 2;          // supersample factor
const HS = S * SS;     // hi-res buffer size

/* ---- geometry (normalized 0..1) --------------------------------------- */
const PAGE = { l: 0.165, t: 0.105, r: 0.835, b: 0.895, rad: 0.085 };
const BAND_TOP = 0.685;
const LINES = [0.30, 0.40, 0.50]; // y positions of faux text lines
const LINE = { l: 0.30, r: 0.70, h: 0.028, rad: 0.014 };
const DIAMOND = { cx: 0.5, cy: 0.792, rx: 0.072, ry: 0.082 };

const COL = {
  page: [255, 255, 255],
  band: BAND,
  line: [203, 207, 214],
  edge: [224, 224, 228],
  mark: [255, 255, 255],
};

function inRoundRect(u, v, l, t, r, b, rad) {
  const nx = Math.min(Math.max(u, l + rad), r - rad);
  const ny = Math.min(Math.max(v, t + rad), b - rad);
  const dx = u - nx, dy = v - ny;
  return dx * dx + dy * dy <= rad * rad;
}
function inDiamond(u, v, c) {
  return Math.abs(u - c.cx) / c.rx + Math.abs(v - c.cy) / c.ry <= 1;
}

/* ---- render hi-res ----------------------------------------------------- */
const hi = new Uint8ClampedArray(HS * HS * 4); // transparent
for (let py = 0; py < HS; py++) {
  const v = py / HS;
  for (let px = 0; px < HS; px++) {
    const u = px / HS;
    let col = null;
    // subtle outer edge for definition
    if (inRoundRect(u, v, PAGE.l - 0.004, PAGE.t - 0.004, PAGE.r + 0.004, PAGE.b + 0.004, PAGE.rad + 0.004)) col = COL.edge;
    if (inRoundRect(u, v, PAGE.l, PAGE.t, PAGE.r, PAGE.b, PAGE.rad)) {
      col = COL.page;
      // faux text lines
      for (const ly of LINES) {
        if (inRoundRect(u, v, LINE.l, ly, LINE.r, ly + LINE.h, LINE.rad)) { col = COL.line; break; }
      }
      // footer band (respect page rounding via the page test above)
      if (v >= BAND_TOP) {
        col = COL.band;
        if (inDiamond(u, v, DIAMOND)) col = COL.mark;
      }
    }
    if (col) {
      const i = (py * HS + px) * 4;
      hi[i] = col[0]; hi[i + 1] = col[1]; hi[i + 2] = col[2]; hi[i + 3] = 255;
    }
  }
}

/* ---- downsample SSxSS box -> S ---------------------------------------- */
const out = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * HS + (x * SS + dx)) * 4;
        r += hi[i]; g += hi[i + 1]; b += hi[i + 2]; a += hi[i + 3];
      }
    }
    const n = SS * SS, o = (y * S + x) * 4;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
    out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
  }
}

/* ---- PNG encode -------------------------------------------------------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
// raw scanlines with filter byte 0
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  out.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png);
console.log('wrote', OUT, `(${S}x${S}, ${png.length} bytes)`);
