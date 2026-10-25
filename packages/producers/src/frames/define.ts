import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE FRAMES PRODUCER (Phase 4 wave C, L37) - a frames part's acts as kernel jobs, under L39's act
// names (the editor's contract):
//   direct-cut          ONE scene-direction turn over the whole cut (v1 POST /api/frames,
//                       lib/turns/kinds/frames.ts). Its answer lands as a PROPOSAL
//                       (lib/frames/directionPlan.ts planFromSpecs), never applied: v1
//                       applied it wholesale (`applySceneSpecs`) and erased human layers with no
//                       undo; accepting it is the operator's op, human layers kept;
//   render-plates       every plate that is empty, refused or behind its subject, one paid image
//                       per unit, so a crash after the fifth of sixteen re-buys none of the five;
//   render-plate        one unit's plate (target = unit id) - v1's "render the plate", now with
//                       its price on the receipt (v1 showed none for a single plate);
//   render-alternative  one more alternative for a unit, into frames-alts (adopting is an op);
//   image-takes         ads: three takes for a shot (target = shot id), or for every picked shot
//                       with none yet when the part's own plan job runs.
// The trailer lane's units are SHOTS and render the same way (v1's shots view could not render a
// plate at all - INVENTORY §3, a dead end closed here).

export const FRAMES_ACTS = ["direct-cut", "render-plates", "render-plate", "render-alternative", "image-takes"] as const;
export type FramesAct = (typeof FRAMES_ACTS)[number];

/** v1 AD_IMAGE_TAKES (lib/ads/types.ts): three takes per shot per round. */
export const AD_TAKES = 3;

export type FramesUnitView = { readonly id: string; readonly plate: "empty" | "generating" | "ready" | "refused"; readonly stale: boolean };

export type FramesView = {
  readonly face: "picture" | "ads";
  readonly units: readonly FramesUnitView[];
  /** The picked scenario's shots (ads), with how many takes each holds. */
  readonly shots: readonly { readonly id: string; readonly takes: number }[];
};

export type FramesPrices = { readonly image: UnitPrice; readonly turn: UnitPrice };

/** A plate this act would (re)render: absent, refused, or behind its subject. A `generating` plate is
 *  skipped: no v2 writer sets that state, so it is a v1-imported plate whose render's receipt key
 *  (lib/frames `pendingReceipt`) may already have been paid; the batch does not re-buy it, an explicit
 *  render of its unit does. */
export const needsPlate = (u: FramesUnitView): boolean => u.plate === "empty" || u.plate === "refused" || (u.plate === "ready" && u.stale);

export const framesDefaultAct = (v: FramesView): FramesAct => (v.face === "ads" ? "image-takes" : "render-plates");

export function framesPlan(v: FramesView, ask: { readonly act: string | null; readonly target?: string }, p: FramesPrices): Result<ActPlan> {
  const act = ask.act ?? framesDefaultAct(v);
  const unit = (id: string | undefined): FramesUnitView | undefined => (id === undefined ? undefined : v.units.find((u) => u.id === id));
  switch (act) {
    case "direct-cut":
      if (v.face === "ads") return refuse("an ads frames part has no cut to direct; its shots carry their own image line");
      if (v.units.length === 0) return refuse("direct the cut needs picture units");
      return ok({ act, units: [unitOf("direction", p.turn, { units: v.units.length })] });
    case "render-plates": {
      if (v.face === "ads") return refuse("an ads frames part renders takes per shot");
      const missing = v.units.filter(needsPlate);
      if (missing.length === 0) return refuse(v.units.length === 0 ? "render plates needs picture units" : "every plate is composed");
      return ok({ act, units: missing.map((u) => unitOf(`plate:${u.id}`, p.image, { unitId: u.id })) });
    }
    case "render-plate":
    case "render-alternative": {
      if (v.face === "ads") return refuse(`${act} renders a picture unit; an ads part renders takes per shot`);
      const u = unit(ask.target);
      if (u === undefined) return refuse(ask.target === undefined ? `${act} needs a unit` : `no unit ${ask.target}`);
      if (act === "render-alternative" && u.plate !== "ready") return refuse(`${u.id} has no plate to offer an alternative to`);
      return ok({ act, units: [unitOf(`${act === "render-plate" ? "plate" : "alt"}:${u.id}`, p.image, { unitId: u.id })] });
    }
    case "image-takes": {
      if (v.face !== "ads") return refuse("image takes are the ads face's act");
      if (v.shots.length === 0) return refuse("image takes need a picked scenario");
      const shots = ask.target === undefined ? v.shots.filter((s) => s.takes === 0) : v.shots.filter((s) => s.id === ask.target);
      if (shots.length === 0) return refuse(ask.target === undefined ? "every shot holds takes" : `no shot ${ask.target} in the picked scenario`);
      return ok({ act, units: shots.flatMap((s) => Array.from({ length: AD_TAKES }, (_, i) => unitOf(`take:${s.id}:${i + 1}`, p.image, { shotId: s.id, n: i + 1 }))) });
    }
    default:
      return refuse(`${act} is not an act of a frames part`);
  }
}

/**
 * The budget cap on a batch (v1 app/_phases/frames/renderPlan.ts, which sized the batch from
 * `GET /api/imaging/budget`): the units that fit the imaging window, or the work's own refusal
 * when none does, naming when the window frees. `affordable` null = the window is unpriced or
 * unknown: every unit runs and nothing is invented as a figure.
 */
export function capBatch(plan: ActPlan, q: { readonly verdict: "fits" | "partial" | "blocked" | "unknown"; readonly affordable: number | null; readonly resumeAt: number | null }): Result<ActPlan> {
  if (q.verdict === "blocked") return refuse(`budget ceiling reached${q.resumeAt === null ? "" : ` · resumes ${new Date(q.resumeAt).toISOString()}`}`);
  if (q.verdict !== "partial" || q.affordable === null) return ok(plan);
  if (q.affordable <= 0) return refuse(`budget ceiling reached${q.resumeAt === null ? "" : ` · resumes ${new Date(q.resumeAt).toISOString()}`}`);
  return ok({ ...plan, units: plan.units.slice(0, q.affordable) });
}

export const defineFrames = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
