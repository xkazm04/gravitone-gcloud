import "server-only";

import { recipeById } from "@gt/catalog/recipes";
import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { framesOpLabel, scriptFaceOf, type FramesOp, type PartActKind, type PartActView } from "@gt/domain/partView";
import { needsPlate } from "@gt/producers/frames/define";
import { explainerRender, isStalePlate, subjectFor, type Frame, type Plate } from "@/lib/frames/frames";
import { frameOfUnit, framesFromUnits, trailerChain, unitsFromRender, type PictureUnit } from "@/lib/frames/picture/unit";
import { actionOfUnit } from "@/lib/frames/shotPrompt";
import { reviewSceneSpecs } from "@/lib/frames/sceneSpec";
import { derive } from "@/lib/script/trailer/ops";
import { acceptProposal, planFromSpecs, revertPass, revertRow, type Checkpoint, type DirectionProposal } from "@/lib/frames/directionPlan";

import { cardsOf } from "./fixtureResearch.ts";
import type { Ctx } from "./fixture.ts";
import type { KCtx, KindModule, Obj, Recs } from "./kinds.ts";
import { framesData, framesVerdict, isAds, pickedScenario } from "./fixtureFramesView.ts";

// FRAMES, as either side computes it (STEPS-DESIGN §2 "frames"; v1 app/_phases/frames/useFrames.ts,
// FramesAssembly.tsx, alternatives/, ads/AdsFrames.tsx). The working record is the frames step
// records read whole (frames v3 units + the direction pass's proposal and checkpoint, frames-alts,
// ads-shots); the units are DERIVED from the chain Script adopted (lib/frames/picture/unit.ts
// unitsFromRender: explainer beats, or a trailer's SHOTS) until the first edit stores them -
// never another project's chain and never the Bitcoin fixture by default (v1's free project drew
// "16 frames derived from 'Why Bitcoin's Price Won't Rise'", INVENTORY §3).
//
// What v1 had UNWIRED and is wired here: the direction pass lands a PROPOSAL
// (direction/plan.ts planFromSpecs over reviewSceneSpecs' survivors and refusals), accepted per
// row or whole with human layers kept unless the accept says overwrite, and reverted to its
// checkpoint by row or by pass - v1 applied a pass wholesale (applySceneSpecs) with no undo.
// Every edit is an op on the part's log, so ⌫ undoes a drag, a binding or an accept alike.
//
// Dry stand-ins (GRAVITONE_DRY_ONLY): a plate is the style's sample still (a public path, marked
// `dry stand-in`), a direction pass is the seeded scenes put through the REAL validator, so its
// refusals are lib/frames/sceneSpec.ts's own sentences.

export type PlateRec = Plate & { readonly blob?: BlobRef; readonly rejected?: { readonly packetId: string; readonly at: string } };
export type UnitRec = Omit<PictureUnit, "plate"> & { readonly plate: PlateRec };
export type Alt = { readonly id: string; readonly plate: PlateRec; readonly createdAt: number; readonly seeded?: boolean };
export type AdsShot = { readonly imageTakes: readonly string[]; readonly adoptedImage: string | null; readonly imageBlobs?: Readonly<Record<string, BlobRef>> };

export type FramesRec = {
  /** null: never stored - derived from the adopted chain on every read until an edit stores them. */
  readonly units: readonly UnitRec[] | null;
  readonly renderId: string | null;
  readonly direction: { readonly runs: number; readonly costUsd: number; readonly unpriced: number };
  readonly proposal: DirectionProposal | null;
  readonly checkpoint: Checkpoint | null;
  readonly alts: Readonly<Record<string, { readonly activeId: string | null; readonly alts: readonly Alt[] }>>;
  readonly adsScenario: string | null;
  readonly adsShots: Readonly<Record<string, AdsShot>>;
};

const EMPTY: FramesRec = { units: null, renderId: null, direction: { runs: 0, costUsd: 0, unpriced: 0 }, proposal: null, checkpoint: null, alts: {}, adsScenario: null, adsShots: {} };

