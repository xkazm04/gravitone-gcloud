// THE FILM'S FFMPEG HALF (spark reel-studio): the bed laid under a face, the publish copy encoded to a size, the
// thumbnails, and the one sha of a file. Node only; the producers call these, the screen never does.
//
// Measured 2026-11-18 on The Strait's desktop master (1920x1080, 100 s, 743 MB, h264 59 Mb/s): 2-pass libx264 slow
// to 3.95 Mb/s landed 49.3 MB in 44 s, VMAF mean 93.7 / min 87.0; text legible at frame 1500. That is why the copy
// is 2-pass x264 and not CRF: nothing else holds a size.
//
// WP-0 STUB: the signatures are the contract; WP1 fills the bodies.

import { ReelError, type FilmFace } from "./types.ts";

const notBuilt = (name: string): never => {
  throw new ReelError(`${name} is not built yet (spark reel-studio WP1)`, "unbuilt");
};

/**
 * Lay `bed` under `film` and write `out`. Desktop: the bed as-is; phone: the bed at atempo 2 (the phone film is the
 * timeline at 2x). Loudness to I -14 LUFS, TP -1.5; trimmed to the film's length with a 1.2 s fade-out. The picture
 * is copied, never re-encoded.
 */
export async function muxBed(o: { readonly film: string; readonly bed: string; readonly out: string; readonly face: FilmFace; readonly seconds: number }): Promise<void> {
  void o;
  notBuilt("muxBed");
}

/** 2-pass libx264 (slow, yuv420p, +faststart, aac `audioKbps`) aimed at `targetBytes`. Returns the bytes written. */
export async function encodeToSize(o: { readonly src: string; readonly out: string; readonly targetBytes: number; readonly seconds: number; readonly audioKbps?: number }): Promise<number> {
  void o;
  return notBuilt("encodeToSize");
}

/** VMAF of `dist`'s picture against `ref` (libvmaf), mean and minimum over frames. */
export async function measureVmaf(o: { readonly ref: string; readonly dist: string }): Promise<{ mean: number; min: number }> {
  void o;
  return notBuilt("measureVmaf");
}

/** `count` frames spread evenly across `src`, as `<dir>/<prefix>-NN.jpg` at `width` px wide. Returns dir-relative names in order. */
export async function filmThumbs(o: { readonly src: string; readonly dir: string; readonly prefix: string; readonly count: number; readonly width: number }): Promise<string[]> {
  void o;
  return notBuilt("filmThumbs");
}

/** sha256 of a file, streamed (a master is up to 750 MB). */
export async function sha256File(file: string): Promise<string> {
  void file;
  return notBuilt("sha256File");
}
