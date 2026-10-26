import { Refusal, type ActContext } from "./acts";
import type { CandidateId, NightId } from "./types";

// A KEPT STATS IDEA ON REAL DATA (spark scout-vision S5) - WP-0 CONTRACT STUB, filled by WP-E.
//
// Operator, 2026-10-26: "Do not stick with public datasets, we often need one wiki table, an article, or
// derived data from 'what if' fantasy scenarios. We are not doing academic research but entertaining
// video content with educative flavor." The 8 s strip on real data is the approval unit; a kept one makes
// the full reel (30 s - 2 min) due.

export const REEL_SOURCE_KINDS = ["table", "article", "what-if"] as const;
export type ReelSourceKind = (typeof REEL_SOURCE_KINDS)[number];

export type ReelSource = {
  readonly kind: ReelSourceKind;
  readonly title: string;
  /** https; required on table and article. */
  readonly url?: string;
  /** The page's words verbatim (<= 400); required on article. */
  readonly quote?: string;
  /** The what-if premise (<= 400); required on what-if, labelled fiction on screen. */
  readonly premise?: string;
};

export const REEL_CUT_SECONDS = { min: 30, max: 120 } as const;

export type ReelResult = { readonly candidates: readonly { readonly id: CandidateId; readonly status: string; readonly error?: string }[]; readonly jobIds: readonly string[]; readonly outcome?: string; readonly dry?: boolean };

/** `scout reel <night> --json`: [{fromIdea, source, data, cut}] -> `reel` candidates (8 s strips on real data). */
export async function reelAct(_ctx: ActContext, _id: NightId, _input: unknown): Promise<ReelResult> {
  throw new Refusal("reel: not built yet (spark scout-vision S5 WP-E)");
}

/** `scout reel-cut <night> --json`: [{fromReel, seconds}] -> `reel-cut` candidates (the full reel). */
export async function reelCutAct(_ctx: ActContext, _id: NightId, _input: unknown): Promise<ReelResult> {
  throw new Refusal("reel-cut: not built yet (spark scout-vision S5 WP-E)");
}

/** `--collect`: detached reel and reel-cut jobs' results into the night. */
export async function collectReels(_id: NightId): Promise<ReelResult["candidates"]> {
  return [];
}
