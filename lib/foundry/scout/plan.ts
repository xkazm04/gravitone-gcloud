import { Refusal, type ActContext } from "./acts";
import type { NightId } from "./types";

// THE NIGHT'S PLAN QUEUE (spark scout-vision S6) - WP-0 CONTRACT STUB, filled by WP-D.
//
// The seat writes the night's remaining work as items in `foundry-out/scout/<night>/plan.json`; the
// worker's `night-fill` timer launches the oldest queued item whose lane is idle while the box sits
// under the band, through the same door the CLI verb calls, and closes the night at its `until`.

export const PLAN_KINDS = ["storyboards", "ideas", "extract", "scenes", "assets", "sheets", "reels", "draft"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATES = ["queued", "launched", "refused", "failed", "expired"] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export type PlanItem = {
  /** `pl-NN`, numbered in the night. */
  readonly id: string;
  readonly kind: PlanKind;
  /** The door's own JSON input, validated by that door's parser when the item is planned. */
  readonly payload: unknown;
  /** One sentence: which rung the item serves. */
  readonly why: string;
  readonly state: PlanState;
  /** ISO time the item last changed state. */
  readonly at: string;
  /** Present once launched. */
  readonly jobId?: string;
  /** Present on refused, failed and expired. */
  readonly reason?: string;
};

export type PlanResult = { readonly items: readonly PlanItem[] };

/** `scout plan <night> --json`: validate and append items; nothing spent, nothing launched. */
export async function planAct(_ctx: ActContext, _id: NightId, _input: unknown): Promise<PlanResult> {
  throw new Refusal("plan: not built yet (spark scout-vision S6 WP-D)");
}

/** The night's queue, oldest first; an absent plan.json is an empty queue. */
export async function readPlan(_id: NightId): Promise<readonly PlanItem[]> {
  return [];
}
