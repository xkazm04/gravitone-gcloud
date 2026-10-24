import { execFile } from "node:child_process";
import path from "node:path";

import { err, ok } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import type { Producer } from "@gt/kernel/job-core";
import { processKernel, storeLocation } from "@gt/kernel/process";
import { factsPlan, MEDIA_FACTS_LANE, mediaFactsProducer, type MediaProbe } from "@gt/producers/media-facts/run";

import { measureFile, sidecarDoctor } from "../audio/sidecar.ts";
import { OUT_DIRNAME } from "../fixtures/mode.ts";
import { ffmpegDecode, measureMissing, type Decode, type Loudness } from "../sound/measureRun.ts";

// THE MEDIA-FACTS PORT, BOUND TO THIS BOX (Phase 5): ffprobe for what a blob is,
// ffmpeg for a video's keyframe and for the 1x1 average that is its mean luma.
// The same binaries v1 already shells to (lib/adRender.ts, lib/publish/channels.ts,
// lib/sound/types.ts), found on PATH; FFPROBE / FFMPEG override them.
//
// Each call is BOUNDED (a damaged file can make ffmpeg seek forever) and returns
// the tool's own stderr when it fails, so a fact that says "undecodable" quotes
// the decoder rather than paraphrasing it.

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 32 * 1024 * 1024;

function run(bin: string, args: readonly string[]): Promise<{ readonly ok: true; readonly out: Buffer } | { readonly ok: false; readonly error: string }> {
  return new Promise((resolve) => {
    execFile(bin, [...args], { encoding: "buffer", timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES, windowsHide: true }, (e, stdout, stderr) => {
      if (e === null) resolve({ ok: true, out: stdout });
      else {
        const said = stderr.toString("utf8").trim().split("\n").slice(-3).join(" | ");
        resolve({ ok: false, error: said !== "" ? said : e.message });
      }
    });
  });
}

const ffprobe = (): string => process.env["FFPROBE"] ?? "ffprobe";
const ffmpeg = (): string => process.env["FFMPEG"] ?? "ffmpeg";

export function ffmpegProbe(): MediaProbe {
  return {
    async probe(file) {
      const r = await run(ffprobe(), ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
      return r.ok ? { ok: true, json: r.out.toString("utf8") } : { ok: false, error: r.error };
    },
    async poster(file) {
      // 0.6 s in, as the prototype's tiles seeked (`#t=0.6`): past a fade-in's first black frame.
      for (const at of ["0.6", "0"]) {
        const r = await run(ffmpeg(), ["-v", "error", "-ss", at, "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"]);
        if (r.ok && r.out.byteLength > 0) return ok(new Uint8Array(r.out));
        if (!r.ok && at === "0") return err("unavailable", `ffmpeg poster: ${r.error}`);
      }
      return err("unavailable", "ffmpeg poster: no frame");
    },
    async luma(file) {
      // `area` scaling to one pixel is the mean; the default bicubic is a sample.
      const r = await run(ffmpeg(), ["-v", "error", "-i", file, "-vf", "scale=1:1:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"]);
      return r.ok ? ok(new Uint8Array(r.out)) : err("unavailable", `ffmpeg luma: ${r.error}`);
    },
  };
}

/**
 * The audio sidecar as the measure pass's Loudness port. Its doctor runs ONCE, on the first file:
 * a box without Python or without the sidecar's modules then answers every file with the
 * doctor's own sentence and spawns nothing more, and the measure rows land with the five NULL.
 * Made per step, so a worker that outlives a `pip install` picks the sidecar up on its next run.
 */
export function sidecarLoudness(): Loudness {
  let ready: ReturnType<typeof sidecarDoctor> | null = null;
  return async (file) => {
    ready ??= sidecarDoctor();
    const d = await ready;
    return d.ok ? measureFile(file) : d;
  };
}

/**
 * The producer as the worker binds it (lib/producers/registry.ts BOUND): the store and the blob
 * directory are the PROCESS's (the worker's GRAVITONE_STORE_PATH, as lib/producers/strips.ts
 * `stripsKernel`), opened when a step runs rather than when the registry is imported, so a CLI
 * that imports the registry for another producer never opens a store for this one.
 *
 * ONE STEP, TWO PASSES (Phase 6, L60): the probe writes each blob's facts, then the measure pass
 * (lib/sound/measureRun.ts) decodes the audio blobs those facts call decodable and writes their
 * peaks, length, energy, tempo and key beside them - so the job that learns a take decodes is the
 * job that measures it. The measure pass's own failures are the step's output, not its failure:
 * the facts already landed and stand. The same holds one level down for the audio sidecar's
 * loudness figures (`loudness` = null leaves them out): a sidecar that is missing or fails is
 * `loudnessFailed` in the output and NULL figures in the row, never a failed step.
 */
export function mediaFactsBound(limit?: number, decode: Decode = ffmpegDecode(), loudness: (() => Loudness) | null = sidecarLoudness): Producer {
  const lazy = (): { readonly producer: Producer; readonly measure: () => ReturnType<typeof measureMissing> } | { readonly error: string } => {
    const location = storeLocation(OUT_DIRNAME);
    const k = processKernel(location);
    if (!k.ok) return { error: k.error.message };
    const blobs = blobStore(location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(location), "blobs"));
    return {
      producer: mediaFactsProducer({ store: k.value.store, blobs, probe: ffmpegProbe(), ...(limit === undefined ? {} : { limit }) }),
      measure: () => measureMissing(k.value.store, blobs, decode, { limit: limit ?? 500, now: () => new Date(), ...(loudness === null ? {} : { loudness: loudness() }) }),
    };
  };
  return {
    lane: MEDIA_FACTS_LANE,
    plan: factsPlan,
    async perform(step, ctx) {
      const p = lazy();
      if ("error" in p) return { kind: "fatal", code: "unavailable", message: `media-facts: the store would not open: ${p.error}` };
      const facts = await p.producer.perform(step, ctx);
      if (facts.kind !== "produced") return facts;
      const m = await p.measure();
      const loud = m.ok && m.value.loudness !== undefined ? { loudnessMeasured: m.value.loudness.measured, loudnessFailed: [...m.value.loudness.failed] } : {};
      const measures = m.ok ? { measured: m.value.measured, measureFailed: [...m.value.failed], ...loud } : { measured: 0, measureFailed: [m.error.message] };
      return { ...facts, output: { ...facts.output, ...measures } };
    },
  };
}
