import "server-only";

// WHAT THE CANVAS CAN SHOW OF A NODE - the real side's pictures and films, as browser URLs through the scout file door
// (/api/foundry/file?kind=scout, lib/decision/v1/sources/scoutWing.ts scoutFileUrl). Two sources:
//   · an OPEN packet's cells (the Board's loadPacket): every frame and film a verdict waits on, with the cell ids, so
//     the canvas's gallery shows exactly what the Board would;
//   · for any other node of a night's output kinds, what its folder holds on disk: every image for a node that still
//     waits, the first image (and a film) for one already decided - a lot's picture at Street level.
// A night that cannot be read is skipped, never guessed: its nodes draw without a picture.

import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ScoutGraph } from "@gt/domain/scoutGraph";

import { scoutFileUrl } from "../../../../../lib/decision/v1/sources/scoutWing.ts";
import { nightDir } from "../../../../../lib/foundry/scout/store.ts";
import type { CanvasFile, CanvasMedia } from "./contract.ts";

/** The night folders a candidate's files sit in, by its kind. */
const FOLDERS = ["storyboards", "reels", "cuts", "scenes", "pieces", "sheets", "assets"] as const;
const SHOWN = new Set(["storyboard", "reel", "reel-cut", "scene", "style", "sheet", "asset3d", "clip", "look", "piece", "visualizer", "mesh"]);
const IMAGE = /\.(png|jpe?g|webp)$/i;
const VIDEO = /\.(mp4|webm)$/i;
// A GPU-rendered reel has no audio stream (pipeline/strips/render.mts writes PNG frames only).
const SILENT_KINDS = new Set(["reel", "reel-cut"]);

const ref = (id: string): { readonly night: string; readonly cid: string } | null => {
  const m = /^(?:cand|out):([^/]+)\/(c-\d+)$/.exec(id);
  return m === null || m[1] === undefined || m[2] === undefined ? null : { night: m[1], cid: m[2] };
};

async function list(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

/** What one night folder holds for one candidate: `<folder>/<cid>/*` and the tile `<folder>/<cid>.png`. */
async function filesOf(night: string, cid: string, kind: string, all: boolean): Promise<CanvasFile[]> {
  let root: string;
  try {
    root = nightDir(night);
  } catch {
    return [];
  }
  const out: CanvasFile[] = [];
  for (const f of FOLDERS) {
    const names = await list(path.join(root, f, cid));
    const images = names.filter((n) => IMAGE.test(n) && !n.startsWith("frame") && !n.includes("sheet"));
    const films = names.filter((n) => VIDEO.test(n) && n.endsWith(".mp4"));
    for (const n of all ? images.slice(0, 6) : images.slice(0, 1)) out.push({ type: "image", src: scoutFileUrl(night, `${f}/${cid}/${n}`), from: n });
    for (const n of films.slice(0, 1)) out.push({ type: "video", src: scoutFileUrl(night, `${f}/${cid}/${n}`), from: n, ...(SILENT_KINDS.has(kind) ? { audio: false } : {}) });
    if (out.length === 0 && (await list(path.join(root, f))).includes(`${cid}.png`)) out.push({ type: "image", src: scoutFileUrl(night, `${f}/${cid}.png`), from: `${cid}.png` });
    if (out.length > 0) break;
  }
  return out;
}

export type OpenCell = { readonly id: string; readonly url: string };

/**
 * Media by node id: the open packets' cells first (`open`: by node id, as the Board loaded them), then the disk for
 * every other node of a shown kind. `cells` carries the Board's cell ids for a node a verdict may be patched on.
 */
export async function mediaOf(g: ScoutGraph, open: ReadonlyMap<string, readonly OpenCell[]>): Promise<Record<string, CanvasMedia>> {
  const out: Record<string, CanvasMedia> = {};
  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  for (const [node, cells] of open) {
    const kind = kindOf.get(node) ?? "";
    const files: CanvasFile[] = [];
    for (const c of cells) {
      const p = new URL(c.url, "http://x").searchParams.get("path") ?? c.url;
      const from = path.posix.basename(p);
      if (IMAGE.test(p)) files.push({ type: "image", src: c.url, from });
      else if (VIDEO.test(p)) files.push({ type: "video", src: c.url, from, ...(SILENT_KINDS.has(kind) ? { audio: false } : {}) });
    }
    out[node] = { files, cells: cells.map((c) => c.id) };
  }
  const todo = g.nodes.filter((n) => out[n.id] === undefined && n.archive !== true && n.wing !== "muse" && SHOWN.has(n.kind));
  await Promise.all(
    todo.map(async (n) => {
      const r = ref(n.id);
      if (r === null) return;
      const files = await filesOf(r.night, r.cid, n.kind, n.state === "open" || n.state === "pending");
      if (files.length > 0) out[n.id] = { files };
    }),
  );
  return out;
}