/** The style samples a dry plate, take or clip stands in with (public/clips/presets: each name
 *  ships as a .jpg still and a .webm clip). The one list: frames, its view and motion read it. */
export const DRY_STILLS = ["signal-ledger", "blueprint", "newsprint-cutout", "paper-relief", "data-neon", "chalk-argument"] as const;
export const dryPreset = (n: number, ext: "jpg" | "webm"): string => `/clips/presets/${DRY_STILLS[Math.abs(n) % DRY_STILLS.length] ?? "signal-ledger"}.${ext}`;
const dryStill = (n: number): string => dryPreset(n, "jpg");
const hashOf = (s: string): number => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/* ── the chain and its units ──────────────────────────────────────────────── */

export type Chain = { readonly id: string; readonly title: string; readonly units: readonly UnitRec[]; readonly lane: "explainer" | "trailer" };

/** The chain Script adopted and its units (v1 useFrames' lane rule: a trailer, or a free project
 *  on beats, reads the composed spine; an explainer reads its ADOPTED render - no positional
 *  default). null when there is nothing adopted or composed yet. */
export function chainOf(ctx: KCtx): Chain | null {
  if (isAds(ctx)) return null;
  const s = ctx.rec("script");
  const face = scriptFaceOf(ctx.project.discipline, ctx.research().choice);
  if (face === "trailer") {
    if (s.cut === null) return null;
    const cut = derive(s.cut).cut;
    const template = recipeById(ctx.project.recipe)?.template ?? "trailer";
    return { ...trailerChain(cut, { template, durationS: ctx.project.targetS ?? 120 }), lane: "trailer" };
  }
  const adopted = s.candidates.find((c) => c.id === s.adopted);
  if (adopted === undefined) return null;
  return { id: adopted.id, title: adopted.title, units: unitsFromRender(explainerRender(adopted), adopted), lane: "explainer" };
}

/** The units the editor works on: the stored ones, else the adopted chain's. */
export function unitsOf(ctx: KCtx, r: FramesRec): readonly UnitRec[] {
  return r.units ?? chainOf(ctx)?.units ?? [];
}

/** The subject a plate is asked for: the stored one, else v1's beat-role seed (`subjectFor`). */
export const subjectOf = (u: UnitRec): string => u.plate.subject ?? (u.kind === "beat" ? subjectFor(frameOfUnit(u)) : (actionOfUnit(u) ?? u.staging?.subject ?? u.line));

/** A plate the next render owes: the producer's rule, called (@gt/producers/frames/define
 *  `needsPlate`: empty - a gate's rejection empties it - refused, or behind its subject by
 *  lib/frames `isStalePlate`), so the act's label counts what its receipt prices. A `generating`
 *  plate (v1-imported; no v2 writer sets it) may hold a paid receipt key and is not owed twice. */
export const owes = (u: UnitRec): boolean => needsPlate({ id: u.id, plate: u.plate.state, stale: isStalePlate(frameOfUnit(u)) });

/* ── ops ──────────────────────────────────────────────────────────────────── */

const no = (msg: string): Result<never> => err("invalid", msg);
const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

function withUnit(ctx: KCtx, r: FramesRec, unitId: string, f: (u: UnitRec) => Result<UnitRec>): Result<FramesRec> {
  const units = unitsOf(ctx, r);
  const u = units.find((x) => x.id === unitId);
  if (u === undefined) return no(`no unit ${unitId}`);
  const next = f(u);
  if (!next.ok) return next;
  return ok({ ...r, units: units.map((x) => (x.id === unitId ? next.value : x)), renderId: r.renderId ?? chainOf(ctx)?.id ?? null });
}

