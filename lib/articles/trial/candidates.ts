// WHICH SUBJECTS TO TRY: the registry's subjects ranked for a trial by currency, contest and
// relevance to this repo, instead of by coverage and alphabet (lib/articles/loop.ts
// `rankUncovered`, which classic runs keep). Server only.

import { ArticleError } from "../store";
import type { RegistryLocation } from "../registryRead";
import type { TrialCandidate } from "../types";

export interface TrialCandidates {
  candidates: TrialCandidate[];
  /** Subject keys (`bundle/slug`) a trial or a trial run already holds. */
  claimed: string[];
}

export async function rankTrialCandidates(opts: { limit?: number; registry?: RegistryLocation; root?: string } = {}): Promise<TrialCandidates> {
  void opts;
  throw new ArticleError("rankTrialCandidates is not implemented yet", 501, "not-implemented");
}
