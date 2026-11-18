// THE /reels LAUNCH DOOR (spark reel-studio): four jobs a reel walks through, each launched receipt-first.
//
//   reel-data     seat.text   a Claude seat turn researches a sourced, licensed table for the idea
//   reel-author   seat.text   a Claude seat turn writes film/reel.html + film/reel-desktop.html (redo notes in time order)
//   reel-render   box.render  steps stills, render:desktop, render:phone, thumbs (the GPU browser; frame progress in film/progress.json)
//   reel-release  box.render  steps mix:desktop, mix:phone, encode:desktop, encode:phone, vmaf
//
// WP-0 STUB: the types are the contract; WP2 fills the body.

import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import type { ReelPin } from "../reel/store.ts";
import { ReelError } from "../reel/types.ts";

export type ReelJobKind = "reel-data" | "reel-author" | "reel-render" | "reel-release";
export const REEL_JOB_KINDS: readonly ReelJobKind[] = ["reel-data", "reel-author", "reel-render", "reel-release"];

export type LaunchReelJobOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  /** reel-author only: the redo verdict's pins, in time order. */
  readonly notes?: readonly ReelPin[];
  /** reel-data only: the operator's words when a table was sent back. */
  readonly note?: string;
  readonly now?: number;
};

export type ReelJobLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The reel already has this job open: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

/** The job id of one kind for one reel: `job:<kind>:<slug>:<n>`, n counting launches of that kind. */
export type ReelJobId = string;

export async function launchReelJob(kind: ReelJobKind, slug: string, opts: LaunchReelJobOptions): Promise<Result<ReelJobLaunch>> {
  void kind;
  void slug;
  void opts;
  throw new ReelError("launchReelJob is not built yet (spark reel-studio WP2)", "unbuilt");
}

/** The open and latest jobs of a reel, for the screen: kind, state, and the render's frame progress when one runs. */
export type ReelJobView = {
  readonly kind: ReelJobKind;
  readonly jobId: string;
  readonly state: Job["state"];
  readonly progress?: { readonly face: "desktop" | "phone"; readonly frame: number; readonly frames: number };
  /** The job's last error, verbatim. */
  readonly error?: string;
};

export async function reelJobsOf(slug: string): Promise<readonly ReelJobView[]> {
  void slug;
  throw new ReelError("reelJobsOf is not built yet (spark reel-studio WP2)", "unbuilt");
}