type Layered = Pick<UnitRec, "elements" | "texts">;
function layerOp(u: UnitRec, op: Extract<FramesOp, { layerId: string }>): Result<UnitRec> {
  const list = op.layer === "element" ? u.elements : u.texts;
  const at = list.findIndex((l) => l.id === op.layerId);
  if (at < 0) return no(`no ${op.layer} ${op.layerId} on ${u.id}`);
  const put = (items: readonly (typeof list)[number][]): UnitRec => ({ ...u, ...(op.layer === "element" ? { elements: items } : { texts: items }) }) as UnitRec & Layered;
  const touch = <T extends object>(l: T, patch: Partial<T>): T => ({ ...l, ...patch, by: "human" });
  switch (op.op) {
    case "move-layer":
      return ok(put(list.map((l, i) => (i === at ? touch(l, { x: clamp(op.x), y: clamp(op.y) }) : l))));
    case "resize-layer":
      if (op.layer !== "element") return no("a text has no box to resize");
      return ok({ ...u, elements: u.elements.map((l, i) => (i === at ? touch(l, { w: clamp(Math.max(1, op.w)), h: clamp(Math.max(1, op.h)) }) : l)) });
    case "hide-layer":
      return ok(put(list.map((l, i) => (i === at ? touch(l, { hidden: op.hidden }) : l))));
    case "remove-layer":
      return ok(put(list.filter((_, i) => i !== at)));
    case "order-layer": {
      // v1 LayerPanel: forward/backward within its group (texts always paint over elements).
      const to = at + op.dir;
      if (to < 0 || to >= list.length) return no(`${op.layerId} is already at the ${op.dir === 1 ? "front" : "back"}`);
      const moved = [...list];
      const [x] = moved.splice(at, 1);
      if (x !== undefined) moved.splice(to, 0, x);
      return ok(put(moved));
    }
  }
}

