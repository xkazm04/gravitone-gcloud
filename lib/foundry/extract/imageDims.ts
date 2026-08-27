// Pixel dimensions from an image header — PNG, JPEG, WebP — without an image
// library. Node has none built in and this repo deliberately carries no native
// dependency for it; a header read is a few dozen bytes and all the store
// needs, because the only use is choosing the closest project aspect.
//
// Pure: works on a Uint8Array, so the browser and the server share it.

import type { Aspect } from "@/lib/imaging/types";

export interface Dims {
  width: number;
  height: number;
}

export function imageDims(bytes: Uint8Array): Dims | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes);
}

function u32be(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}
function u16be(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1];
}
function u24le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
}

function png(b: Uint8Array): Dims | null {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  // IHDR is always the first chunk: length(4) type(4) width(4) height(4).
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Uint8Array): Dims | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // Padding bytes between markers.
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Standalone markers with no length.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    if (marker === 0xda) return null; // start of scan: no SOF seen
    i += 2 + len;
  }
  return null;
}

function webp(b: Uint8Array): Dims | null {
  if (b.length < 30) return null;
  const tag = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === "VP8L") {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") return { width: u16be(b, 27) & 0x3fff, height: u16be(b, 29) & 0x3fff };
  return null;
}

/** The project aspect closest to a pixel ratio. The four aspects are the
 *  contract lib/imaging enforces; a replica of a 21:9 frame is asked for as
 *  16:9, which is the honest nearest rather than a silent default. */
export function nearestAspect(width: number, height: number): Aspect {
  if (!width || !height) return "16:9";
  const r = width / height;
  const table: [Aspect, number][] = [
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["1:1", 1],
    ["4:5", 4 / 5],
  ];
  let best: Aspect = "16:9";
  let d = Infinity;
  for (const [a, v] of table) {
    const dd = Math.abs(Math.log(r / v));
    if (dd < d) [best, d] = [a, dd];
  }
  return best;
}
