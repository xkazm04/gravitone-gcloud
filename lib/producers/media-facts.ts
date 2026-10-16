import { execFile } from "node:child_process";

import { err, ok } from "@gt/domain/errors";
import type { MediaProbe } from "@gt/producers/media-facts/run";

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
