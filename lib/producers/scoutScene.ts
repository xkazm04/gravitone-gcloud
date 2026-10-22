import { err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import type { Store } from "@gt/kernel/store";

import type { CandidateId, NightId } from "../foundry/scout/types";

// THE SCOUT SCENE PRODUCER, BOUND (spark media-training-loop WP2) - a scene
// candidate's acts as one kernel job: read the source keyframes into a
// SceneRecipe (words), render replica stills from those words, and, while the
// night's clip cap allows, animate OUR replica into a clip.
//
// WP0 STUB: the launch contract the CLI (pipeline/scout.mts) is written against.
// WP2 replaces the body and adds the producer; the signature is the contract.

export type SceneTarget = { readonly nightId: NightId; readonly candidateId: CandidateId };

export type LaunchSceneOptions = {
  readonly mode: ReceiptMode;
  /** The night's remaining money (lib/foundry/scout/budget.ts), the job's ceiling. */
  readonly ceilingUsd: number;
  /** False once the night's clip cap is spent: the job reads and replicates, and renders no clip. */
  readonly clip: boolean;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type SceneLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The candidate already has a job that is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

export async function launchScene(_store: Store, target: SceneTarget, _opts: LaunchSceneOptions): Promise<Result<SceneLaunch>> {
  return err("unavailable", `scene ${target.nightId}/${target.candidateId}: the scout-scene producer is not built yet`);
}
