import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { YUE2_ENGINE, YUE2_RIGHTS, type Yue2TakeFacts } from "@gt/domain/audio.yue2";

// THE SONG LAB'S TEST FIXTURES (spark yue2-song-lab WP2): tiny WAVs written by code (a few KB each,
// a different tone per file so every file has its own bytes) and a facts record that passes the door.

/** A 16-bit mono 8 kHz WAV of `seconds` of a sine at `hz`. */
export function wav(hz: number, seconds = 0.25): Uint8Array {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 12000), 44 + i * 2);
  return new Uint8Array(b);
}

export function put(file: string, data: string | Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}

export const jsonl = (rows: readonly unknown[]): string => `${rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n")}\n`;

export const facts = (over: Partial<Yue2TakeFacts> = {}): Yue2TakeFacts => ({
  engine: YUE2_ENGINE,
  condition: { cot: "off", cfg: 1.5, seed: 4 },
  style: "Boom-bap hip hop, 90 BPM",
  lyrics: "[Verse]\nEarly morning, city humming",
  lyricsDigest: "0123456789abcdef",
  durationS: 42.5,
  rights: YUE2_RIGHTS,
  lineage: { postStages: [] },
  ...over,
});
