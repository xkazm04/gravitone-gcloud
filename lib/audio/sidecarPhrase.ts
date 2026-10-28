import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { err, ok, type Result } from "@gt/domain/errors";

import { canSpawnLocalBinaries, describePosture } from "../deployment.ts";
import { SIDECAR_TIMEOUT_MS as TIMEOUT_MS, sidecarCall as call, type SidecarOptions } from "./sidecar.ts";

// THE ATLAS PHRASE RENDERS - `audition` (one sampled family's fixed four-bar phrase) and `sketch`
// (the seed's families over painted levels), pipeline/audio/audition.py and sketch.py. Split out
// of ./sidecar.ts when the local-band verbs joined it (the 400-line cap); the warm pool
// (./renderWorker.ts) is the usual caller, these one-shot spawns its fallback.
const auditionSchema = z.object({
  ok: z.literal(true),
  durationS: z.number().nonnegative(),
  lufs: z.number(),
  notes: z.number().int().nonnegative(),
  range: z.tuple([z.number(), z.number()]),
  measured: z.number().int().nonnegative(),
});

/** What an audition render settled: its length, its loudness, the notes it played, the pitches it measured. */
export type AuditionFacts = Omit<z.output<typeof auditionSchema>, "ok">;

/** The phrase the sidecar renders (pipeline/audio/audition.py): sample files, tempo, key, register. */
export type AuditionSpec = {
  readonly files: readonly string[];
  readonly bpm: number;
  readonly tonic: number;
  readonly minor: boolean;
  readonly role: string;
  readonly lufs: number;
  /** Where the measured pitch map of a file list is kept between renders. */
  readonly cacheDir: string;
};

/**
 * One fixed four-bar phrase played on one sampled instrument into `outPath` (16-bit mono WAV,
 * loudness-matched to `spec.lufs`). The spec goes as a temp file, never argv: a sample family
 * is a hundred paths, applyChain's reason.
 */
export async function renderAudition(spec: AuditionSpec, outPath: string, opts: SidecarOptions = {}): Promise<Result<AuditionFacts>> {
  if (!canSpawnLocalBinaries()) return err("unavailable", `audio sidecar audition: ${describePosture()}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-audition-"));
  try {
    const file = path.join(dir, "spec.json");
    await writeFile(file, JSON.stringify(spec), "utf8");
    const r = await call("audition", ["--spec", file, "--out", outPath], auditionSchema, opts.timeoutMs ?? TIMEOUT_MS);
    if (!r.ok) return r;
    const { ok: _ok, ...facts } = r.value;
    return ok(facts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sketchSchema = z.object({ ok: z.literal(true), durationS: z.number().nonnegative(), lufs: z.number(), voices: z.number().int().nonnegative(), columns: z.number().int().nonnegative() });

/** The sketch the sidecar renders (pipeline/audio/sketch.py): voices over the painted levels. */
export type SketchSpec = {
  readonly voices: readonly { readonly files: readonly string[]; readonly role: string }[];
  readonly levels: readonly number[];
  readonly bpm: number;
  readonly tonic: number;
  readonly minor: boolean;
  readonly lufs: number;
  readonly cacheDir: string;
};

/** The seed's instruments together across the shape's columns into `outPath`; the spec as a temp file (applyChain's reason). */
export async function renderSketch(spec: SketchSpec, outPath: string, opts: SidecarOptions = {}): Promise<Result<{ readonly durationS: number }>> {
  if (!canSpawnLocalBinaries()) return err("unavailable", `audio sidecar sketch: ${describePosture()}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-sketch-"));
  try {
    const file = path.join(dir, "spec.json");
    await writeFile(file, JSON.stringify(spec), "utf8");
    const r = await call("sketch", ["--spec", file, "--out", outPath], sketchSchema, opts.timeoutMs ?? TIMEOUT_MS);
    return r.ok ? ok({ durationS: r.value.durationS }) : r;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
