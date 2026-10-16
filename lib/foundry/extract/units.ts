// THE UNITS - which unit of work comes next, how many there are, and why a
// replica's loop has ended. The rule itself moved to the job's definition
// (packages/producers/src/extract/units.ts, Phase 4 L29) so the job's plan and
// this step machine read ONE order; what is here binds v1's transfer scene count
// and v1's types, so every v1 caller (perform.ts, the CLI, the probes) keeps its
// signature.

import * as rule from "@gt/producers/extract/units";

import { TRANSFER_SCENES } from "./prompts";
import type { ExtractManifest, ReplicaRound, SettleReason } from "./types";

export type Unit = rule.Unit;

export const unitLabel = rule.unitLabel;

/** WHY this replica's loop ended, or null while it is still running. */
export const settleReason = (m: ExtractManifest, rounds: ReplicaRound[]): SettleReason | null => rule.settleReason(m, rounds);

/** The next unit of work, or null when the run is finished. */
export const next = (m: ExtractManifest): Unit | null => rule.next(m, TRANSFER_SCENES.length);

/** Total units the run will take, for the progress strip (rounds at their cap, replicas at the real count). */
export const totalUnits = (m: ExtractManifest): number => rule.totalUnits(m, TRANSFER_SCENES.length);

export const doneUnits = (m: ExtractManifest): number => rule.doneUnits(m);
