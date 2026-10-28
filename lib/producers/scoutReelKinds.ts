import { existsSync } from "node:fs";
import path from "node:path";

import { STRIP_FRAMES } from "../foundry/strips/types.ts";
import { resolveInNight } from "../foundry/scout/store.ts";
import type { CandidateId, IdeaCandidate, NightId, ReelCandidate, ReelCutCandidate, ReelFiles } from "../foundry/scout/types.ts";

// WHAT A REELS STEP AUTHORS, BY KIND (spark scout-vision S5) - the scout-reels job's one step shape over three
// candidates, so the reel acts (./scoutReelActs.ts) hold one author/lint/fix loop and this file holds what differs:
//
//   idea      a night's stats idea on ILLUSTRATIVE numbers: ideas/<c-NN>/, its tile ideas/<c-NN>.png (WP-R1).
//   reel      a kept stats idea on REAL data: reels/<c-NN>/ (the door, lib/foundry/scout/reel.ts, writes brief.json
//             with the real numbers and the source line, approach.json the kept idea's own), its tile reels/<c-NN>.png
//             - the same 240 frames, the same frame 120.
//   reel-cut  a kept real reel cut in full: cuts/<c-NN>/, at the candidate's `frames` (30 s - 2 min). The door copies the
//             kept reel's strip and module to cuts/<c-NN>/ref/, handed to the author turn as its style reference; the
//             page is rendered whole (pipeline/strips/render.mts renderStrip) to cuts/<c-NN>/strip.mp4 and its poster
//             is the tile. A dry cut is its strip alone: no render, the Board shows its words.

export type ReelHolder = IdeaCandidate | ReelCandidate | ReelCutCandidate;

export const isHolder =
  (cid: string) =>
  (x: { readonly id: string; readonly kind: string }): x is ReelHolder =>
    x.id === cid && (x.kind === "idea" || x.kind === "reel" || x.kind === "reel-cut");

/** Where a reel lives, night-relative - lib/producers/scoutReel.ts's contract, handed in so the two files do not import each other. */
export type ReelLayout = {
  /** A stats idea's. */
  readonly files: (cid: CandidateId) => Required<ReelFiles>;
  readonly tile: (cid: CandidateId) => string;
  /** The tile's frame. */
  readonly frame: number;
  /** A kept idea on real data. Absent: the idea layout's shape under `reels/`. */
  readonly real?: { readonly files: (cid: CandidateId) => Required<ReelFiles>; readonly tile: (cid: CandidateId) => string };
  /** A full cut. Absent: the idea layout's shape under `cuts/`. */
  readonly cut?: { readonly files: (cid: CandidateId) => Required<ReelFiles>; readonly video: (cid: CandidateId) => string; readonly poster: (cid: CandidateId) => string };
};

const under = (root: string, cid: CandidateId): Required<ReelFiles> => ({ brief: `${root}/${cid}/brief.json`, approach: `${root}/${cid}/approach.json`, strip: `${root}/${cid}/strip.html` });
/** `reels/<c-NN>/...`: a real reel's inputs and strip. */
export const realReelFiles = (cid: CandidateId): Required<ReelFiles> => under("reels", cid);
export const realReelTile = (cid: CandidateId): string => `reels/${cid}.png`;
/** `cuts/<c-NN>/...`: a full cut's inputs, strip, mp4 and poster (renderStrip's names), and the kept reel's copy under ref/. */
export const reelCutFiles = (cid: CandidateId): Required<ReelFiles> => under("cuts", cid);
export const reelCutVideo = (cid: CandidateId): string => `cuts/${cid}/strip.mp4`;
export const reelCutPoster = (cid: CandidateId): string => `cuts/${cid}/poster.jpg`;
export const reelCutRef = (cid: CandidateId): { readonly html: string; readonly style: string } => ({ html: `cuts/${cid}/ref/strip.html`, style: `cuts/${cid}/ref/style.json` });

/** One step's subject: where its files are, how long its strip runs, and whether it already landed. */
export type ReelSubject = {
  readonly files: Required<ReelFiles>;
  /** The tile: a frame of the strip (idea, reel) or the render's poster (cut). */
  readonly tile: string;
  readonly frames: number;
  /** A cut's mp4, night-relative. */
  readonly video?: string;
  /** A cut's style reference, absolute, when the door copied both files. */
  readonly styleRef?: { readonly html: string; readonly style: string };
  /** The subject already rendered (a drive that died between its landing and its booking). */
  readonly held: boolean;
};

export function subjectOf(at: ReelLayout, nightId: NightId, c: ReelHolder): ReelSubject {
  if (c.kind === "idea") {
    return { files: at.files(c.id), tile: at.tile(c.id), frames: STRIP_FRAMES, held: c.status === "rendered" && c.image !== undefined && c.reel?.strip !== undefined };
  }
  if (c.kind === "reel") {
    const files = at.real?.files(c.id) ?? realReelFiles(c.id);
    return { files, tile: at.real?.tile(c.id) ?? realReelTile(c.id), frames: STRIP_FRAMES, held: c.status === "rendered" && c.image !== undefined && c.files.strip !== undefined };
  }
  const ref = reelCutRef(c.id);
  const abs = { html: resolveInNight(nightId, ref.html), style: resolveInNight(nightId, ref.style) };
  return {
    files: at.cut?.files(c.id) ?? reelCutFiles(c.id),
    tile: at.cut?.poster(c.id) ?? reelCutPoster(c.id),
    video: at.cut?.video(c.id) ?? reelCutVideo(c.id),
    frames: c.frames,
    ...(existsSync(abs.html) && existsSync(abs.style) ? { styleRef: abs } : {}),
    held: c.status === "rendered" && c.files.strip !== undefined,
  };
}

/** The holder once its strip passed and its tile (a cut: its mp4 and poster, when rendered) is on disk. */
export function renderedAs(c: ReelHolder, s: ReelSubject, drawn: { readonly tile?: string; readonly video?: string }): ReelHolder {
  const { error: _e, ...base } = c;
  const files = { brief: s.files.brief, approach: s.files.approach, strip: s.files.strip };
  const tile = drawn.tile === undefined ? {} : { image: drawn.tile };
  if (base.kind === "idea") return { ...base, status: "rendered", ...tile, reel: files };
  if (base.kind === "reel") return { ...base, status: "rendered", ...tile, files };
  return { ...base, status: "rendered", ...tile, ...(drawn.video === undefined ? {} : { video: drawn.video }), files };
}

/** The out dir a cut renders into: the directory of its mp4. */
export const cutOutDir = (nightId: NightId, s: ReelSubject): string | undefined => (s.video === undefined ? undefined : path.dirname(resolveInNight(nightId, s.video)));
