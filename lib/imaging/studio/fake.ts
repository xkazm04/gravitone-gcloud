// THE FAKE LEONARDO STUDIO — selected by LEONARDO_STUDIO_DRIVER=fake. Server-only
// by use. Touches no browser, no network and no vendor, and spends nothing.
//
// Deterministic: every generation answers the SAME 1280x720 PNG (a real,
// decodable file — the music-video compositor loads it as a poster), and the
// generation ids are counted, not random, so a probe can name them.
// `FAKE_LEONARDO_STUDIO` is the probe's handle, the shape FAKE_SUNO set: its
// health, a failure to throw for a given prompt, the credits one image costs,
// and a log of every generation it was asked for.

import { deflateSync, crc32 } from "node:zlib";
import type { Aspect } from "../types";
import { STUDIO } from "./selectors";
import type { StudioHealth, StudioRun } from "./types";

export interface FakeLeonardoStudioControl {
  health: StudioHealth;
  /** Return a sentence to make this generation throw it, verbatim. */
  failWith: (prompt: string) => string | null;
  /** What one image "costs" — the 2026-10-11 run's measured figure by default. */
  credits: number;
  /** Every generation, in call order. */
  calls: { prompt: string; aspect: Aspect }[];
  seq: number;
}

export const FAKE_LEONARDO_STUDIO: FakeLeonardoStudioControl = {
  health: { ok: true },
  failWith: () => null,
  credits: 8,
  calls: [],
  seq: 0,
};

export function resetFakeLeonardoStudio(): void {
  FAKE_LEONARDO_STUDIO.health = { ok: true };
  FAKE_LEONARDO_STUDIO.failWith = () => null;
  FAKE_LEONARDO_STUDIO.credits = 8;
  FAKE_LEONARDO_STUDIO.calls = [];
  FAKE_LEONARDO_STUDIO.seq = 0;
}

export const FAKE_STILL_PX = { w: 1280, h: 720 } as const;

/** A solid-colour RGB PNG, built by hand: eight bytes of signature, IHDR,
 *  one zlib-deflated IDAT, IEND. Every row is filter byte 0 then the pixels. */
export function solidPng(w: number, h: number, rgb: readonly [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  // compression, filter, interlace: all 0
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let still: string | null = null;
/** The one fake still, base64, built once. A dark ink ground, so a probe that
 *  composites over it sees the particles rather than a white sheet. */
export function fakeStillBase64(): string {
  still ??= solidPng(FAKE_STILL_PX.w, FAKE_STILL_PX.h, [0x14, 0x12, 0x1c]).toString("base64");
  return still;
}

export async function fakeStudioHealth(): Promise<StudioHealth> {
  return FAKE_LEONARDO_STUDIO.health;
}

export async function fakeStudioGenerate(prompt: string, aspect: Aspect): Promise<StudioRun> {
  FAKE_LEONARDO_STUDIO.calls.push({ prompt, aspect });
  const fail = FAKE_LEONARDO_STUDIO.failWith(prompt);
  if (fail) throw new Error(fail);
  const generationId = `fake-gen-${String(++FAKE_LEONARDO_STUDIO.seq).padStart(4, "0")}`;
  return {
    generationId,
    image: { base64: fakeStillBase64(), mime: "image/png", width: FAKE_STILL_PX.w, height: FAKE_STILL_PX.h },
    credits: FAKE_LEONARDO_STUDIO.credits,
    model: STUDIO.model.id,
  };
}
