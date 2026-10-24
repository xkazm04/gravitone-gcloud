import { execFile } from "node:child_process";

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import { err, ok, type Result } from "@gt/domain/errors";
import type { BlobStore } from "@gt/kernel/blob";
import { loudnessMissing, measuresMissing, putAudioMeasures, putLoudness, type AudioLoudness, type AudioMeasureRow } from "@gt/kernel/library/measures";
import type { Store } from "@gt/kernel/store";

import { MEASURE_RATE, measureSignal, samplesOf } from "./measure.ts";

// THE MEASURE PASS - the driver of ./measure.ts: for each audio blob a Library item points at
// that decodes and has no measure, ffmpeg decodes it to mono f32 at MEASURE_RATE, the pure core
// measures it, and the rows land in batches beside the media facts (kernel library
// `putAudioMeasures`). Run by the media-facts job after its probe pass
// (lib/producers/media-facts.ts), so a take's waveform, length, tempo and key exist from the
// moment its bytes enter, whoever opens it first.
//
// The delivery figures - integrated loudness, true peak, loudness range, clipping, tail silence -
// are the audio sidecar's (pipeline/audio/sidecar.py), measured on the ORIGINAL file at its own
// rate and channels: the 11 kHz mono decode above is right for a waveform and a tempo and wrong
// for a true peak, which lives above that Nyquist.
//
// The decoder and the sidecar are PARAMETERS (ports, with the ffmpeg binding below and the
// sidecar's in lib/producers/media-facts.ts), so the pass is tested on generated PCM without a
// binary; the clock is one too.

/** Mono f32le PCM of a file at MEASURE_RATE, or the decoder's own words. */
export type Decode = (file: string) => Promise<Result<Uint8Array>>;

/** Long enough for any take the store accepts (60 MB, lib/sound/takes.ts) at 11 kHz mono f32. */
const MAX_PCM_BYTES = 128 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

export function ffmpegDecode(bin: string = process.env["FFMPEG"] ?? "ffmpeg"): Decode {
  return (file) =>
    new Promise((resolve) => {
      execFile(bin, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(MEASURE_RATE), "-f", "f32le", "pipe:1"], { encoding: "buffer", timeout: TIMEOUT_MS, maxBuffer: MAX_PCM_BYTES, windowsHide: true }, (e, stdout, stderr) => {
        if (e === null) resolve(ok(new Uint8Array(stdout)));
        else {
          const said = stderr.toString("utf8").trim().split("\n").slice(-3).join(" | ");
          resolve(err("unavailable", `ffmpeg decode: ${said !== "" ? said : e.message}`));
        }
      });
    });
}

/**
 * The audio sidecar's measure of one file (lib/audio/sidecar.ts `measureFile`, bound in
 * lib/producers/media-facts.ts). A port like `Decode`, so the pass is tested without Python.
 */
export type Loudness = (file: string) => Promise<Result<AudioMeasureFull>>;

export type LoudnessRun = { readonly measured: number; readonly failed: readonly string[] };
/** `loudness` is present only when the pass was given a Loudness port. */
export type MeasureRun = { readonly measured: number; readonly failed: readonly string[]; readonly loudness?: LoudnessRun };

const BATCH = 25;
/** A sidecar that is not installed says so once per blob; the run keeps each distinct sentence once. */
const FAILED_KEPT = 10;

type Five = Pick<AudioLoudness, "lufs" | "truePeakDb" | "lra" | "clippedSamples" | "tailSilenceS">;

function tally(): { readonly run: () => LoudnessRun; readonly measure: (port: Loudness, sha: string, file: string) => Promise<Five | null> } {
  let measured = 0;
  const failed = new Map<string, string>();
  return {
    run: () => ({ measured, failed: [...failed.values()] }),
    async measure(port, sha, file) {
      const r = await port(file);
      if (!r.ok) {
        if (!failed.has(r.error.message) && failed.size < FAILED_KEPT) failed.set(r.error.message, `${sha.slice(0, 12)}: ${r.error.message}`);
        return null;
      }
      measured += 1;
      const m = r.value;
      return { lufs: m.integratedLufs, truePeakDb: m.truePeakDb, lra: m.lra, clippedSamples: m.clippedSamples, tailSilenceS: m.tailSilenceS };
    },
  };
}

