// A GALLERY, SYNTHESISED — the fixture the Extract drop zone is fed.
//
// The images are generated, never committed. A folder of real screenshots is
// megabytes of binary in a git history that will never diff usefully, and the
// only properties this fixture needs are the ones a generator can guarantee:
// each file is a VALID PNG (Chromium's `createImageBitmap` must actually decode
// it, or the loop under test never runs), each is DISTINCT (a browser that
// deduplicated identical bitmaps would collapse the very work being counted),
// and each is large enough that the decode → canvas → JPEG re-encode in
// `prepareUpload` is real work rather than a rounding error.
//
// 512×512 RGB noise, ~35 KB deflated a piece. Small enough that eight of them
// upload in a blink; big enough that the shrink pass is measurable.

import { deflateSync } from "node:zlib";

/** The long edge of a fixture tile. Above `LONG_EDGE`/2 on purpose, so
 *  prepareUpload's `scale` branch does real arithmetic and the canvas is
 *  re-drawn rather than copied. */
const SIZE = 512;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC over type+payload. */
function chunk(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, crc]);
}

/**
 * A deterministic 512×512 RGB PNG, seeded by `seed`.
 *
 * Deterministic and not random: a fixture that differs between runs turns a
 * flake into a mystery. The seed is a plain LCG so two tiles never share bytes.
 */
export function pngTile(seed: number): Buffer {
  const stride = SIZE * 3 + 1; // one filter byte per scanline
  const raw = Buffer.alloc(SIZE * stride);
  let x = (seed * 2654435761) >>> 0;
  for (let y = 0; y < SIZE; y += 1) {
    const row = y * stride;
    raw[row] = 0; // filter: none
    for (let px = 0; px < SIZE; px += 1) {
      x = (x * 1664525 + 1013904223) >>> 0;
      raw[row + 1 + px * 3] = x & 0xff;
      raw[row + 2 + px * 3] = (x >>> 8) & 0xff;
      raw[row + 3 + px * 3] = (x >>> 16) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The payload shape Playwright's `setInputFiles` takes — the same thing a
 *  real drop hands the input, without a folder on disk to clean up. */
export function gallery(count: number): { name: string; mimeType: string; buffer: Buffer }[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `tile-${String(i + 1).padStart(2, "0")}.png`,
    mimeType: "image/png",
    buffer: pngTile(i + 1),
  }));
}
