import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Generates valid, spec-compliant PNG icons for iOS Safari (apple-touch-icon.png)
 * and Web App Manifest (pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png)
 * without requiring native C++ image libraries.
 */

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  }
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function generateIconPng(size: number, isMaskable: boolean): Buffer {
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  const scale = isMaskable ? 0.78 : 0.92;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawData[rowStart] = 0; // filter type 0

    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;

      // Normalize coordinates to [-1, 1]
      const nx = ((x / size - 0.5) * 2) / scale;
      const ny = ((y / size - 0.5) * 2) / scale;

      // Deep slate background gradient (#0F172A -> #1E293B)
      const gradT = (x + y) / (size * 2);
      let r = Math.round(15 + gradT * 15);
      let g = Math.round(23 + gradT * 18);
      let b = Math.round(42 + gradT * 17);
      const a = 255;

      // Radar circle ring
      const distCenter = Math.hypot(nx, ny);
      if (Math.abs(distCenter - 0.72) < 0.018 || Math.abs(distCenter - 0.48) < 0.012) {
        r = 51;
        g = 65;
        b = 85;
      }

      // Downward price trend arrow line: (-0.52, -0.18) -> (-0.12, -0.32) -> (0.15, 0.12) -> (0.52, 0.44)
      const d1 = distToSegment(nx, ny, -0.52, -0.18, -0.12, -0.32);
      const d2 = distToSegment(nx, ny, -0.12, -0.32, 0.15, 0.12);
      const d3 = distToSegment(nx, ny, 0.15, 0.12, 0.52, 0.44);
      // Arrow head at (0.52, 0.44)
      const d4 = distToSegment(nx, ny, 0.24, 0.44, 0.52, 0.44);
      const d5 = distToSegment(nx, ny, 0.52, 0.16, 0.52, 0.44);

      const minLineDist = Math.min(d1, d2, d3, d4, d5);
      if (minLineDist < 0.075) {
        // Emerald / Sky accent (#10B981 / #38BDF8)
        r = 16;
        g = 185;
        b = 129;
      }

      // Price tag dot at top-left (-0.36, -0.44)
      if (Math.hypot(nx + 0.36, ny + 0.44) < 0.09) {
        r = 56;
        g = 189;
        b = 248;
      }

      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(rawData, { level: 6 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generateIconPng(180, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generateIconPng(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generateIconPng(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generateIconPng(512, true));

console.log('Generated iOS & PWA PNG icons successfully.');