function apply(ctx: KCtx, r: FramesRec, op: FramesOp): Result<FramesRec> {
  switch (op.op) {
    case "move-layer":
    case "resize-layer":
    case "order-layer":
    case "hide-layer":
    case "remove-layer":
      return withUnit(ctx, r, op.unitId, (u) => layerOp(u, op));
    case "set-text":
      return withUnit(ctx, r, op.unitId, (u) =>
        u.texts.some((t) => t.id === op.textId) ? ok({ ...u, texts: u.texts.map((t) => (t.id === op.textId ? { ...t, value: op.value.slice(0, 90), by: "human" as const } : t)) }) : no(`no text ${op.textId}`),
      );
    case "add-text":
      return withUnit(ctx, r, op.unitId, (u) => {
        const taken = new Set(u.texts.map((t) => t.id));
        let n = u.texts.length + 1;
        while (taken.has(`t${n}`)) n++;
        return ok({ ...u, texts: [...u.texts, { id: `t${n}`, role: op.role, value: op.role, x: 8, y: 12 + 8 * (n % 8), by: "human" as const }] });
      });
    case "bind-fact": {
      const known = new Set((cardsOf(ctx.rec("research"))?.cards ?? []).filter((c) => c.kind === "fact").map((c) => c.id));
      if (op.factId !== null && !known.has(op.factId)) return no(`${op.factId} is not a fact in this notebook`);
      return withUnit(ctx, r, op.unitId, (u) => {
        if (!u.texts.some((t) => t.id === op.textId)) return no(`no text ${op.textId}`);
        return ok({ ...u, texts: u.texts.map((t) => (t.id !== op.textId ? t : op.factId === null ? { ...omitFact(t), by: "human" as const } : { ...t, factId: op.factId, by: "human" as const })) });
      });
    }
    case "set-subject":
      return withUnit(ctx, r, op.unitId, (u) => ok({ ...u, plate: { ...u.plate, subject: op.subject.slice(0, 600) } }));
    case "set-clip-motion":
      return withUnit(ctx, r, op.unitId, (u) => ok({ ...u, clip: { ...u.clip, motion: op.motion.slice(0, 800) } }));
    case "adopt-alt": {
      const alt = r.alts[op.unitId]?.alts.find((a) => a.id === op.altId);
      if (alt === undefined) return no(`no alternative ${op.altId} for ${op.unitId}`);
      const next = withUnit(ctx, r, op.unitId, (u) => ok({ ...u, plate: alt.plate }));
      return next.ok ? ok({ ...next.value, alts: { ...r.alts, [op.unitId]: { activeId: alt.id, alts: r.alts[op.unitId]?.alts ?? [] } } }) : next;
    }
    case "accept-direction": {
      if (r.proposal === null) return no("no direction to accept");
      const units = unitsOf(ctx, r);
      const pick = op.units === "all" ? "all" : new Set(units.filter((u) => op.units.includes(u.id)).map((u) => u.beatRef.at));
      const { frames, checkpoint } = acceptProposal(framesFromUnits(asUnits(units)), r.proposal, pick, op.overwrite ? "overwrite" : "keep", ctx.now);
      return ok({ ...r, units: withFrames(units, frames), renderId: r.renderId ?? chainOf(ctx)?.id ?? null, proposal: null, checkpoint });
    }
    case "discard-direction":
      return r.proposal === null ? no("no direction to discard") : ok({ ...r, proposal: null });
    case "revert-direction": {
      if (r.checkpoint === null) return no("no accepted pass to revert");
      const units = unitsOf(ctx, r);
      const at = op.unitId === undefined ? undefined : units.find((u) => u.id === op.unitId)?.beatRef.at;
      if (op.unitId !== undefined && at === undefined) return no(`no unit ${op.unitId}`);
      const current = framesFromUnits(asUnits(units));
      const frames = at === undefined ? revertPass(current, r.checkpoint) : revertRow(current, r.checkpoint, at);
      return ok({ ...r, units: withFrames(units, frames), checkpoint: at === undefined ? null : r.checkpoint });
    }
    case "rederive": {
      const chain = chainOf(ctx);
      if (chain === null) return no("nothing adopted to derive from");
      const kept = new Map(unitsOf(ctx, r).map((u) => [u.id, u]));
      // A unit that survives (same chain, same beat, same place) keeps its work; the rest are new.
      const units = chain.units.map((u) => {
        const k = kept.get(u.id);
        return k === undefined ? u : { ...u, plate: k.plate, clip: k.clip, elements: k.elements, texts: k.texts, ...(k.rationale === undefined ? {} : { rationale: k.rationale }) };
      });
      return ok({ ...r, units, renderId: chain.id, proposal: null, checkpoint: null });
    }
    case "adopt-image": {
      const shot = r.adsShots[op.shotId];
      if (shot === undefined || !shot.imageTakes.includes(op.takeId)) return no(`no take ${op.takeId} for ${op.shotId}`);
      return ok({ ...r, adsShots: { ...r.adsShots, [op.shotId]: { ...shot, adoptedImage: op.takeId } } });
    }
  }
}

const omitFact = <T extends { factId?: string }>(t: T): Omit<T, "factId"> => {
  const { factId: _gone, ...rest } = t;
  void _gone;
  return rest;
};

/** v1's frame projection reads the plate as lib's `Plate`; a blob ref and a rejection ride along. */
const asUnits = (units: readonly UnitRec[]): PictureUnit[] => units.map((u) => ({ ...u }));
/** Fold frames (by id) back onto their units: what a frame owns, the unit takes. */
function withFrames(units: readonly UnitRec[], frames: readonly Frame[]): UnitRec[] {
  const by = new Map(frames.map((f) => [f.id, f]));
  return units.map((u) => {
    const f = by.get(u.id);
    return f === undefined ? u : { ...u, plate: { ...u.plate, ...f.plate }, clip: f.clip, elements: f.elements, texts: f.texts, ...(f.rationale === undefined ? {} : { rationale: f.rationale }) };
  });
}

/* ── acts ─────────────────────────────────────────────────────────────────── */

const LABELS: Readonly<Record<string, string>> = { "direct-cut": "direct the cut", "render-plates": "render plates", "render-plate": "render", "render-alternative": "alternative", "image-takes": "3 takes" };

