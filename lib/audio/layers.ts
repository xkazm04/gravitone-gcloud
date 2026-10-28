import { execFile } from "node:child_process";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { bandChain, LAYER_BANDS, type Layer, type LayerBand } from "@gt/ui/components/audio/layers.ts";

// A REFERENCE'S FOUR LAYERS (@gt/ui layers.ts): one window of the track - twelve seconds from 15% in,
// the Library's representative window (lib/sound/measure.ts `windowOf`) - band-split by ffmpeg, each
// band measured for its part of the energy and then levelled to one RMS (peak held under -1 dBFS)
// so the air of a track is as audible as its bass. The answer is the WAV bytes themselves, inline:
// the upload's temp file is deleted when the read ends and no layer outlives the response.

const RATE = 22_050;
const WINDOW_S = 12;
const TARGET_RMS = 0.1; // about -20 dBFS: the auditions' level
const PEAK = 0.89;
const TIMEOUT_MS = 30_000;

function bandPcm(bin: string, file: string, startS: number, b: LayerBand): Promise<Result<Float32Array>> {
  const args = ["-v", "error", "-ss", startS.toFixed(2), "-t", String(WINDOW_S), "-i", file, "-af", bandChain(b), "-ac", "1", "-ar", String(RATE), "-f", "f32le", "pipe:1"];
  return new Promise((resolve) => {
    execFile(bin, args, { encoding: "buffer", timeout: TIMEOUT_MS, maxBuffer: RATE * WINDOW_S * 4 + 65_536, windowsHide: true }, (e, stdout, stderr) => {
      if (e !== null) return resolve(err("unavailable", `ffmpeg ${b.id} layer: ${stderr.toString("utf8").trim().split("\n").pop() ?? e.message}`));
      const n = Math.floor(stdout.byteLength / 4);
      const view = new DataView(stdout.buffer, stdout.byteOffset, n * 4);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = view.getFloat32(i * 4, true);
      resolve(ok(x));
    });
  });
}

/** A mono 16-bit WAV of `x`, scaled by `gain`. */
export function wavOf(x: Float32Array, rate: number, gain: number): Uint8Array {
  const out = new Uint8Array(44 + x.length * 2);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string): void => [...s].forEach((c, k) => v.setUint8(at + k, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + x.length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, (x[i] ?? 0) * gain)) * 32767), true);
  return out;
}

/** The four layers of `file` (a track `durationS` long), in band order; an error names the band ffmpeg refused. */
export async function layersOf(file: string, durationS: number, bin: string = process.env["FFMPEG"] ?? "ffmpeg"): Promise<Result<Layer[]>> {
  const startS = durationS > WINDOW_S ? Math.min(durationS * 0.15, durationS - WINDOW_S) : 0;
  try {
    const bands = await Promise.all(LAYER_BANDS.map((b) => bandPcm(bin, file, startS, b)));
    const pcm: Float32Array[] = [];
    for (const r of bands) {
      if (!r.ok) return r;
      pcm.push(r.value);
    }
    const energy = pcm.map((x) => x.reduce((a, s) => a + s * s, 0));
    const total = energy.reduce((a, b) => a + b, 0);
    return ok(
      LAYER_BANDS.map((b, i): Layer => {
        const x = pcm[i] ?? new Float32Array(0);
        const e = energy[i] ?? 0;
        const rms = Math.sqrt(e / Math.max(1, x.length));
        const peak = x.reduce((a, s) => Math.max(a, Math.abs(s)), 0);
        const gain = rms > 1e-6 && peak > 0 ? Math.min(TARGET_RMS / rms, PEAK / peak) : 0;
        return { id: b.id, share: total > 0 ? e / total : 0, href: `data:audio/wav;base64,${Buffer.from(wavOf(x, RATE, gain)).toString("base64")}` };
      }),
    );
  } catch (e) {
    return err("unavailable", `layers: ${errorMessage(e)}`);
  }
}
