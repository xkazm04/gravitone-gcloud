// EXTRACT - THE HEADER READ THAT PICKS A REPLICA'S ASPECT.
//
// lib/foundry/extract/imageDims.ts reads pixel dimensions off the first bytes of
// an upload, and createRun stores `nearestAspect` of them as the aspect every
// replica of that source is generated in. A wrong read is silent: the run goes
// on, and a portrait source is re-asked for as a landscape frame.
//
// The headers below are the real first bytes of files Pillow 13 wrote (a 300x500
// lossy WebP is the case that was wrong: its VP8 frame size is little-endian at
// bytes 26-29, and it read as 500x318). No vendor, no disk.
import { test, expect } from "@playwright/test";

import { imageDims, imageFormat, nearestAspect } from "@/lib/foundry/extract/imageDims";

const bytes = (xs: number[]) => new Uint8Array(xs);

// RIFF....WEBPVP8 <size> <frame tag x3> 9d 01 2a <w LE> <h LE>, 300 x 500.
const LOSSY_300x500 = bytes([82, 73, 70, 70, 98, 1, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 86, 1, 0, 0, 48, 36, 0, 157, 1, 42, 44, 1, 244, 1]);
// The same container, 1280 x 720 (bytes 26-29: 00 05 d0 02).
const LOSSY_1280x720 = bytes([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 0, 0, 0, 0, 240, 196, 0, 157, 1, 42, 0, 5, 208, 2]);
// VP8L, 1280 x 720: signature 0x2f, then 14 bits width-1 and 14 bits height-1.
const LOSSLESS_1280x720 = bytes([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 76, 0, 0, 0, 0, 47, 255, 196, 179, 0, 7, 80, 138, 42, 212]);

test("a lossy WebP reads its frame size little-endian, so a portrait source stays portrait", () => {
  expect(imageDims(LOSSY_300x500)).toEqual({ width: 300, height: 500 });
  expect(imageDims(LOSSY_1280x720)).toEqual({ width: 1280, height: 720 });
  const d = imageDims(LOSSY_300x500)!;
  expect(nearestAspect(d.width, d.height)).toBe("9:16");
});

test("the lossless WebP read is unchanged (control)", () => {
  expect(imageDims(LOSSLESS_1280x720)).toEqual({ width: 1280, height: 720 });
});

test("the VP8 scale bits (the top two of each size field) are not read as size", () => {
  const scaled = new Uint8Array(LOSSY_300x500);
  scaled[27] |= 0xc0; // horizontal scale = 3
  scaled[29] |= 0x40; // vertical scale = 1
  expect(imageDims(scaled)).toEqual({ width: 300, height: 500 });
});

test("imageFormat names the format the bytes are, whatever the file was called", () => {
  const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 5, 0, 0, 0, 2, 0xd0]);
  const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  expect(imageFormat(PNG)).toBe("image/png");
  expect(imageFormat(JPEG)).toBe("image/jpeg");
  expect(imageFormat(LOSSY_300x500)).toBe("image/webp");
  expect(imageFormat(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF
});