function acts(ctx: KCtx, r: FramesRec): PartActView[] {
  if (isAds(ctx)) return [];
  const units = unitsOf(ctx, r);
  const owed = units.filter(owes).length;
  const out: PartActView[] = [];
  if (chainOf(ctx)?.lane === "explainer") out.push({ act: "direct-cut", label: "direct the cut", needs: units.length === 0 ? ["units"] : [] });
  out.push({ act: "render-plates", label: owed === 0 ? "render plates" : `render ${owed} plates`, needs: units.length === 0 ? ["units"] : owed === 0 ? ["a plate to render"] : [] });
  return out;
}

function units(ctx: KCtx, r: FramesRec, act: PartActKind, target?: string): Result<number> {
  const all = unitsOf(ctx, r);
  switch (act) {
    case "direct-cut":
      return all.length === 0 ? no("no units to direct") : ok(1);
    case "render-plates": {
      const n = all.filter(owes).length;
      return n === 0 ? no("no plate is owed") : ok(n);
    }
    case "render-plate":
    case "render-alternative":
      return all.some((u) => u.id === target) ? ok(1) : no(`no unit ${target ?? "named"}`);
    case "image-takes":
      return pickedScenario(ctx)?.shots.some((s) => s.id === target) === true ? ok(3) : no(`no shot ${target ?? "named"} in the picked scenario`);
    default:
      return no(`${act} is not a frames act`);
  }
}

const dryPlate = (u: UnitRec, n: number): PlateRec => ({ ...u.plate, state: "ready", src: dryStill(hashOf(u.id) + n), model: "dry stand-in", subject: subjectOf(u), renderedSubject: subjectOf(u) });

function land(ctx: KCtx, r: FramesRec, act: PartActKind, at: number, jobId: string, target?: string): Result<FramesRec> {
  const all = unitsOf(ctx, r);
  const stamp = { renderId: r.renderId ?? chainOf(ctx)?.id ?? null };
  if (act === "render-plates") return ok({ ...r, ...stamp, units: all.map((u) => (owes(u) ? cleanRejected({ ...u, plate: dryPlate(u, 0) }) : u)) });
  if (act === "render-plate") return ok({ ...r, ...stamp, units: all.map((u) => (u.id === target ? cleanRejected({ ...u, plate: dryPlate(u, 0) }) : u)) });
  if (act === "render-alternative") {
    const u = all.find((x) => x.id === target);
    if (u === undefined || target === undefined) return no(`no unit ${target ?? "named"}`);
    const prior = r.alts[target]?.alts ?? [];
    // v1 alts.ts: the plate in the cut becomes the first alternative when the first is made.
    const seeded: Alt[] = prior.length === 0 && u.plate.state === "ready" ? [{ id: `${target}~a0`, plate: u.plate, createdAt: at, seeded: true }] : [];
    const alt: Alt = { id: `${target}~a${prior.length + seeded.length}`, plate: dryPlate(u, prior.length + seeded.length + 1), createdAt: at };
    return ok({ ...r, alts: { ...r.alts, [target]: { activeId: r.alts[target]?.activeId ?? seeded[0]?.id ?? null, alts: [...prior, ...seeded, alt] } } });
  }
  if (act === "image-takes") {
    const scenario = pickedScenario(ctx);
    if (scenario === null || target === undefined) return no("no scenario picked");
    const shot = r.adsShots[target] ?? { imageTakes: [], adoptedImage: null };
    const made = [0, 1, 2].map((i) => `dry:${target}:${shot.imageTakes.length + i}`);
    return ok({ ...r, adsScenario: scenario.id, adsShots: { ...(r.adsScenario === scenario.id ? r.adsShots : {}), [target]: { ...shot, imageTakes: [...shot.imageTakes, ...made] } } });
  }
  if (act === "direct-cut") {
    const frames = framesFromUnits(asUnits(all));
    const facts = (cardsOf(ctx.rec("research"))?.cards ?? []).filter((c) => c.kind === "fact");
    const grades = new Map(facts.flatMap((c) => (c.confidence === undefined ? [] : [[c.id, c.confidence] as const])));
    // The dry pass answers what the seeds already say, through the REAL validator - so what it
    // refuses (a figure citing no fact, a low-confidence figure drawn exact) is the work's sentence.
    const raw = JSON.stringify({
      scenes: frames.map((f) => ({
        beatAt: f.at,
        subject: subjectFor(f),
        motion: `${f.elements[0]?.kind ?? "the central form"} eases toward the centre as the ground settles`,
        rationale: `${f.kind} beat, held on one shape`,
        elements: f.elements,
        texts: f.texts,
      })),
    });
    const report = reviewSceneSpecs(raw, frames, new Set(facts.map((c) => c.id)), grades);
    const proposal = planFromSpecs(frames, report.specs, report.rejected, at);
    void jobId;
    return ok({ ...r, ...stamp, units: r.units ?? all, proposal, direction: { ...r.direction, runs: r.direction.runs + 1, unpriced: r.direction.unpriced + 1 } });
  }
  return no(`${act} is not a frames act`);
}

