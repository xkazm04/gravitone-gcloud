// THE DECISION GRAPH'S BUILDER - server only (spark scout-decision-graph WP-S2). WP-S0 STUB: the signatures are
// the contract; WP-S2 fills the bodies. Every night, every seed batch and the steer, joined into one
// @gt/domain/scoutGraph ScoutGraph; effort read from the kernel store when one is handed in.

import type { Store } from "@gt/kernel/store";
import type { ScoutGraph } from "@gt/domain/scoutGraph";

import type { Steer } from "./types";

export type GraphOptions = {
  /** The kernel store effort is read from (spend rows, job events); absent: no node carries effort. */
  readonly store?: Store;
  readonly now?: Date;
};

export async function buildGraph(_o: GraphOptions = {}): Promise<ScoutGraph> {
  throw new Error("the graph builder is being built (spark scout-decision-graph WP-S2)");
}

/** The taste brief's `## Branches`: each group's live depth, keeps, effort and its split target vs actual share. */
export function branchesSection(_graph: ScoutGraph, _steer: Steer): string[] {
  return [];
}
