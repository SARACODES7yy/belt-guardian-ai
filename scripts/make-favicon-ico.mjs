// One-off generator: builds public/favicon.ico (64/48/32 px) from the
// ConveyorWatch mark. Run: node scripts/make-favicon-ico.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// Draw the mark at size N (N x N) as RGBA pixels.
function render(N) {
  const s = N / 32;
  const px = Buffer.alloc(N * N * 4, 0);
  const inRoundedRect = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const segDist = (px_, py_, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px_ - ax) * dx + (py_ - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px_ - (ax + t * dx), py_ - (ay + t * dy));
  };
  const pts = [[4, 17], [8.5, 17], [11.5, 9.5], [15.5, 22.5], [18.5, 15], [21, 15], [23, 11], [25, 17], [28, 17]]
    .map(([a, b]) => [a * s, b * s]);
  const halfStroke = 1.2 * s;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = x + 0.5, fy = y + 0.5;
      if (!inRoundedRect(fx, fy, 0, 0, N, N, 7 * s)) continue;
      const t = (fx + fy) / (2 * N);
      const lerp = (a, b) => Math.round(a + (b - a) * t);
      let r = lerp(0x3b, 0x1e), g = lerp(0x82, 0x40), b = lerp(0xf6, 0xaf), a = 255;
      let onPulse = false;
      for (let i = 0; i < pts.length - 1; i++) {
        if (segDist(fx, fy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= halfStroke) {
          onPulse = true; break;
        }
      }
      const onBelt = inRoundedRect(fx, fy, 6 * s, 24.6 * s, 26 * s, 27.2 * s, 1.3 * s);
      if (onPulse) { r = g = b = 255; }
      else if (onBelt) { r = g = b = 255; a = 230; }
      else { a = 255; }
      const o = (y * N + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
    }
  }
  return px;
}

function pngRGBA(N, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [64, 48, 32];
const pngs = sizes.map((n) => ({ n, data: pngRGBA(n, render(n)) }));

const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
const entries = [];
let offset = 6 + 16 * count;
for (const { n, data } of pngs) {
  const e = Buffer.alloc(16);
  e[0] = n === 256 ? 0 : n; e[1] = n === 256 ? 0 : n;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += data.length;
}
const ico = Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
writeFileSync(new URL("../public/favicon.ico", import.meta.url), ico);
console.log("favicon.ico written:", ico.length, "bytes,", count, "sizes:", sizes.join("/"));
