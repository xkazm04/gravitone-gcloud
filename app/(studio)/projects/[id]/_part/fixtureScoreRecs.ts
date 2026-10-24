import "server-only";

import { recipeById } from "@gt/catalog/recipes";
import type { BlobRef } from "@gt/domain/blob";
import type { EngineView, PartVerdict, TakeView } from "@gt/domain/partView";
import { decodeStep } from "@gt/domain/steps/record";
import { FRAMES } from "@gt/domain/steps/frames";

import type { PictureUnit } from "@/lib/frames/picture/unit";
import { partVerdict, type GateKind } from "@/lib/parts/verdict";
import { pictureFromUnits } from "@/lib/score/picture";
import type { ScoreSpot } from "@/lib/score/spots";
import { sceneClock } from "@/lib/studio/score";
import type { Scene } from "@/lib/studio/projectTypes";

import type { KCtx, Obj, Recs } from "./kinds.ts";

// THE SCORE PART'S RECORDS AND WHAT THE CUT SHARES WITH IT (L40): the working record and its
// step records (`score`, `ads-score`; a take's metadata rides on its spot, its bytes are a blob
// ref - `takeBlobs`, the field the score gate reads), the picture both editors place (the frames
// record's units through their door), a take's view, and the verdict lib/parts computes. Split
// from ./fixtureScore.ts for the 400-line rule; the session, its ops and its acts stay there.

export type TakeRec = {
  readonly id: string;
  readonly label: string;
  readonly at: number;
  readonly seconds: number | null;
  readonly mark: "kept" | "rejected" | null;
  readonly engine?: EngineView;
  readonly blob?: BlobRef;
  readonly sections: readonly { readonly name: string; readonly startMs: number; readonly endMs: number }[];
  readonly revision?: { readonly section: number; readonly note: string };
};

export type BedRec = { readonly scenarioId: string | null; readonly bpm: number | null; readonly takeIds: readonly string[]; readonly activeTakeId: string | null };

export type ScoreRec = {
  /** null = no spotting was ever saved (the view proposes). */
  readonly spots: readonly ScoreSpot[] | null;
  readonly takes: Readonly<Record<string, TakeRec>>;
  readonly bed: BedRec | null;
};

/* ── shared with the cut: the picture, the engine, a take's view ───────────── */

const isObj = (x: unknown): x is Readonly<Record<string, unknown>> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The frames record's units as the timeline reads them, or null (no frames record, or one the
 *  door refuses). A plate held as a blob stands in for v1's `src` by its content address - the
 *  same projection lib/parts/verdict makes, so the editor and the verdict place one picture. */
export function unitsOf(records: Recs): PictureUnit[] | null {
  const raw = records.get("frames");
  if (raw === undefined) return null;
  const d = decodeStep(FRAMES, raw);
  if (!d.ok) return null;
  const out: PictureUnit[] = [];
  for (const u of d.value.units) {
    const plate = u.plate.src === undefined && u.plate.blob !== undefined ? { ...u.plate, src: `sha256:${u.plate.blob.sha256}` } : u.plate;
    const unit: Obj = { ...u, plate };
    // A unit the timeline cannot read is not silently left off the clock: the picture is unread.
    if (!isUnit(unit)) return null;
    out.push(unit);
  }
  return out;
}

// The door checked what readers key on and carried the rest; this checks the rest of what the
// timeline reads (lib/parts/verdict.ts guards the same boundary the same way).
const numOrNull = (x: unknown): boolean => x === null || typeof x === "number";
function isUnit(u: Obj): u is Obj & PictureUnit {
  return typeof u["id"] === "string" && typeof u["sourceId"] === "string" && (u["kind"] === "beat" || u["kind"] === "shot") && numOrNull(u["startS"]) && numOrNull(u["holdS"]) && isObj(u["plate"]) && isObj(u["beatRef"]) && typeof u["line"] === "string" && typeof u["title"] === "string";
}
export function isSpot(s: Obj): s is Obj & ScoreSpot {
  return typeof s["id"] === "string" && typeof s["title"] === "string" && Array.isArray(s["sceneIds"]) && typeof s["note"] === "string";
}

export type Picture = { readonly scenes: Scene[]; readonly clock: { scene: Scene; startS: number }[]; readonly totalS: number };

export function pictureOf(ctx: KCtx): Picture | null {
  const units = unitsOf(ctx.records());
  if (units === null || units.length === 0) return null;
  const p = pictureFromUnits(units, ctx.project.targetS ?? 0);
  return { scenes: p.scenes, clock: sceneClock(p.scenes), totalS: p.totalS };
}

/** The engine a dry act's stand-in lands under: research's and script's one function, for every kind. */
export { dryEngine as engineOf } from "./fixtureResearch.ts";

