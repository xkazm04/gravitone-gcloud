import { execFile } from "node:child_process";

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import type { Triage, TriageContext } from "@gt/domain/audio.triage";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { BlobStore } from "@gt/kernel/blob";
import { loudnessMissing, measuresMissing, putAudioMeasures, putLoudness, type AudioLoudness, type AudioMeasureRow } from "@gt/kernel/library/measures";
import { putTriage, triageDigest, triageMissing, type TriageRow } from "@gt/kernel/library/triage";
import type { Store } from "@gt/kernel/store";

import { MEASURE_RATE, measureSignal, samplesOf } from "./measure.ts";
import { triageContextOf } from "./triageContext.ts";
import type { SoundTake } from "./types.ts";

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
//
// THE TRIAGE PASS (spark audio-triage WP3, `triageTakes` below) runs after the two above: each
// sound take's bytes judged by the sidecar's detectors against the take's own brief
// (./triageContext.ts), one kernel row per (sha, brief digest, detector version)
// (@gt/kernel/library/triage). The sound store's takes are a port too, so the pass is tested
// over literal takes without a takes.json.

/** Mono f32le PCM of a file at MEASURE_RATE, or the decoder's own words. */
export type Decode = (file: string) => Promise<Result<Uint8Array>>;

/** About 50 minutes of audio at MEASURE_RATE mono f32 (44.1 kB a second). NOT every take the store
 *  accepts (60 MB, lib/sound/takes.ts): an MP3 under ~165 kbps at that size decodes past it, and
 *  ffmpeg's maxBuffer refusal is written as that blob's error row rather than measured. */
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

/**
 * The audio sidecar's triage (lib/audio/sidecar.ts `triageFile`, bound in
 * lib/producers/media-facts.ts). `ready` is asked ONCE per run, and only when a take is owed a
 * triage, so a box without the sidecar spawns one doctor and no detector.
 */
export type Triager = {
  readonly ready: () => Promise<Result<unknown>>;
  readonly triage: (file: string, context: TriageContext) => Promise<Result<Triage>>;
};

/**
 * `errors` counts every file the sidecar failed on; `failed` keeps each distinct sentence once
 * (FAILED_KEPT). `unavailable` is the doctor's sentence when the sidecar cannot run here: then
 * nothing was asked, and nothing is owed but the install.
 */
export type TriageRun = { readonly triaged: number; readonly errors: number; readonly failed: readonly string[]; readonly unavailable?: string };

/**
 * Triage the sound takes' blobs that have no row for (sha, the digest of the take's brief,
 * TRIAGE_VERSION). A take whose brief changed is owed again under its new digest; the old row
 * stays and nobody reads it. A sidecar that is not installed writes no row and fails nothing (the
 * loudness backfill's rule); a file it failed on writes no row either - absence reads "not
 * triaged", never "clean" - and is asked again next run.
 */
export async function triageTakes(store: Store, blobs: BlobStore, takes: () => Promise<readonly SoundTake[]>, port: Triager, opts: { readonly limit: number; readonly now: () => Date }): Promise<Result<TriageRun>> {
  let listed: readonly SoundTake[];
  try {
    listed = await takes();
  } catch (e) {
    return err("unavailable", `sound store: ${errorMessage(e)}`);
  }
  const briefs = new Map<string, { readonly context: TriageContext; readonly digest: string }>();
  for (const t of listed) {
    if (t.file === null) continue;
    const context = triageContextOf(t);
    briefs.set(`audio:${t.id}`, { context, digest: triageDigest(context) });
  }
  const owed = triageMissing(store, [...briefs].map(([itemId, b]) => ({ itemId, contextDigest: b.digest })), opts.limit);
  if (!owed.ok) return owed;
  if (owed.value.length === 0) return ok({ triaged: 0, errors: 0, failed: [] });
  const ready = await port.ready();
  if (!ready.ok) return ok({ triaged: 0, errors: 0, failed: [], unavailable: ready.error.message });
  const rows: TriageRow[] = [];
  const failed = new Map<string, string>();
  let errors = 0;
  let triaged = 0;
  const flush = (): Result<number> => putTriage(store, rows.splice(0));
  for (const w of owed.value) {
    const brief = briefs.get(w.itemId);
    if (brief === undefined) continue;
    const file = blobs.pathOf({ sha256: w.sha, bytes: 0, mime: w.mime });
    const r = file.ok ? await port.triage(file.value, brief.context) : file;
    if (!r.ok) {
      errors += 1;
      if (!failed.has(r.error.message) && failed.size < FAILED_KEPT) failed.set(r.error.message, `${w.sha.slice(0, 12)}: ${r.error.message}`);
      continue;
    }
    rows.push({ sha: w.sha, contextDigest: w.contextDigest, triage: r.value, at: opts.now().toISOString() });
    triaged += 1;
    if (rows.length >= BATCH) {
      const put = flush();
      if (!put.ok) return put;
    }
  }
  if (rows.length > 0) {
    const put = flush();
    if (!put.ok) return put;
  }
  return ok({ triaged, errors, failed: [...failed.values()] });
}
