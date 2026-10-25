// THE NIGHT'S PROPOSALS (spark scout-vision S2) - a `genre` resting on a kept storyboard, a `venture` resting on a
// publishable genre's kept piece (channel) or on kept track clips (album). Words-only candidates, like a direction:
// the operator's keep on the packet births the genre or venture (lib/decision/v1/sources/scout.ts apply), a reject
// with a reason bans it. WP0 stub: the signature is final; WP2 writes the door and the act.

import type { Result } from "@gt/domain/errors";

import type { GenreProposalCandidate, NightId, VentureProposalCandidate } from "./types";

/**
 * `[{kind: "genre", name, fromStoryboard, look, grammar, use?, aim?} | {kind: "venture", name, ventureKind, frame,
 * basedOn, use?, aim?}]` -> the night's new proposal candidates, or the first bad brief's place and why. One bad brief
 * refuses the batch; nothing is written then.
 */
export async function addProposals(_id: NightId, _raw: unknown): Promise<Result<readonly (GenreProposalCandidate | VentureProposalCandidate)[]>> {
  throw new Error("addProposals: WP2");
}