/**
 * Two passes. NEW blobs: decode, measure, and - with a Loudness port - the sidecar's five in the
 * same row. When the sidecar fails or is absent the row still lands with the five NULL: the
 * waveform and the length do not wait on Python. BACKFILL: rows the sidecar never measured (from
 * before kernel library v4, or landed while it was unavailable) get the five written over them,
 * so installing the requirements is enough for the existing shelf to gain its loudness. A blob
 * the first pass already asked is not asked twice in one run.
 */
export async function measureMissing(store: Store, blobs: BlobStore, decode: Decode, opts: { readonly limit: number; readonly now: () => Date; readonly loudness?: Loudness }): Promise<Result<MeasureRun>> {
  const wanted = measuresMissing(store, opts.limit);
  if (!wanted.ok) return wanted;
  const rows: AudioMeasureRow[] = [];
  const failed: string[] = [];
  const loud = tally();
  const asked = new Set<string>();
  let measured = 0;
  const flush = (): Result<number> => putAudioMeasures(store, rows.splice(0));
  for (const w of wanted.value) {
    const file = blobs.pathOf({ sha256: w.sha, bytes: 0, mime: w.mime });
    if (!file.ok) {
      failed.push(`${w.sha.slice(0, 12)}: ${file.error.message}`);
      continue;
    }
    const pcm = await decode(file.value);
    const at = opts.now().toISOString();
    if (!pcm.ok) {
      // A blob the decoder refuses is a fact too, so it is not decoded again on every run.
      rows.push({ sha: w.sha, peaks: [], energy: null, durationS: null, tempoBpm: null, key: null, measuredAt: at, error: pcm.error.message });
    } else {
      const m = measureSignal(samplesOf(pcm.value), MEASURE_RATE, w.music);
      asked.add(w.sha);
      const five = opts.loudness === undefined ? null : await loud.measure(opts.loudness, w.sha, file.value);
      rows.push({ sha: w.sha, peaks: [...m.peaks], energy: m.energy, durationS: m.durationS, tempoBpm: m.tempoBpm, key: m.key, measuredAt: at, error: null, ...(five ?? {}) });
      measured += 1;
    }
    if (rows.length >= BATCH) {
      const put = flush();
      if (!put.ok) return put;
    }
  }
  if (rows.length > 0) {
    const put = flush();
    if (!put.ok) return put;
  }
  if (opts.loudness === undefined) return ok({ measured, failed });
  const back = await backfill(store, blobs, opts.loudness, loud, asked, opts.limit);
  if (!back.ok) return back;
  return ok({ measured, failed, loudness: loud.run() });
}

async function backfill(store: Store, blobs: BlobStore, port: Loudness, loud: ReturnType<typeof tally>, asked: ReadonlySet<string>, limit: number): Promise<Result<number>> {
  const owed = loudnessMissing(store, limit);
  if (!owed.ok) return owed;
  const rows: AudioLoudness[] = [];
  let written = 0;
  for (const w of owed.value) {
    if (asked.has(w.sha)) continue;
    const file = blobs.pathOf({ sha256: w.sha, bytes: 0, mime: w.mime });
    if (!file.ok) continue;
    const five = await loud.measure(port, w.sha, file.value);
    if (five !== null) rows.push({ sha: w.sha, ...five });
    if (rows.length >= BATCH) {
      const put = putLoudness(store, rows.splice(0));
      if (!put.ok) return put;
      written += put.value;
    }
  }
  if (rows.length === 0) return ok(written);
  const put = putLoudness(store, rows);
  return put.ok ? ok(written + put.value) : put;
}