/** A fresh render clears a gate's rejection: the owed plate is paid. */
const cleanRejected = (u: UnitRec): UnitRec => {
  if (u.plate.rejected === undefined) return u;
  const { rejected: _paid, ...plate } = u.plate;
  void _paid;
  return { ...u, plate };
};

/* ── the stored records ───────────────────────────────────────────────────── */

const written = <T>(x: unknown): T => x as T;
const objOf = (x: unknown): Obj | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : undefined);

function fromRecords(recs: Recs, _ctx: Ctx): FramesRec {
  const f = recs.get("frames");
  const alts = objOf(recs.get("frames-alts")?.["byFrame"]);
  const ads = recs.get("ads-shots");
  const dir = objOf(f?.["direction"]);
  return {
    units: f === undefined ? null : written<UnitRec[]>(f["units"] ?? []),
    renderId: typeof f?.["renderId"] === "string" && f["renderId"] !== "" ? f["renderId"] : null,
    direction: { runs: Number(dir?.["runs"] ?? 0), costUsd: Number(dir?.["costUsd"] ?? 0), unpriced: Number(dir?.["unpriced"] ?? 0) },
    proposal: written<DirectionProposal | null>(f?.["proposal"] ?? null),
    checkpoint: written<Checkpoint | null>(f?.["checkpoint"] ?? null),
    alts: written<FramesRec["alts"]>(alts ?? {}),
    adsScenario: typeof ads?.["scenarioId"] === "string" ? ads["scenarioId"] : null,
    adsShots: written<FramesRec["adsShots"]>(ads?.["shots"] ?? {}),
  };
}

function toRecords(r: FramesRec): Record<string, Obj> {
  const out: Record<string, Obj> = { "frames-alts": { byFrame: r.alts } };
  if (r.units !== null)
    out["frames"] = { units: r.units, renderId: r.renderId ?? "", direction: r.direction, ...(r.proposal === null ? {} : { proposal: r.proposal }), ...(r.checkpoint === null ? {} : { checkpoint: r.checkpoint }) };
  if (r.adsScenario !== null || Object.keys(r.adsShots).length > 0) out["ads-shots"] = { scenarioId: r.adsScenario, shots: r.adsShots };
  return out;
}

export const FRAMES_KIND: KindModule<"frames"> = {
  ops: [
    "move-layer",
    "resize-layer",
    "order-layer",
    "hide-layer",
    "remove-layer",
    "set-text",
    "add-text",
    "bind-fact",
    "set-subject",
    "set-clip-motion",
    "adopt-alt",
    "accept-direction",
    "discard-direction",
    "revert-direction",
    "rederive",
    "adopt-image",
  ],
  seed: () => EMPTY,
  apply,
  label: (op) => framesOpLabel(op),
  verdict: (ctx, r) => framesVerdict(ctx, r),
  acts,
  units,
  land,
  data: (ctx, r) => framesData(ctx, r),
  actLabel: (act) => LABELS[act] ?? act,
  fromRecords,
  toRecords,
};
