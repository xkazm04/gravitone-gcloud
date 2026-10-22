// THE CONCEPT ENGINE - what a /scout game asset (spark game-3d-assets WP4) knows before any job:
// the brief's door, the concept prompts written from it, which concept each technique is made
// from, the asset id, and the dry stand-in picture. Pure apart from building that picture.
//
// THE CONCEPT IS OURS, AND IT IS WRITTEN FOR RECONSTRUCTION. An image-to-3D model reproduces what
// it is fed (game-production: image-to-3d-input-gating), so every prompt states the canonical view
// in full - one subject, whole in frame with a margin, on a plain flat light ground, no shadow, no
// scenery - and each class adds what the lynx-bench rounds learned:
//   character  an orthographic front A-pose with open empty hands and nothing held (rig.py fits UE5
//              Mannequin chains to it); its T2 is a SECOND design for the isometric game camera -
//              chunky proportions, thick solid shapes with no thin parts, flat colour blocks (round
//              4's T2 rule, the hooded sorcerer that was the only game-ready hero)
//   weapon     a strict flat side profile, vertical, head at the top, exactly one blade or head and
//              its haft stated as one straight shaft (round 4's M2 rule: a mirrored second blade
//              and an over-thick shaft were the concept's defects, not the mesh's)
//   prop       an orthographic front view
// The brief's words are craft: a subject, materials, a style. A franchise, a studio or a person
// never reaches a prompt from here - the skill writes the brief, and docs/scout.md holds it to that.

import { deflateSync, crc32 } from "node:zlib";
import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import type { ConceptDesign } from "@gt/producers/scout-asset/define";

import { ASSET_CLASSES, BUDGETS, TECHNIQUES, type AssetClass, type MeshBrief, type Technique } from "../mesh/types";
import { USE_MAX } from "./types";

/* ── The brief's door ─────────────────────────────────────────────────────── */

const words = (max: number) => z.string().trim().min(1).max(max);

const briefSchema = z
  .object({
    class: z.enum(ASSET_CLASSES),
    /** What it is, in craft words: "hooded archer, leather jerkin, quiver". */
    subject: words(200),
    style: words(200).optional(),
    /** What content the asset can serve, one line (every scout run states its use - types.ts USE_MAX). */
    use: words(USE_MAX).optional(),
    /** A weapon's kind (sword, mace, axe, staff): the M1 touch-up keys on it. */
    kind: words(40).optional(),
    techniques: z.array(z.enum(TECHNIQUES)).min(1).max(TECHNIQUES.length).optional(),
  })
  .strict();

export type BriefInput = { readonly brief: MeshBrief; readonly techniques?: readonly Technique[]; readonly use?: string };

/** The skill's brief JSON as a MeshBrief: the class's budget, and a character rigged onto UE5 Mannequin chains. */
export function parseBrief(raw: unknown): Result<BriefInput> {
  const r = parseAt("asset brief", briefSchema, raw);
  if (!r.ok) return r;
  const b = r.value;
  const kind = b.class === "weapon" ? b.kind : undefined;
  const brief: MeshBrief = {
    class: b.class,
    subject: b.subject,
    ...(b.style === undefined ? {} : { style: b.style }),
    ...(kind === undefined ? {} : { kind }),
    budgetTris: BUDGETS[b.class].tris,
    ...(b.class === "character" ? { rig: "ue5-mannequin" as const } : {}),
  };
  return ok({ brief, ...(b.techniques === undefined ? {} : { techniques: b.techniques }), ...(b.use === undefined ? {} : { use: b.use }) });
}

/* ── The prompts ──────────────────────────────────────────────────────────── */

export type ConceptAsk = { readonly design: ConceptDesign; readonly prompt: string; readonly aspect: "9:16" | "1:1" };

const GROUND = "centered on a plain flat uniform light gray background, no scenery, no ground shadow, soft even studio lighting, no text, no watermark";
const POSE =
  "Standing in a neutral A-pose facing the camera, orthographic front view, arms held out and angled down away from the torso, open empty hands, legs slightly apart, nothing held in the hands, no cape. The entire body fully visible from head to feet with empty margin around it";
const CHUNKY =
  "designed to read at small size on an isometric game camera: chunky exaggerated proportions, big hands and boots, thick simple solid shapes with no thin parts, no loose straps, no fringes, no dangling cloth strips, flat strong colour blocks in a limited palette, matte materials with little fine detail, a crisp readable silhouette";
const PROFILE =
  "Strict flat orthographic side profile, the weapon perfectly vertical with the head at the top, exactly one blade or head on one straight shaft, the haft or grip stated as one straight shaft from the bottom tip to the head, the entire weapon fully visible from the bottom tip to the top tip with wide empty margin above and below, no hands, no person";

