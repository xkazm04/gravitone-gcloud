import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import { NEAR_BLACK_LUMA, type MediaFacts } from "@gt/domain/library";
import type { GlbRead } from "./glb.ts";

// MEDIA FACTS, THE PURE HALF (Phase 5, COMMON decision 6): what ffprobe's JSON and
// a 1x1 average say about a blob, as the `media_facts` row. No process is spawned
// here - the probe is a port (./run.ts), bound to ffprobe/ffmpeg by
// lib/producers/media-facts.ts - so the rules below are tested on recorded output.
//
// Absorbed: the prototype's two browser-side guesses. library.js probed every mp4
// at boot with a <video preload=metadata> and a 900 ms race, sinking the ones that
// errored (MEDIA_ERR_SRC_NOT_SUPPORTED); index.html kept DARK_COVER, a hand list of
// renders measured near-black on 2026-10-14 (mean luma < 16/255), so a pile would
// not lead with one. Both become facts measured once, at ingest, by the same rule
// (NEAR_BLACK_LUMA) - a list typed by hand can only be as current as its typist.
// v1 already shells to ffprobe the same way (lib/sound/types.ts, lib/adRender.ts).

/** What `ffprobe -v error -print_format json -show_streams -show_format` prints, the fields read. */
const probeSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        duration: z.string().optional(),
      }),
    )
    .default([]),
  format: z.object({ duration: z.string().optional(), format_name: z.string().optional() }).optional(),
});

export type ProbeRead = { readonly ok: true; readonly json: string } | { readonly ok: false; readonly error: string };

const positive = (s: string | undefined): number | null => {
  const n = s === undefined ? Number.NaN : Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The facts for one blob. `probe` is ffprobe's outcome; `luma` the mean of the
 * image (or of the poster, for a video), 0..255, or null when it could not be
 * taken. A blob ffprobe cannot read, or one with no decodable stream of its kind,
 * is `decodable: false` with the probe's own words.
 */
export function factsOf(input: {
  readonly sha: string;
  readonly mime: string;
  readonly probe: ProbeRead;
  readonly luma: number | null;
  readonly posterSha: string | null;
  readonly at: string;
}): MediaFacts {
  const base = { sha: input.sha, mime: input.mime, probedAt: input.at };
  const undecodable = (error: string): MediaFacts => ({ ...base, decodable: false, w: null, h: null, durationS: null, posterSha: null, meanLuma: null, nearBlack: false, error });
  if (!input.probe.ok) return undecodable(input.probe.error);
  const p = parseJsonAt("ffprobe output", probeSchema, input.probe.json);
  if (!p.ok) return undecodable(p.error.message);
  const want = input.mime.startsWith("video/") ? "video" : input.mime.startsWith("audio/") ? "audio" : "video";
  // An image is a one-frame "video" stream to ffprobe; an mp4 with only audio is not a video.
  const stream = p.value.streams.find((s) => s.codec_type === want);
  if (stream === undefined) return undecodable(`ffprobe found no ${want} stream (${p.value.streams.map((s) => s.codec_type ?? "?").join(", ") || "none"})`);
  const timed = input.mime.startsWith("video/") || input.mime.startsWith("audio/");
  const durationS = timed ? (positive(stream.duration) ?? positive(p.value.format?.duration)) : null;
  const luma = input.luma === null ? null : Math.max(0, Math.min(255, Math.round(input.luma * 100) / 100));
  return {
    ...base,
    decodable: true,
    w: stream.width !== undefined && stream.width > 0 ? stream.width : null,
    h: stream.height !== undefined && stream.height > 0 ? stream.height : null,
    durationS,
    posterSha: input.posterSha,
    meanLuma: luma,
    nearBlack: luma !== null && luma < NEAR_BLACK_LUMA,
    error: null,
  };
}

/** A glb's facts (model/gltf-binary): ffprobe knows no glTF, so its own header is the probe
 *  (./glb.ts). It has no pixels and no length; its poster is a render the mesh store holds. */
export function meshFactsOf(input: { readonly sha: string; readonly mime: string; readonly read: GlbRead; readonly at: string }): MediaFacts {
  const base = { sha: input.sha, mime: input.mime, probedAt: input.at, w: null, h: null, durationS: null, posterSha: null, meanLuma: null, nearBlack: false };
  return input.read.ok ? { ...base, decodable: true, error: null, mesh: input.read.facts } : { ...base, decodable: false, error: input.read.error };
}

/** The 1x1 gray average ffmpeg writes (`-vf scale=1:1,format=gray -f rawvideo`): one byte. */
export function lumaOf(raw: Uint8Array): number | null {
  return raw.byteLength >= 1 ? (raw[0] ?? null) : null;
}
