// THE MUSIC-VIDEO RENDER ENTRY POINTS - server side, called by the queue
// (lib/sound/mv/queue.ts) once per job phase. STUBS committed by the Director
// before the fan-out; the render package (WP2) replaces every body and keeps
// every signature.
//
// The envelope is computed INSIDE the headless Chromium page the export
// already launches (lib/audioEnvelope.ts needs OfflineAudioContext), never by
// a node port of it.

import type { MvAnalysis, MvMotion } from "./types";

export interface AnalyseArgs {
  /** Absolute path of the track (mp3/wav/flac/m4a). */
  audioPath: string;
  /** Absolute path the baked envelope is written to (JSON), for the render to reuse. */
  envelopePath: string;
}

export interface RenderArgs {
  audioPath: string;
  /** The Leonardo still (PNG), any size; covered to 1920x1080. */
  stillPath: string;
  /** The envelope written by `analyseTrack`. */
  envelopePath: string;
  motion: MvMotion;
  /** Absolute path of the finished mp4 (1920x1080, the master audio under the
   *  peak-limited single gain of lib/musicVideoExport.ts). */
  outPath: string;
  /** 0..1 progress, for the card's phase line. */
  onProgress?: (fraction: number) => void;
}

export interface ThumbnailArgs {
  stillPath: string;
  /** Drawn by code (registry law checkability-routes-the-pixel). */
  title: string;
  /** Absolute path of a 1280x720 jpg. */
  outPath: string;
}

/** Decode, bake the envelope, write it to `envelopePath`, and summarise it:
 *  duration, tempo candidates, a ten-step energy shape, and sections (the
 *  chapters' source). */
export async function analyseTrack(args: AnalyseArgs): Promise<MvAnalysis> {
  void args;
  throw new Error("analyseTrack is not built yet");
}

/** The still + seeded particles + the pulsing focal element, frame by frame,
 *  muxed with the track. Returns the rendered duration. */
export async function renderMusicVideo(args: RenderArgs): Promise<{ durationS: number }> {
  void args;
  throw new Error("renderMusicVideo is not built yet");
}

export async function renderThumbnail(args: ThumbnailArgs): Promise<void> {
  void args;
  throw new Error("renderThumbnail is not built yet");
}
