import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE STILL PRODUCER (Phase 4 wave C, L37) - an album still part's one act (L39's name):
//   still-takes  N takes through the imaging router (default 4), each its own paid unit, its pixels
//                a blob. The pick is the gate packet's (STEPS-DESIGN §2: still -> pick); the mv
//                producer's still step reads the adopted take.
// A still part has NO step record yet (@gt/domain/steps covers the six film kinds only), so the
// takes live as the job's booked outputs until a `still` record exists - said, not hidden.

export const STILL_ACTS = ["still-takes"] as const;
export const STILL_TAKES_DEFAULT = 4;
const MAX_TAKES = 12;

export type StillView = { readonly prompt: string; readonly takes?: number };

export function stillPlan(v: StillView, ask: { readonly act: string | null; readonly target?: string }, price: UnitPrice): Result<ActPlan> {
  const act = ask.act ?? "still-takes";
  if (act !== "still-takes") return refuse(`${act} is not an act of a still part`);
  if (v.prompt.trim() === "") return refuse("still takes need a prompt");
  const n = v.takes ?? STILL_TAKES_DEFAULT;
  if (!Number.isInteger(n) || n < 1 || n > MAX_TAKES) return refuse(`still takes are 1 to ${MAX_TAKES}, not ${n}`);
  return ok({ act, units: Array.from({ length: n }, (_, i) => unitOf(`take:${i + 1}`, price, { n: i + 1, prompt: v.prompt })) });
}

export const defineStill = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
