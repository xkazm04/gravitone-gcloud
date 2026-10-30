// THE DOOR FROM THE FILE: an mp3 in, mono float PCM and the facts the timeline's
// `track` carries out. ffmpeg and ffprobe are spawned with argument arrays and no
// shell - a track title with a quote or an ampersand in it is a filename, not a
// command. No OfflineAudioContext: this runs in node, beside the CLI, and the
// headless page's envelope (lib/audioEnvelope.ts) is a different analysis on
// purpose (the design brief accepts the two living side by side).
//
// 22050 Hz mono is the analysis rate: every band edge this pass draws (150 Hz,
// 2 kHz) and every onset it hears sit far below its 11 kHz Nyquist, and it
// halves the FFT work against 44.1 kHz for nothing the timeline reads.

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { TimelineTrack } from "./types";

export const ANALYSIS_RATE = 22050;

/** ffprobe's word on the file: its duration and its native sample rate. */
function probe(audioPath: string): Promise<{ durationS: number; sampleRate: number }> {
  const args = ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate:format=duration", "-of", "json", audioPath];
  return new Promise((resolve, reject) => {
    execFile("ffprobe", args, { windowsHide: true, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`ffprobe refused ${path.basename(audioPath)}: ${String(stderr).trim() || error.message}`));
      const j = JSON.parse(String(stdout)) as { streams?: { sample_rate?: string }[]; format?: { duration?: string } };
      const durationS = Number(j.format?.duration);
      const sampleRate = Number(j.streams?.[0]?.sample_rate);
      if (!Number.isFinite(durationS) || durationS <= 0) return reject(new Error(`ffprobe found no duration in ${path.basename(audioPath)}`));
      if (!Number.isFinite(sampleRate) || sampleRate <= 0) return reject(new Error(`ffprobe found no audio stream in ${path.basename(audioPath)}`));
      resolve({ durationS, sampleRate });
    });
  });
}

/** The `track` block: name, content hash, ffprobe's duration and native rate.
 *  The sha1 is of the bytes, so a re-exported file with the same name is a
 *  different track to every stage downstream (state.json keys on it). */
export async function readTrack(audioPath: string): Promise<{ track: TimelineTrack; bytes: Buffer }> {
  const bytes = await readFile(audioPath);
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  const { durationS, sampleRate } = await probe(audioPath);
  return { track: { file: path.basename(audioPath), sha1, durationS: Math.round(durationS * 1000) / 1000, sampleRate }, bytes };
}

/** The whole file as mono f32 at `rate`, downmixed by ffmpeg. Streamed rather
 *  than execFile'd: 250 s at 22050 Hz is 22 MB of floats, past any sensible
 *  maxBuffer and not worth guessing one. */
export function decodeMono(audioPath: string, rate = ANALYSIS_RATE): Promise<Float32Array> {
  const args = ["-v", "error", "-nostdin", "-i", audioPath, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"];
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => (err += String(c)));
    child.on("error", (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg refused ${path.basename(audioPath)} (exit ${code}): ${err.trim()}`));
      const all = Buffer.concat(chunks);
      // Copy into an aligned buffer: Buffer.concat's pool offset need not be a multiple of 4.
      const out = new Float32Array(Math.floor(all.length / 4));
      new Uint8Array(out.buffer).set(all.subarray(0, out.length * 4));
      resolve(out);
    });
  });
}