/** A take is IN HAND when its bytes are (a blob ref) or it is a dry stand-in, which says so. */
export const held = (t: TakeRec | undefined): boolean => t !== undefined && (t.blob !== undefined || t.engine?.mode === "dry");

export function takeView(t: TakeRec | undefined, id: string, active: boolean): TakeView {
  if (t === undefined) return { id, label: id, at: null, mark: null, active, held: false, seconds: null, sections: [] };
  return {
    id,
    label: t.label,
    at: new Date(t.at).toISOString(),
    mark: t.mark,
    active,
    held: held(t),
    ...(t.blob === undefined ? {} : { blob: t.blob.sha256 }),
    seconds: t.seconds,
    ...(t.engine === undefined ? {} : { engine: t.engine }),
    sections: t.sections.map((s, index) => ({ index, name: s.name, startS: s.startMs / 1000, endS: s.endMs / 1000 })),
    ...(t.revision === undefined ? {} : { revision: t.revision }),
  };
}

/** lib/parts/verdict over this project's step records - one computation for both sides. */
export function verdictFor(ctx: KCtx, kind: GateKind, takeIds: ReadonlySet<string>): PartVerdict {
  const r = recipeById(ctx.project.recipe);
  return partVerdict(kind, {
    projectId: ctx.project.id,
    title: ctx.project.title,
    discipline: ctx.project.discipline,
    targetS: ctx.project.targetS,
    plansVoice: r?.parts.some((p) => p.kind === "voice") === true,
    records: ctx.records(),
    takeIds,
  });
}

/** Every take of the project's score that is in hand (the cut's music lane reads these). */
export const heldTakes = (s: ScoreRec): Set<string> => new Set(Object.values(s.takes).filter(held).map((t) => t.id));

/* ── records ──────────────────────────────────────────────────────────────── */

type Meta = Omit<TakeRec, "id" | "blob">;
const metaOf = (t: TakeRec): Meta => {
  const { id: _i, blob: _b, ...m } = t;
  void _i;
  void _b;
  return m;
};
const loose = (ids: readonly string[], s: ScoreRec) => ({
  takeMeta: Object.fromEntries(ids.flatMap((id) => (s.takes[id] === undefined ? [] : [[id, metaOf(s.takes[id])]]))),
  takeBlobs: Object.fromEntries(ids.flatMap((id) => { const b = s.takes[id]?.blob; return b === undefined ? [] : [[id, b]]; })),
  takeLabels: Object.fromEntries(ids.flatMap((id) => (s.takes[id] === undefined ? [] : [[id, s.takes[id].label]]))),
});

export function scoreToRecords(s: ScoreRec): Record<string, Obj> {
  const out: Record<string, Obj> = {};
  if (s.spots !== null) out["score"] = { spots: s.spots.map((x) => ({ ...x, ...loose(x.takeIds ?? [], s) })) };
  if (s.bed !== null) out["ads-score"] = { ...s.bed, ...loose(s.bed.takeIds, s) };
  return out;
}

/** The takes a stored spot (or bed) carries, rebuilt from its loose fields. */
function takesFrom(o: Obj | undefined): Record<string, TakeRec> {
  const meta = isObj(o?.["takeMeta"]) ? o["takeMeta"] : {};
  const blobs = isObj(o?.["takeBlobs"]) ? o["takeBlobs"] : {};
  return Object.fromEntries(
    Object.entries(meta).flatMap(([id, m]) => {
      if (!isObj(m)) return [];
      const b = blobs[id];
      // Written by `toRecords` above through the record's door; read back as written.
      return [[id, { ...(m as Meta), id, ...(isObj(b) ? { blob: b as BlobRef } : {}) }]];
    }),
  );
}

export function scoreFromRecords(recs: Recs): ScoreRec {
  const score = recs.get("score");
  const ads = recs.get("ads-score");
  const raw = Array.isArray(score?.["spots"]) ? (score["spots"] as unknown[]) : null;
  const spots = raw === null ? null : raw.filter(isObj).filter(isSpot);
  const takes = Object.assign({}, ...(spots ?? []).map((x) => takesFrom(x)), takesFrom(ads));
  const bed: BedRec | null =
    ads === undefined
      ? null
      : {
          scenarioId: typeof ads["scenarioId"] === "string" ? ads["scenarioId"] : null,
          bpm: typeof ads["bpm"] === "number" ? ads["bpm"] : null,
          takeIds: Array.isArray(ads["takeIds"]) ? ads["takeIds"].filter((x): x is string => typeof x === "string") : [],
          activeTakeId: typeof ads["activeTakeId"] === "string" ? ads["activeTakeId"] : null,
        };
  return { spots, takes, bed };
}
