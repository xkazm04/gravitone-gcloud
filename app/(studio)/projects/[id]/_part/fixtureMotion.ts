import "server-only";

import { blobRefSchema, type BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { framesOpLabel, type UnitClipView, type MotionData, type MotionOp, type MotionUnitView, type PartActKind, type PartActView, type PartVerdict } from "@gt/domain/partView";
import { MOTION_MAX_CHARS, type MotionOutcome } from "@/app/_phases/motion/direction";
import { partVerdict, plateSigOf } from "@/lib/parts/verdict";

import type { Ctx } from "./fixture.ts";
import { unitsOf, type UnitRec } from "./fixtureFrames.ts";
import { isAds, pickedScenario, plateUrl, plateView, stepRecords, takeUrl, verdictInputOf } from "./fixtureFramesView.ts";
import type { KCtx, KindModule, Obj, Recs } from "./kinds.ts";

// MOTION, as either side computes it (STEPS-DESIGN §2 "motion"; v1 app/_phases/motion/MotionStep.tsx,
// useMotion.ts, direction.ts, ads/AdsMotion.tsx). The plates are Frames' (read through
// `ctx.rec("frames")`, never copied); this part owns what MOVES: the direction outcome per unit
// (motion-direction, keyed by the plate's signature so a re-drawn plate shows its old outcome as
// stale, v1 useMotion.ts:74-81), the accepted line on the unit's clip (v1 acceptIntoFramesRecord:
// written onto the frames UNITS, the record's truth), and the rendered clip.
//
// What v1 lacked and this has: a motion part for EVERY recipe that plans one, reachable from a
// trailer's shots (v1 was a dead end, "Open Frames", with 30 derived shots); a clip RENDER (v1's
// FrameClip.status was "not-started" forever - "a clip in this app is AUTHORED, never rendered");
// a price before "direct" (a plain fetch with no cost in v1); and ⌫ over an accept.

type ClipRec = { readonly id: string; readonly status: string; readonly src?: string; readonly blob?: BlobRef };
export type MotionRec = {
  readonly byFrame: Readonly<Record<string, { readonly outcome: MotionOutcome; readonly plate: string }>>;
  /** The lines this part accepted onto units' clips (a cleared line is ""). */
  readonly accepted: Readonly<Record<string, string>>;
  readonly clips: Readonly<Record<string, ClipRec>>;
  readonly adsClips: Readonly<Record<string, { readonly clips: readonly ClipRec[]; readonly adoptedClip: string | null }>>;
  /** Real side: the stored frames / ads-shots records, written back with only motion's fields moved. */
  readonly framesRaw: Obj | null;
  readonly adsRaw: Obj | null;
};

const EMPTY: MotionRec = { byFrame: {}, accepted: {}, clips: {}, adsClips: {}, framesRaw: null, adsRaw: null };
const no = (msg: string): Result<never> => err("invalid", msg);
const DRY_CLIPS = ["signal-ledger", "blueprint", "newsprint-cutout", "paper-relief", "data-neon", "chalk-argument"] as const;
const dryClip = (n: number): string => `/clips/presets/${DRY_CLIPS[Math.abs(n) % DRY_CLIPS.length] ?? "signal-ledger"}.webm`;

const platedUnits = (ctx: KCtx): readonly UnitRec[] => unitsOf(ctx, ctx.rec("frames"));
const lineOf = (m: MotionRec, u: UnitRec): string => m.accepted[u.id] ?? u.clip.motion;
const clipUrl = (c: { readonly blob?: BlobRef; readonly src?: string } | undefined): string | null => (c === undefined ? null : plateUrl(c));

/* ── ops ──────────────────────────────────────────────────────────────────── */

function apply(ctx: KCtx, m: MotionRec, op: MotionOp): Result<MotionRec> {
  if (op.op === "adopt-clip") {
    const shot = m.adsClips[op.shotId];
    if (shot === undefined || !shot.clips.some((c) => c.id === op.clipId)) return no(`no clip ${op.clipId} for ${op.shotId}`);
    return ok({ ...m, adsClips: { ...m.adsClips, [op.shotId]: { ...shot, adoptedClip: op.clipId } } });
  }
  const u = platedUnits(ctx).find((x) => x.id === op.unitId);
  if (u === undefined) return no(`no unit ${op.unitId}`);
  if (op.op === "clear-motion") return lineOf(m, u) === "" ? no(`${op.unitId} has no motion to clear`) : ok({ ...m, accepted: { ...m.accepted, [u.id]: "" } });
  const out = m.byFrame[u.id];
  const own = op.motion?.trim();
  const line = own !== undefined && own !== "" ? own : out?.outcome.kind === "proposed" ? out.outcome.motion : "";
  // v1 withAcceptedMotion: a blank line is not a motion and must not overwrite one.
  if (line === "") return no(`${op.unitId} has no proposal to accept`);
  return ok({ ...m, accepted: { ...m.accepted, [u.id]: line.slice(0, MOTION_MAX_CHARS) } });
}

/* ── acts ─────────────────────────────────────────────────────────────────── */

function units(ctx: KCtx, m: MotionRec, act: PartActKind, target?: string): Result<number> {
  if (isAds(ctx)) {
    if (act !== "render-clip") return no(`${act} is not an ads motion act`);
    return pickedScenario(ctx)?.shots.some((s) => s.id === target) === true ? ok(1) : no(`no shot ${target ?? "named"} in the picked scenario`);
  }
  const u = platedUnits(ctx).find((x) => x.id === target);
  if (u === undefined) return no(`no unit ${target ?? "named"}`);
  if (u.plate.state !== "ready") return no(`${u.id} has no plate`);
  if (act === "direct-motion") return ok(1);
  if (act === "render-clip") return lineOf(m, u).trim() === "" ? no(`${u.id} has no accepted motion`) : ok(1);
  return no(`${act} is not a motion act`);
}

/** The dry direction: the two recognize passes' shape with nothing called - a decline when the
 *  plate holds no separable layer (v1's own sentence), else one mover per named element. */
function dryOutcome(u: UnitRec, at: number): MotionOutcome {
  const names = u.elements.filter((e) => e.hidden !== true).map((e) => e.label || e.kind);
  const basis = { scene: u.title, elements: names, provider: "dry", model: "stand-in" };
  if (names.length === 0) return { kind: "declined", reason: "no separable element: nothing in the plate can move on its own", basis, at };
  const moves = names.slice(0, 2).map((element, i) => ({ element, verb: i === 0 ? "drifts slowly to the right" : "rises a little" }));
  const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    kind: "proposed",
    motion: `${moves.map((x) => cap(`${/^the /i.test(x.element) ? "" : "the "}${x.element} ${x.verb}`)).join("; ")}; the ground holds still.`,
    basis: { ...basis, moves, holdsStill: ["ground"] },
    at,
  };
}

