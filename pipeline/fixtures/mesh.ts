// THE GAME-ASSET UNIVERSE - two mesh assets in the on-disk shape lib/foundry/mesh/store.ts
// documents, for the Library's mesh feed (lib/library/feeds/mesh.ts) and the export's rehearsals
// (spark game-3d-assets WP3):
//
//   fixtures-out/mesh/<asset>/asset.json            the manifest (MeshAsset)
//   fixtures-out/mesh/<asset>/<variant>/<name>.glb  the finished glb, built in code (no binary checked in)
//   fixtures-out/mesh/<asset>/<variant>/poster.png  the poster: the boxes front-on
//
// A hooded archer, a character with two variants (T2 rigged and kept, T1 finished and undecided),
// and a rune axe, a weapon whose second variant failed before finishing - so the feed has a kept
// item, an undecided one and a variant it must not shelve.

import { rmSync } from "node:fs";

import { buildGlb, figure, type Box } from "../../packages/producers/src/media-facts/glbSample";
import type { MeshAsset, MeshVariant } from "../../lib/foundry/mesh/types";
import { HOUR, NOW, outFile, png, writeBytes, writeJson, type RGB } from "./kit";

const at = (ms: number): string => new Date(NOW - ms).toISOString();

const AXE: readonly Box[] = [
  { at: [0, 0.06, 0], size: [0.07, 0.12, 0.07] },
  { at: [0, 0.33, 0], size: [0.05, 0.42, 0.05] },
  { at: [0.11, 0.52, 0], size: [0.22, 0.16, 0.03] },
];

/** The boxes seen from the front, filled, on a dark ground: what a render's silhouette would be. */
function poster(boxes: readonly Box[], fill: RGB, w = 320, h = 200): Buffer {
  const ys = boxes.flatMap((b) => [b.at[1] - b.size[1] / 2, b.at[1] + b.size[1] / 2]);
  const xs = boxes.flatMap((b) => [b.at[0] - b.size[0] / 2, b.at[0] + b.size[0] / 2]);
  const [y0, y1, x0, x1] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
  const k = Math.min((w * 0.8) / (x1 - x0), (h * 0.85) / (y1 - y0));
  const cx = w / 2 - ((x0 + x1) / 2) * k;
  return png(w, h, (x, y) => {
    const wx = (x - cx) / k;
    const wy = y0 + (h * 0.925 - y) / k;
    const hit = boxes.some((b) => Math.abs(wx - b.at[0]) <= b.size[0] / 2 && Math.abs(wy - b.at[1]) <= b.size[1] / 2);
    return hit ? fill : [17 + y / 20, 21 + y / 20, 27 + y / 16];
  });
}

function variant(asset: string, v: Omit<MeshVariant, "files" | "jobs" | "limitations" | "gates"> & Partial<MeshVariant>, boxes: readonly Box[], color: RGB, bones: number): MeshVariant {
  if (v.status !== "finished") return { files: {}, jobs: [`job:run:mesh-${asset}-${v.id}`], limitations: [], gates: [], ...v };
  const tint = color.map((c) => c / 255) as [number, number, number];
  const files: MeshVariant["files"] = { glb: `${v.id}/${asset}.glb`, poster: `${v.id}/poster.png`, ...(bones > 0 ? { rigged: `${v.id}/${asset}-rigged.glb` } : {}) };
  writeBytes(outFile("mesh", asset, `${v.id}/${asset}.glb`), buildGlb({ meshes: [{ boxes, color: tint }] }));
  if (bones > 0) writeBytes(outFile("mesh", asset, `${v.id}/${asset}-rigged.glb`), buildGlb({ meshes: [{ boxes, color: tint }], bones }));
  writeBytes(outFile("mesh", asset, `${v.id}/poster.png`), poster(boxes, color));
  return { files, jobs: [`job:run:mesh-${asset}-${v.id}`], limitations: [], gates: [], ...v };
}

export function generate(): string {
  rmSync(outFile("mesh"), { recursive: true, force: true });
  const archer: MeshAsset = {
    id: "hooded-archer",
    createdAt: at(9 * HOUR),
    brief: { class: "character", subject: "hooded archer, leather, chunky silhouette", style: "chunky game-camera read, flat leather browns", budgetTris: 40_000, rig: "ue5-mannequin" },
    concept: "concept.png",
    night: new Date(NOW - 24 * HOUR).toISOString().slice(0, 10),
    dry: false,
    rights: "publishable",
    variants: [
      variant("hooded-archer", { id: "t2-a", technique: "T2", status: "finished", approach: "chunky game-camera design, read at 640x480", tris: figure().length * 12, verdict: "kept", gates: [{ name: "mesh", version: "lynx-bench pofmetrics.py@2026-10-20", score: 85, verdict: "warn", fails: [], warns: ["bow arm thins below 2 px at 640x480"] }, { name: "rig", version: "lynx-bench rig.py@2026-10-20", score: 92, verdict: "pass", fails: [], warns: [] }] }, figure(), [107, 84, 61], 5),
      variant("hooded-archer", { id: "t1-a", technique: "T1", status: "finished", approach: "budget generation from the standard concept", tris: figure().length * 12, gates: [{ name: "mesh", version: "lynx-bench pofmetrics.py@2026-10-20", verdict: "unmeasured", fails: [], warns: [] }], limitations: ["hood and head share one material"] }, figure(), [77, 92, 77], 0),
    ],
  };
  writeBytes(outFile("mesh", "hooded-archer", "concept.png"), poster(figure(), [200, 190, 170]));
  const axe: MeshAsset = {
    id: "rune-axe",
    createdAt: at(7 * HOUR),
    brief: { class: "weapon", subject: "rune axe, iron head, wrapped haft", budgetTris: 15_000 },
    dry: false,
    rights: "publishable",
    variants: [
      variant("rune-axe", { id: "m1-a", technique: "M1", status: "finished", approach: "TRELLIS budget mesh, then the automated touch-up", tris: AXE.length * 12, gates: [{ name: "budget", version: "pof face-budget.ts@2026-10-19", verdict: "pass", fails: [], warns: [] }] }, AXE, [140, 145, 153], 0),
      variant("rune-axe", { id: "t1-b", technique: "T1", status: "failed", error: "ComfyUI: out of memory in BakeTextureFromVoxel 147" }, AXE, [140, 145, 153], 0),
    ],
  };
  writeJson(outFile("mesh", archer.id, "asset.json"), archer);
  writeJson(outFile("mesh", axe.id, "asset.json"), axe);
  return "2 mesh assets, 3 finished variants, 1 failed";
}
