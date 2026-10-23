import { err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import type { RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";

import type { CandidateId, NightId, ReelFiles } from "../foundry/scout/types.ts";

// THE SCOUT REELS PRODUCER, BOUND (spark stats-reels WP-R1) - one /scout batch of stats ideas (`idea`
// candidates with target `stats`) as one kernel job on the Claude seat: per idea, the strips author
// turn (lib/foundry/strips/author.ts) writes the full 8 s strip from the idea's illustrative brief and
// the seat's own approach, the lint and the data-block rule hold it (one fix turn on a failure), and
// its frame 120 is rendered cold as the idea's tile (pipeline/strips/render.mts renderFrame).
//
// WP-R0 CONTRACT STUB: the signatures below are final; WP-R1 fills the bodies. The ideas door
// (lib/foundry/scout/idea.ts, WP-R2) writes each stats idea's inputs to `reelFiles(cid)` - brief.json and
// approach.json - and sets the candidate's `reel` BEFORE it calls launchReels; the job reads them there
// and writes strip.html (+ style.json) beside them and the tile to `ideas/<cid>.png`.

export type ReelsTarget = { readonly nightId: NightId; readonly candidateIds: readonly CandidateId[] };

export type LaunchReelsOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type ReelsLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The batch already has its job: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

/** The seat's lane: the strips producer's (packages/producers/src/strips/define.ts), capacity 4. */
export const SCOUT_REELS_LANE: ResourceLane = "seat.text";

/** A stats idea's directory, night-relative. */
export const reelDir = (cid: CandidateId): string => `ideas/${cid}`;

/** Where a stats idea's inputs and strip live, night-relative (the candidate's `reel`, strip once written). */
export const reelFiles = (cid: CandidateId): Required<ReelFiles> => ({ brief: `${reelDir(cid)}/brief.json`, approach: `${reelDir(cid)}/approach.json`, strip: `${reelDir(cid)}/strip.html` });

/** The tile: the strip's frame 120, beside the studio artboards (lib/producers/scoutIdeaActs.ts ideaFile). */
export const reelTile = (cid: CandidateId): string => `ideas/${cid}.png`;

/** The frame the tile shows: renderStrip's poster frame. */
export const REEL_TILE_FRAME = 120;

export const reelsJobId = (t: ReelsTarget): string => `job:scout-reels:${t.nightId}:${t.candidateIds[0] ?? ""}`;

/** The batch's receipt (no token), or its confirm - lib/producers/scoutIdea.ts `launchIdeas`'s contract. */
export async function launchReels(_store: Store, _target: ReelsTarget, _opts: LaunchReelsOptions): Promise<Result<ReelsLaunch>> {
  return Promise.resolve(err("internal", "scout-reels: not built yet (spark stats-reels WP-R1)"));
}

/** Drive one reels job on this process (a test, or pipeline/scout.mts when not detached): the worker's rules. */
export async function driveReels(_store: Store, _location: string, _jobId: string, _o: { readonly dryOnly?: boolean } = {}): Promise<Result<RunReport>> {
  return Promise.resolve(err("internal", "scout-reels: not built yet (spark stats-reels WP-R1)"));
}