function land(ctx: KCtx, m: MotionRec, act: PartActKind, at: number, jobId: string, target?: string): Result<MotionRec> {
  void jobId;
  if (target === undefined) return no(`${act} names no unit`);
  if (isAds(ctx)) {
    const prior = m.adsClips[target] ?? { clips: [], adoptedClip: null };
    const clip: ClipRec = { id: `${target}~c${prior.clips.length}`, status: "done", src: dryClip(prior.clips.length) };
    // v1 AdsMotion: the first finished clip is adopted; "adopt" picks another.
    return ok({ ...m, adsClips: { ...m.adsClips, [target]: { clips: [...prior.clips, clip], adoptedClip: prior.adoptedClip ?? clip.id } } });
  }
  const u = platedUnits(ctx).find((x) => x.id === target);
  if (u === undefined) return no(`no unit ${target}`);
  if (act === "direct-motion") return ok({ ...m, byFrame: { ...m.byFrame, [u.id]: { outcome: dryOutcome(u, at), plate: plateSigOf(u.plate) } } });
  if (act === "render-clip") return ok({ ...m, clips: { ...m.clips, [u.id]: { id: `${u.id}~clip`, status: "done", src: dryClip(u.id.length) } } });
  return no(`${act} is not a motion act`);
}

/* ── the view ─────────────────────────────────────────────────────────────── */

