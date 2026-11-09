import { existsSync } from "node:fs";
import path from "node:path";

import { errorMessage } from "@gt/domain/errors";

import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import type { ReelCandidate } from "../foundry/scout/types.ts";
import { STRIP_FRAMES, type StripLane } from "../foundry/strips/types.ts";

// A REAL REEL IN MOTION (spark scout-vision S5) - the operator's skill calls the 8 s strip the approval unit, and the
// packet carried one still. The strip is rendered whole to mp4 by the same renderer a full cut uses
// (pipeline/strips/render.mts renderStrip, handed in as `Render`), into the directory of its strip.html:
// reels/<c-NN>/strip.mp4, beside poster.jpg, sheet.png and the rest of what renderStrip writes. The still
// (reels/<c-NN>.png) stays the tile and the Board's poster.
//
// FRAMES ARE STRIP_FRAMES. A reel is the 8 s contract (subjectOf says so, and so does the lint it passed under); a
// page that declares another length is refused by renderStrip's own check, and that sentence is the one recorded.
// renderStrip's gates (seek, motion, legibility) are RECORDED, never thrown: the only thing that fails a render is the
// page, the browser or the encoder, so a failure here is a sentence about one of those.
//
// A render that fails never loses the reel: the candidate is rendered with its still, and `videoError` carries the
// sentence so the Board can say the video is missing.

export type Render = (htmlPath: string, lane: StripLane, frames: number, outDir: string) => Promise<void>;

export type Motion = { readonly video: string } | { readonly videoError: string };

/** Night-relative mp4 of a strip: beside it. */
export const reelVideoOf = (stripRel: string): string => `${path.posix.dirname(stripRel)}/strip.mp4`;

/** The strip rendered whole; a throw becomes its sentence. */
export async function renderMotion(render: Render, lane: StripLane, nightId: string, stripRel: string): Promise<Motion> {
  const strip = resolveInNight(nightId, stripRel);
  const video = reelVideoOf(stripRel);
  try {
    await render(strip, lane, STRIP_FRAMES, path.dirname(strip));
  } catch (x) {
    if (!(x instanceof Error)) throw x;
    return { videoError: errorMessage(x) };
  }
  return existsSync(resolveInNight(nightId, video)) ? { video } : { videoError: "the render finished and wrote no strip.mp4" };
}

/** The reel with its motion recorded: a video clears an earlier sentence, a sentence clears a stale video. Other kinds, and no motion, are returned as they are. */
export function withMotion<T extends { readonly kind: string }>(c: T, m: Motion | undefined): T {
  if (c.kind !== "reel" || m === undefined) return c;
  const { video: _v, videoError: _e, ...rest } = c as unknown as ReelCandidate;
  return { ...rest, ...m } as unknown as T;
}

/* ── The backfill ─────────────────────────────────────────────────────────── */

export type MotionRow = { readonly id: string; readonly state: "rendered" | "would-render" | "failed"; readonly video?: string; readonly error?: string };

/** The night's rendered reels that have a strip on disk and no video recorded. */
function owing(n: { readonly candidates: readonly unknown[]; readonly id: string }): ReelCandidate[] {
  return (n.candidates as readonly ReelCandidate[]).filter((c) => c.kind === "reel" && c.status === "rendered" && c.files.strip !== undefined && c.video === undefined && existsSync(resolveInNight(n.id, c.files.strip)));
}

/**
 * `reel-motion <night> [--dry]`: the video of every rendered reel that has a strip.html and none yet, in place beside the
 * strip, each recorded on its candidate through the night's lock. Idempotent: a recorded video is not rendered again, and
 * an mp4 an earlier run wrote but never recorded is recorded as it stands. `dry` lists and writes nothing; a dry NIGHT
 * holds stand-in strips and renders nothing.
 */
export async function reelMotion(nightId: string, render: Render | undefined, lane: StripLane, o: { readonly dry: boolean }): Promise<{ readonly night: string; readonly dryNight: boolean; readonly rows: MotionRow[] }> {
  const night = await readNight(nightId);
  if (night.dry) return { night: nightId, dryNight: true, rows: [] };
  const rows: MotionRow[] = [];
  for (const c of owing(night)) {
    if (o.dry) {
      rows.push({ id: c.id, state: "would-render" });
      continue;
    }
    const strip = c.files.strip as string;
    const m: Motion = existsSync(resolveInNight(nightId, reelVideoOf(strip))) ? { video: reelVideoOf(strip) } : render === undefined ? { videoError: "no renderer is bound to this process" } : await renderMotion(render, lane, nightId, strip);
    await mutateNight(nightId, (n) => {
      const cur = n.candidates.find((x) => x.id === c.id);
      return cur === undefined ? n : withCandidate(n, withMotion(cur, m));
    });
    rows.push("video" in m ? { id: c.id, state: "rendered", video: m.video } : { id: c.id, state: "failed", error: m.videoError });
  }
  return { night: nightId, dryNight: false, rows };
}

/** The verb's lines and exit code. The renderer is the one a full cut uses unless a test hands another. */
export async function reelMotionCommand(nightId: string, o: { readonly dry: boolean; readonly render?: Render }): Promise<{ readonly lines: string[]; readonly doc: Record<string, unknown>; readonly code: number }> {
  const { REEL_LANE } = await import("./scoutReelActs.ts");
  const render = o.render ?? (o.dry ? undefined : (await import("./scoutReel.ts")).LIVE_REEL_ENGINES.render);
  const r = await reelMotion(nightId, render, REEL_LANE, { dry: o.dry });
  const lines = r.dryNight ? [`night ${nightId} is dry: its strips are stand-ins, nothing to render`] : r.rows.length === 0 ? [`night ${nightId}: every rendered reel has its video`] : r.rows.map((x) => `  ${x.id} ${x.state}${x.video === undefined ? "" : ` · ${x.video}`}${x.error === undefined ? "" : ` · ${x.error}`}`);
  const failed = r.rows.some((x) => x.state === "failed");
  return { lines, doc: { ok: !failed, night: nightId, ...(o.dry ? { dry: true } : {}), ...(r.dryNight ? { dryNight: true } : {}), reels: r.rows }, code: failed ? 1 : 0 };
}
