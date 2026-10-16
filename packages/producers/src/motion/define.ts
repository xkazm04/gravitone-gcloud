import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE MOTION PRODUCER (Phase 4 wave C, L37) - a motion part's acts as kernel jobs (L39's names):
//   direct-motion  the two recognize passes over a plate (v1 app/_phases/motion/direction.ts: READ,
//                  then PROPOSE, then the code-side filter that drops camera moves and
//                  non-separable elements and DECLINES when nothing can move). v1 ran it as a
//                  plain fetch with the plate as base64 and no price; here it is a unit per plate,
//                  priced on the receipt, and a decline is a produced outcome with its reason;
//   render-clip    the clip v1 never had for a standard plate: Leonardo image-to-video, or Wan i2v
//                  on the GPU, per the part's option. Ads: the clip for an adopted take.

export const MOTION_ACTS = ["direct-motion", "render-clip"] as const;
export type MotionAct = (typeof MOTION_ACTS)[number];

export type MotionUnitView = {
  readonly id: string;
  /** The plate has pixels (a blob) to read and to animate. */
  readonly plated: boolean;
  /** Accepted motion on the unit's clip (`clip.motion`). */
  readonly motion: boolean;
  /** A direction outcome exists for THIS plate (its signature matches). */
  readonly directed: boolean;
  readonly clipDone: boolean;
};

export type MotionView = {
  readonly face: "picture" | "ads";
  readonly units: readonly MotionUnitView[];
  /** The picked scenario's shots (ads): an adopted take is what a clip animates. */
  readonly shots: readonly { readonly id: string; readonly adopted: boolean; readonly clipDone: boolean }[];
};

export type MotionPrices = { readonly read: UnitPrice; readonly clip: UnitPrice };

export const motionDefaultAct = (v: MotionView): MotionAct => (v.face === "ads" || v.units.every((u) => !u.plated || u.motion || u.directed) ? "render-clip" : "direct-motion");

export function motionPlan(v: MotionView, ask: { readonly act: string | null; readonly target?: string }, p: MotionPrices): Result<ActPlan> {
  const act = ask.act ?? motionDefaultAct(v);
  switch (act) {
    case "direct-motion": {
      if (v.face === "ads") return refuse("an ads shot's motion is written in its scenario; there is no plate to direct");
      if (ask.target !== undefined) {
        const u = v.units.find((x) => x.id === ask.target);
        if (u === undefined) return refuse(`no unit ${ask.target}`);
        if (!u.plated) return refuse(`${u.id} has no plate to direct`);
        return ok({ act, units: [unitOf(`direct:${u.id}`, p.read, { unitId: u.id })] });
      }
      const open = v.units.filter((u) => u.plated && !u.motion && !u.directed);
      if (open.length === 0) return refuse(v.units.some((u) => u.plated) ? "every plate is directed" : "no plate to direct");
      return ok({ act, units: open.map((u) => unitOf(`direct:${u.id}`, p.read, { unitId: u.id })) });
    }
    case "render-clip": {
      if (v.face === "ads") {
        const shots = ask.target === undefined ? v.shots.filter((s) => s.adopted && !s.clipDone) : v.shots.filter((s) => s.id === ask.target);
        const first = shots[0];
        if (ask.target !== undefined && first === undefined) return refuse(`no shot ${ask.target} in the picked scenario`);
        if (ask.target !== undefined && first !== undefined && !first.adopted) return refuse(`${first.id} has no adopted take to animate`);
        if (shots.length === 0) return refuse("no adopted take waits for a clip");
        return ok({ act, units: shots.map((s) => unitOf(`clip:${s.id}`, p.clip, { shotId: s.id })) });
      }
      const pick = ask.target === undefined ? v.units.filter((u) => u.plated && u.motion && !u.clipDone) : v.units.filter((u) => u.id === ask.target);
      const u = pick[0];
      if (ask.target !== undefined) {
        if (u === undefined) return refuse(`no unit ${ask.target}`);
        if (!u.plated) return refuse(`${u.id} has no plate to animate`);
        if (!u.motion) return refuse(`${u.id} has no accepted motion`);
      }
      if (pick.length === 0) return refuse("no directed plate waits for a clip");
      return ok({ act, units: pick.map((x) => unitOf(`clip:${x.id}`, p.clip, { unitId: x.id })) });
    }
    default:
      return refuse(`${act} is not an act of a motion part`);
  }
}

export const defineMotion = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