const styled = (b: MeshBrief): string => (b.style === undefined ? "" : ` Style: ${b.style}.`);

/** The concepts a brief is drawn as: its canonical view, and a character's T2 game-camera design when T2 is asked. */
export function conceptsFor(b: MeshBrief, techniques: readonly Technique[]): ConceptAsk[] {
  switch (b.class) {
    case "character": {
      const canonical: ConceptAsk = { design: "canonical", aspect: "9:16", prompt: `A full-body game character concept of ${b.subject}.${styled(b)} ${POSE}, ${GROUND}, a single character.` };
      if (!techniques.includes("T2")) return [canonical];
      return [canonical, { design: "game-camera", aspect: "9:16", prompt: `A full-body stylized game character, ${b.subject}, ${CHUNKY}.${styled(b)} ${POSE}, ${GROUND}, a single character.` }];
    }
    case "weapon":
      return [{ design: "canonical", aspect: "9:16", prompt: `A single game weapon concept: ${b.kind === undefined ? "" : `${b.kind}, `}${b.subject}.${styled(b)} ${PROFILE}, ${GROUND}, only one weapon.` }];
    case "prop":
      return [{ design: "canonical", aspect: "1:1", prompt: `A single game prop concept: ${b.subject}.${styled(b)} Orthographic front view, the whole object fully visible with empty margin around it, ${GROUND}, only one object.` }];
  }
}

/** Which concept (0-based, in `conceptsFor` order) a technique is made from: T2 its own design, the rest the canonical one. */
export function conceptIndexOf(technique: Technique, asks: readonly Pick<ConceptAsk, "design">[]): number {
  if (technique !== "T2") return 0;
  const i = asks.findIndex((a) => a.design === "game-camera");
  return i < 0 ? 0 : i;
}

/* ── Names ────────────────────────────────────────────────────────────────── */

const EXT: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Night-relative: `assets/c-05/concept-1.png`. */
export const conceptFile = (cid: string, k: number, mime: string): string => `assets/${cid}/concept-${k}.${EXT[mime] ?? "png"}`;

/** Asset-relative: the canonical concept is the asset's own; another design is `concept-<design>.<ext>`. */
export const assetConceptName = (design: ConceptDesign, ext: string): string => (design === "canonical" ? `concept${ext}` : `concept-${design}${ext}`);

/** The mesh asset a candidate hands off to: `<night>-<c-NN>-<subject words>`, inside ASSET_ID_RE. */
export function assetIdFor(nightId: string, cid: string, subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${nightId}-${cid}${slug === "" ? "" : `-${slug}`}`.slice(0, 61).replace(/-+$/, "");
}

/* ── The dry stand-in ─────────────────────────────────────────────────────── */

type Shape = { readonly hit: (x: number, y: number) => boolean };
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => ({ hit: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 });
const disc = (cx: number, cy: number, r: number): Shape => ({ hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r });
/** A thick segment from (ax, ay) to (bx, by), in unit coordinates. */
function limb(ax: number, ay: number, bx: number, by: number, r: number): Shape {
  return {
    hit: (x, y) => {
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
    },
  };
}

/** One silhouette per class, in unit coordinates (x right, y down), whole in frame with a margin. */
const SILHOUETTES: { readonly [C in AssetClass]: readonly Shape[] } = {
  character: [disc(0.5, 0.17, 0.07), rect(0.4, 0.24, 0.6, 0.55), limb(0.42, 0.27, 0.26, 0.5, 0.035), limb(0.58, 0.27, 0.74, 0.5, 0.035), limb(0.45, 0.54, 0.4, 0.86, 0.045), limb(0.55, 0.54, 0.6, 0.86, 0.045)],
  weapon: [rect(0.485, 0.2, 0.515, 0.86), limb(0.5, 0.25, 0.32, 0.18, 0.06), limb(0.5, 0.25, 0.32, 0.34, 0.06), rect(0.32, 0.18, 0.5, 0.34), disc(0.5, 0.86, 0.03)],
  prop: [rect(0.22, 0.3, 0.78, 0.78), rect(0.2, 0.26, 0.8, 0.34)],
};

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * A dry concept: the class's silhouette, dark on a plain light ground, drawn here - OUR picture,
 * built to pass the input gate a live concept must pass, so a dry night runs the gate for real.
 * The game-camera design is the same shape in a warmer tone.
 */
export function standConcept(cls: AssetClass, design: ConceptDesign): Buffer {
  const [w, h] = cls === "prop" ? [384, 384] : [288, 512];
  const ink = design === "game-camera" ? [92, 60, 38] : [46, 52, 61];
  const ground = [216, 216, 212];
  const shapes = SILHOUETTES[cls];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      const on = shapes.some((s) => s.hit(x / w, y / h));
      const c = on ? ink : ground;
      raw.set(c, row + 1 + x * 3);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
