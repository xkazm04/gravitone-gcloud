import "server-only";

import { MODEL_MIME, trisBand, type MediaFacts, type ModelClass, type ModelExtras, type ModelTechnique } from "@gt/domain/library";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { readGlb } from "@gt/producers/media-facts/glb";
import { buildGlb, dataUrl, figure, type Box } from "@gt/producers/media-facts/glbSample";

import { dataBlob } from "./fixtureData.ts";

// THE FIXTURE'S GAME ASSETS - four `model` items (spark game-3d-assets WP3) whose glbs are made in
// code when the corpus boots (@gt/producers/media-facts/glbSample), never checked in, and served as
// data: URLs the way the fixture serves its tone. Their facts are what the real probe would write:
// the counts readGlb takes from the very bytes the viewer loads. Each poster is the variant's boxes
// drawn front-on as an SVG, so a tile shows the shape it stands for; the crate has none, so its
// tile is the designed face a model without a render gets.

const NIGHT = "2026-10-21";
const AT = "2026-10-22T06:40:00.000Z";

const blade: readonly Box[] = [
  { at: [0, 0.06, 0], size: [0.07, 0.12, 0.07] },
  { at: [0, 0.33, 0], size: [0.05, 0.42, 0.05] },
  { at: [0.11, 0.52, 0], size: [0.22, 0.16, 0.03] },
  { at: [-0.06, 0.55, 0], size: [0.08, 0.1, 0.04] },
];
const crate: readonly Box[] = [
  { at: [0, 0.3, 0], size: [0.6, 0.6, 0.6] },
  { at: [0, 0.62, 0], size: [0.64, 0.04, 0.64] },
];

type Spec = {
  readonly asset: string;
  readonly variant: string;
  readonly subject: string;
  readonly class: ModelClass;
  readonly technique: ModelTechnique;
  readonly state: LibraryItemInput["state"];
  readonly boxes: readonly Box[];
  readonly color: readonly [number, number, number];
  readonly bones: number;
  readonly poster: boolean;
  readonly gates: ModelExtras["gates"];
  readonly limitations: readonly string[];
  readonly approach: string;
};

const BUDGET: { readonly [C in ModelClass]: number } = { character: 40_000, weapon: 15_000, prop: 10_000 };

const SPECS: readonly Spec[] = [
  { asset: "hooded-archer", variant: "t2-a", subject: "hooded archer, leather, chunky silhouette", class: "character", technique: "T2", state: "candidate", boxes: figure(), color: [0.42, 0.33, 0.24], bones: 5, poster: true, approach: "chunky game-camera design, read at 640x480", gates: [{ name: "mesh", verdict: "warn", score: 85, fails: [], warns: ["bow arm thins below 2 px at 640x480"] }, { name: "rig", verdict: "pass", score: 92, fails: [], warns: [] }, { name: "scale", verdict: "pass", fails: [], warns: [] }], limitations: ["hood and head share one material; no separate face texture"] },
  { asset: "hooded-archer", variant: "t1-a", subject: "hooded archer, leather, chunky silhouette", class: "character", technique: "T1", state: "rejected", boxes: figure(), color: [0.3, 0.36, 0.3], bones: 5, poster: true, approach: "budget generation from the standard concept", gates: [{ name: "mesh", verdict: "fail", score: 61, fails: ["floaters: 3 components touch no other"], warns: [] }, { name: "rig", verdict: "unmeasured", fails: [], warns: [] }], limitations: [] },
  { asset: "rune-axe", variant: "m1-a", subject: "rune axe, iron head, wrapped haft", class: "weapon", technique: "M1", state: "ratified", boxes: blade, color: [0.55, 0.57, 0.6], bones: 0, poster: true, approach: "TRELLIS budget mesh, then the automated touch-up", gates: [{ name: "mesh", verdict: "pass", score: 100, fails: [], warns: [] }, { name: "budget", verdict: "pass", fails: [], warns: [] }], limitations: [] },
  { asset: "supply-crate", variant: "t1-a", subject: "supply crate, banded planks", class: "prop", technique: "T1", state: "candidate", boxes: crate, color: [0.5, 0.38, 0.22], bones: 0, poster: false, approach: "budget generation", gates: [{ name: "mesh", verdict: "unmeasured", fails: [], warns: [] }], limitations: ["no poster rendered: Blender was not reached"] },
];

