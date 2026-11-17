// WHAT A SLEEVE TAKE'S BYTES ARE (spark studio-to-release WP3): its pixel size and whether it is colour, read off the
// file's own header - PNG, JPEG or WebP - with no image library. Stores ask for a square RGB picture of 3000 px; a
// provider's claimed size is not evidence of either, so the candidate carries what the bytes say.
//
// RGB here is the store's sense: a colour picture, not greyscale and not CMYK. PNG colour types 2 (truecolour),
// 3 (palette, whose entries are RGB) and 6 (truecolour with alpha) are RGB; 0 and 4 are grey. A JPEG frame with three
// components is RGB (YCbCr decodes to it), one is grey, four is CMYK. WebP is always colour (VP8 is YUV 4:2:0).

export interface Pixels {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rgb: boolean;
  readonly mime: "image/png" | "image/jpeg" | "image/webp";
}

const u32be = (b: Uint8Array, at: number): number => (((b[at] ?? 0) << 24) | ((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0)) >>> 0;
const u16be = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u16le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);
const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n));

function png(b: Uint8Array): Pixels | null {
  if (b.length < 26 || b[0] !== 0x89 || ascii(b, 1, 3) !== "PNG" || ascii(b, 12, 4) !== "IHDR") return null;
  const colour = b[25] ?? 0;
  return { widthPx: u32be(b, 16), heightPx: u32be(b, 20), rgb: colour === 2 || colour === 3 || colour === 6, mime: "image/png" };
}

function jpeg(b: Uint8Array): Pixels | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    // SOF0..SOF15 bar DHT (C4), JPG (C8) and DAC (CC): precision, height, width, components.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { heightPx: u16be(b, i + 5), widthPx: u16be(b, i + 7), rgb: b[i + 9] === 3, mime: "image/jpeg" };
    }
    if (marker === 0xda) return null;
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): Pixels | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") return { widthPx: u24le(b, 24) + 1, heightPx: u24le(b, 27) + 1, rgb: true, mime: "image/webp" };
  if (chunk === "VP8 ") return { widthPx: u16le(b, 26) & 0x3fff, heightPx: u16le(b, 28) & 0x3fff, rgb: true, mime: "image/webp" };
  if (chunk === "VP8L") {
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return { widthPx: (bits & 0x3fff) + 1, heightPx: ((bits >>> 14) & 0x3fff) + 1, rgb: true, mime: "image/webp" };
  }
  return null;
}

/** The picture's measured size and colour, or null when the bytes are none of the three formats. */
export function pixelsOf(bytes: Uint8Array): Pixels | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes);
}
