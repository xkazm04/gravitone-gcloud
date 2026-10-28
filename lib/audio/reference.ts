import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { groupSeconds, levelsOfContour, MAX_COLUMNS, type Level } from "@gt/ui/components/audio/shape.ts";

import { keyOf, MEASURE_RATE, samplesOf, tempoOf, windowOf } from "../sound/measure.ts";
import { ffmpegDecode, type Decode } from "../sound/measureRun.ts";

// A REFERENCE TRACK AS A SEED'S STRUCTURE (D4, as far as the core flow allows): a track a person
// likes, measured for what the composer can steer - its tempo, its key, and its energy over time
// as the shape's painted levels (one per four bars at the measured tempo, @gt/ui shape.ts
// `levelsOfContour`). The bytes are the person's own upload: written to a temp file for the
// decoder, deleted when measured, never stored. The decode, tempo and key are the Library's own
// measure (lib/sound/measure.ts), so a reference reads the way a take does.

export type ReferenceRead = {
  readonly name: string;
  readonly durationS: number;
  readonly bpm: number | null;
  readonly key: string | null;
  /** Painted levels, one per four-bar group; empty when no tempo could be heard. */
  readonly levels: readonly Level[];
};

/** RMS of each four-bar group of `x` at `bpm`, at most MAX_COLUMNS groups (a longer track is read whole, grouped wider). */
export function contourOf(x: Float32Array, rate: number, bpm: number): number[] {
  const n0 = Math.max(1, Math.floor(x.length / (groupSeconds(bpm) * rate)));
  const groups = Math.min(n0, MAX_COLUMNS);
  const size = Math.floor(x.length / groups);
  const out: number[] = [];
  for (let g = 0; g < groups; g++) {
    let sq = 0;
    for (let i = g * size; i < (g + 1) * size; i++) sq += (x[i] ?? 0) ** 2;
    out.push(Math.sqrt(sq / Math.max(1, size)));
  }
  return out;
}

export async function readReference(name: string, bytes: Uint8Array, decode: Decode = ffmpegDecode()): Promise<Result<ReferenceRead>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-reference-"));
  try {
    const file = path.join(dir, `ref${path.extname(name).replace(/[^.a-z0-9]/gi, "").slice(0, 8)}`);
    await writeFile(file, bytes);
    const pcm = await decode(file);
    if (!pcm.ok) return pcm;
    const x = samplesOf(pcm.value);
    if (x.length < MEASURE_RATE * 4) return err("invalid", `${name}: under four seconds of audio decoded - too short to hear a shape in`);
    const w = windowOf(x, MEASURE_RATE);
    const bpm = tempoOf(w, MEASURE_RATE);
    const key = keyOf(w, MEASURE_RATE);
    const levels = bpm === null ? [] : levelsOfContour(contourOf(x, MEASURE_RATE, bpm));
    return ok({ name, durationS: Math.round((x.length / MEASURE_RATE) * 10) / 10, bpm: bpm === null ? null : Math.round(bpm), key, levels });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
