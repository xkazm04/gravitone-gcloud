// THE REEL JOBS' ENGINES (spark reel-studio WP2): every outside thing a reel job calls, as one injectable record, so a
// test drives all four jobs on a temp store with counted fakes and no seat, no GPU and no ffmpeg.
//
// The live record binds the seat (lib/agent/cliSeam.ts runAgent), the film's stage machine and reducers
// (lib/reel/film.ts), its ffmpeg half (lib/reel/encode.ts), the GPU renderer (pipeline/reel/film-render.mts, loaded
// lazily: a CLI or a route that never renders never loads playwright) and ffprobe.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AgentResult, RunAgentInput } from "../../agent/cliSeam.ts";
import { runAgent } from "../../agent/cliSeam.ts";
import { encodeToSize, filmThumbs, measureVmaf, muxBed, sha256File } from "../../reel/encode.ts";
import { filmStageOf, withCopy, withFilmRender, type FilmStage } from "../../reel/film.ts";
import type { ReelVerdicts } from "../../reel/store.ts";
import type { FilmCopy, FilmFace, FilmRender, ReelState } from "../../reel/types.ts";

/** Where one face is drawn from (pipeline/reel/film-render.mts FilmSite). */
export type FilmSite = { readonly filmDir: string; readonly sharedData: string; readonly page: string; readonly width: number; readonly height: number };
export type RenderReport = { readonly renderer: string; readonly gpu: boolean; readonly timeline: number; readonly frames: number; readonly msPerFrame: number; readonly pageErrors: readonly string[] };

export type ReelEngines = {
  /** The Claude seat. Only a LIVE job reaches it; a dry job's turns are the stand-ins. */
  readonly seat: (input: RunAgentInput) => Promise<AgentResult>;
  readonly stageOf: (state: ReelState, verdicts: ReelVerdicts) => FilmStage;
  readonly withFilmRender: (state: ReelState, face: FilmFace, render: FilmRender, frames: number, now: string) => ReelState;
  readonly withCopy: (state: ReelState, face: FilmFace, copy: FilmCopy, now: string) => ReelState;
  readonly renderFilm: (o: FilmSite & { readonly step: number; readonly out: string; readonly onProgress?: (frame: number, frames: number) => void | Promise<void> }) => Promise<RenderReport>;
  readonly renderStills: (o: FilmSite & { readonly shots: readonly { readonly frame: number; readonly out: string }[] }) => Promise<RenderReport>;
  /** Seconds and frames of a video, read by ffprobe. */
  readonly probe: (file: string) => Promise<{ readonly seconds: number; readonly frames: number }>;
  readonly sha256File: (file: string) => Promise<string>;
  readonly muxBed: typeof muxBed;
  readonly encodeToSize: typeof encodeToSize;
  readonly measureVmaf: typeof measureVmaf;
  readonly filmThumbs: typeof filmThumbs;
};

const run = promisify(execFile);

/** ffprobe's count of the video stream's frames (decoded, so it is exact) and the container's seconds. */
export async function ffprobeFilm(file: string): Promise<{ seconds: number; frames: number }> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets:format=duration", "-of", "json", file], { maxBuffer: 1 << 20 });
  const j = JSON.parse(stdout) as { streams?: { nb_read_packets?: string }[]; format?: { duration?: string } };
  const frames = Number(j.streams?.[0]?.nb_read_packets);
  const seconds = Number(j.format?.duration);
  if (!Number.isFinite(frames) || !Number.isFinite(seconds) || frames <= 0 || seconds <= 0) throw new Error(`ffprobe read no frames or duration from ${file}`);
  return { seconds, frames };
}

const renderer = async () => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "../../../pipeline/reel/film-render.mts");

export const LIVE_REEL_ENGINES: ReelEngines = {
  seat: runAgent,
  stageOf: filmStageOf,
  withFilmRender,
  withCopy,
  renderFilm: async (o) => (await renderer()).renderFilm(o),
  renderStills: async (o) => (await renderer()).renderStills(o),
  probe: ffprobeFilm,
  sha256File,
  muxBed,
  encodeToSize,
  measureVmaf,
  filmThumbs,
};