function unitView(m: MotionRec, u: UnitRec): MotionUnitView {
  const line = lineOf(m, u);
  const d = m.byFrame[u.id];
  const fresh = d !== undefined && d.plate === plateSigOf(u.plate);
  const o = d?.outcome;
  const clip = m.clips[u.id];
  const clipView: UnitClipView = { status: clip?.status ?? u.clip.status, motion: line, url: clipUrl(clip) };
  const pos = (name: string) => {
    const el = u.elements.find((e) => (e.label || e.kind) === name);
    return el === undefined ? {} : { x: el.x + el.w / 2, y: el.y + el.h / 2 };
  };
  return {
    id: u.id,
    at: u.beatRef.at,
    title: u.title,
    beatKind: u.beatKind,
    plate: plateView(u),
    motion: line,
    state: line.trim() !== "" ? "moving" : fresh && o?.kind === "declined" ? "declined" : fresh && o?.kind === "proposed" ? "proposed" : "none",
    ...(o?.kind === "proposed"
      ? { proposal: { text: o.motion, moves: o.basis.moves.map((x) => ({ ...x, ...pos(x.element) })), holdsStill: o.basis.holdsStill, provider: o.basis.provider, model: o.basis.model, dry: o.basis.provider === "dry" } }
      : {}),
    ...(o?.kind === "declined" ? { declined: o.reason } : {}),
    outcomeStale: d !== undefined && !fresh,
    clip: clipView,
  };
}

function data(ctx: KCtx, m: MotionRec): MotionData {
  if (isAds(ctx)) {
    const picked = pickedScenario(ctx);
    const f = ctx.rec("frames");
    const moved = picked !== null && f.adsScenario !== null && f.adsScenario !== picked.id;
    return {
      face: "clips",
      scenario: picked === null ? null : { id: picked.id, title: picked.title },
      scenarioMoved: moved,
      shots: (picked?.shots ?? []).map((s) => {
        const img = moved ? undefined : f.adsShots[s.id];
        const c = m.adsClips[s.id];
        return {
          id: s.id,
          durationS: s.durationS,
          motion: s.motion,
          still: img?.adoptedImage == null ? null : takeUrl(img.adoptedImage, img.imageBlobs),
          adopted: c?.adoptedClip ?? null,
          clips: (c?.clips ?? []).map((x) => ({ id: x.id, status: x.status, url: clipUrl(x), adopted: x.id === c?.adoptedClip, dry: x.src !== undefined && x.blob === undefined })),
        };
      }),
    };
  }
  const list = platedUnits(ctx).map((u) => unitView(m, u));
  const plated = list.filter((u) => u.plate.state === "ready");
  const moving = plated.filter((u) => u.state === "moving").length;
  const declined = plated.filter((u) => u.state === "declined").length;
  return { face: "plates", units: list, tally: { moving, declined, open: plated.length - moving - declined, total: plated.length, clips: list.filter((u) => u.clip.url !== null).length } };
}

/** The records motion's verdict reads: frames' units with this part's lines, its outcomes, the ads clips. */
function records(ctx: KCtx, m: MotionRec): Map<string, Obj> {
  const f = ctx.rec("frames");
  const units = unitsOf(ctx, f).map((u) => ({ ...u, clip: { ...u.clip, motion: lineOf(m, u) } }));
  const shots = Object.fromEntries(Object.entries(f.adsShots).map(([id, s]) => [id, { ...s, clips: m.adsClips[id]?.clips ?? [], adoptedClip: m.adsClips[id]?.adoptedClip ?? null }]));
  const base = stepRecords(ctx, { ...f, units, adsShots: shots }, { "motion-direction": { byFrame: m.byFrame } });
  return base;
}