const hex = (c: readonly [number, number, number]): string => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

/** The boxes front-on (x right, y up), fitted into a 16:10 frame on a dark ground. */
function posterOf(boxes: readonly Box[], color: readonly [number, number, number]): string {
  const xs = boxes.flatMap((b) => [b.at[0] - b.size[0] / 2, b.at[0] + b.size[0] / 2]);
  const ys = boxes.flatMap((b) => [b.at[1] - b.size[1] / 2, b.at[1] + b.size[1] / 2]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(260 / (x1 - x0), 170 / (y1 - y0));
  const ox = 160 - ((x0 + x1) / 2) * k;
  const rects = boxes
    .map((b) => `<rect x="${(ox + (b.at[0] - b.size[0] / 2) * k).toFixed(1)}" y="${(185 - (b.at[1] + b.size[1] / 2 - y0) * k).toFixed(1)}" width="${(b.size[0] * k).toFixed(1)}" height="${(b.size[1] * k).toFixed(1)}" rx="1.5"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2b3340"/><stop offset="1" stop-color="#11151b"/></radialGradient></defs><rect width="320" height="200" fill="url(#g)"/><ellipse cx="160" cy="187" rx="${((x1 - x0) * k * 0.7).toFixed(1)}" ry="6" fill="#000" opacity=".45"/><g fill="${hex(color)}" stroke="#0b0e12" stroke-width="1.2">${rects}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export type FixtureModel = {
  readonly id: string;
  readonly title: string;
  readonly state: LibraryItemInput["state"];
  readonly night: string;
  readonly at: string;
  readonly vocabulary: { readonly class: ModelClass; readonly technique: ModelTechnique; readonly rigged: boolean; readonly tris: number };
  readonly f: Record<string, string[]>;
  readonly media: { readonly sha256: string; readonly bytes: number; readonly mime: string };
  readonly facts: MediaFacts;
  readonly extras: ModelExtras;
  readonly meta: string;
  readonly poster?: string;
};

/** The four models, their glbs built and counted. */
export function fixtureModels(): readonly FixtureModel[] {
  return SPECS.map((s) => {
    const bytes = buildGlb({ meshes: [{ boxes: s.boxes, color: s.color }], bones: s.bones });
    const read = readGlb(bytes);
    if (!read.ok) throw new Error(`fixture model ${s.asset}: ${read.error}`);
    const blob = dataBlob(dataUrl(bytes, MODEL_MIME), MODEL_MIME);
    const poster = s.poster ? posterOf(s.boxes, s.color) : undefined;
    const tris = read.facts.tris;
    const rigged = s.bones > 0;
    return {
      id: `model:mesh:${s.asset}:${s.variant}`,
      title: `${s.subject} · ${s.technique}`,
      state: s.state,
      night: NIGHT,
      at: AT,
      vocabulary: { class: s.class, technique: s.technique, rigged, tris },
      f: { class: [s.class], technique: [s.technique], rig: [rigged ? "rigged" : "static"], tris: [trisBand(tris)], run: [NIGHT] },
      media: { sha256: blob.sha, bytes: bytes.byteLength, mime: MODEL_MIME },
      facts: { sha: blob.sha, decodable: true, mime: MODEL_MIME, w: null, h: null, durationS: null, posterSha: null, meanLuma: null, nearBlack: false, probedAt: AT, error: null, mesh: read.facts },
      extras: { asset: s.asset, variant: s.variant, class: s.class, technique: s.technique, approach: s.approach, budgetTris: BUDGET[s.class], ...(rigged ? { rig: "ue5-mannequin" as const } : {}), ...(poster === undefined ? {} : { poster }), gates: s.gates, limitations: s.limitations },
      meta: `${s.class} · ${tris.toLocaleString("en-US")} tris · ${s.technique}`,
      ...(poster === undefined ? {} : { poster }),
    };
  });
}
