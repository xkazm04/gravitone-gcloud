import { execFile } from "node:child_process";

import { err, ok, type Result } from "@gt/domain/errors";
import type { BlobStore } from "@gt/kernel/blob";
import { measuresMissing, putAudioMeasures, type AudioMeasureRow } from "@gt/kernel/library/measures";
import type { Store } from "@gt/kernel/store";

import { MEASURE_RATE, measureSignal, samplesOf } from "./measure.ts";

// THE MEASURE PASS - the driver of ./measure.ts: for each audio blob a Library item points at
// that decodes and has no measure, ffmpeg decodes it to mono f32 at MEASURE_RATE, the pure core
// measures it, and the rows land in batches beside the media facts (kernel library
// `putAudioMeasures`). Run by the media-facts job after its probe pass
// (lib/producers/media-facts.ts), so a take's waveform, length, tempo and key exist from the
// moment its bytes enter, whoever opens it first.
//
// The decoder is a PARAMETER (a port with one ffmpeg binding below), so the pass is tested on
// generated PCM without a binary; the clock is one too.

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

export type MeasureRun = { readonly measured: number; readonly failed: readonly string[] };

const BATCH = 25;

export async function measureMissing(store: Store, blobs: BlobStore, decode: Decode, opts: { readonly limit: number; readonly now: () => Date }): Promise<Result<MeasureRun>> {
  const wanted = measuresMissing(store, opts.limit);
  if (!wanted.ok) return wanted;
  const rows: AudioMeasureRow[] = [];
  const failed: string[] = [];
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
      rows.push({ sha: w.sha, peaks: [...m.peaks], energy: m.energy, durationS: m.durationS, tempoBpm: m.tempoBpm, key: m.key, measuredAt: at, error: null });
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
  return ok({ measured, failed });
}