const verdict = (ctx: KCtx, m: MotionRec): PartVerdict => partVerdict("motion", verdictInputOf(ctx, records(ctx, m)));

/* ── the stored records ───────────────────────────────────────────────────── */

const written = <T>(x: unknown): T => x as T;
const objOf = (x: unknown): Obj | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : undefined);
const refOf = (x: unknown): BlobRef | undefined => {
  const p = blobRefSchema.safeParse(x);
  return p.success ? p.data : undefined;
};

function fromRecords(recs: Recs, _ctx: Ctx): MotionRec {
  const frames = recs.get("frames") ?? null;
  const ads = recs.get("ads-shots") ?? null;
  const units = (Array.isArray(frames?.["units"]) ? frames["units"] : []).map((u: unknown) => objOf(u) ?? {});
  const clips: Record<string, ClipRec> = {};
  for (const u of units) {
    const c = objOf(u["clip"]);
    const blob = refOf(c?.["blob"]);
    if (c !== undefined && (blob !== undefined || typeof c["src"] === "string"))
      clips[String(u["id"])] = { id: `${String(u["id"])}~clip`, status: String(c["status"] ?? "done"), ...(blob === undefined ? {} : { blob }), ...(typeof c["src"] === "string" ? { src: c["src"] } : {}) };
  }
  const adsClips = Object.fromEntries(
    Object.entries(objOf(ads?.["shots"]) ?? {}).map(([id, s]) => [
      id,
      { clips: written<ClipRec[]>(objOf(s)?.["clips"] ?? []), adoptedClip: typeof objOf(s)?.["adoptedClip"] === "string" ? String(objOf(s)?.["adoptedClip"]) : null },
    ]),
  );
  return { byFrame: written<MotionRec["byFrame"]>(recs.get("motion-direction")?.["byFrame"] ?? {}), accepted: {}, clips, adsClips, framesRaw: frames, adsRaw: ads };
}

function toRecords(m: MotionRec): Record<string, Obj> {
  const out: Record<string, Obj> = { "motion-direction": { byFrame: m.byFrame } };
  const f = m.framesRaw;
  if (f !== null && Array.isArray(f["units"])) {
    out["frames"] = {
      ...f,
      units: f["units"].map((x: unknown) => {
        const u = objOf(x) ?? {};
        const id = String(u["id"]);
        const line = m.accepted[id];
        const c = m.clips[id];
        const clip = {
          ...(objOf(u["clip"]) ?? {}),
          ...(line === undefined ? {} : { motion: line }),
          ...(c === undefined ? {} : { status: c.status, ...(c.blob === undefined ? {} : { blob: c.blob }), ...(c.src === undefined ? {} : { src: c.src }) }),
        };
        return { ...u, clip };
      }),
    };
  }
  if (m.adsRaw !== null || Object.keys(m.adsClips).length > 0) {
    const a = m.adsRaw ?? { scenarioId: null, shots: {} };
    const shots = { ...(objOf(a["shots"]) ?? {}) };
    for (const [id, c] of Object.entries(m.adsClips)) shots[id] = { imageTakes: [], adoptedImage: null, ...(objOf(shots[id]) ?? {}), clips: c.clips, adoptedClip: c.adoptedClip };
    out["ads-shots"] = { ...a, shots };
  }
  return out;
}

const acts = (): PartActView[] => [];

export const MOTION_KIND: KindModule<"motion"> = {
  ops: ["accept-motion", "clear-motion", "adopt-clip"],
  seed: () => EMPTY,
  apply,
  label: (op) => framesOpLabel(op),
  verdict,
  acts,
  units,
  land,
  data,
  actLabel: (act) => (act === "direct-motion" ? "motion direction" : act === "render-clip" ? "clip render" : act),
  fromRecords,
  toRecords,
  stored: true,
};
