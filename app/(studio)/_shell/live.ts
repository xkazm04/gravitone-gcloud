import "server-only";

import { cache } from "react";

import { liveFinalPiles } from "../../../lib/decision/v1/sources/final.ts";
import { liveProofPiles } from "../../../lib/decision/v1/sources/proof.ts";
import { liveReelPiles } from "../../../lib/decision/v1/sources/reel.ts";
import { liveSpendPiles } from "../../../lib/decision/v1/sources/spend.ts";
import { liveNow, type LiveRead } from "../../../lib/ledger/v1/sync.ts";

// v1's live work, read ONCE per request. Its readers are the Scout header (its NEXT,
// ./headerFacts.ts scoutHeaderFacts), the Floor and the Board's weir; the studio header on every
// page no longer reads it (2026-10-24). liveNow walks every v1 store (lib/ledger/v1/sources.ts),
// and React's request cache makes a second caller in the same render take the first one's read,
// so two readers in one render compute from the same bytes.
//
// The Style table's proof piles (Phase 5, L56) join the v1 piles here: a style's pending proofs
// live in the kernel store, not in a v1 store the ledger projects, so they are read beside
// liveNow rather than registered as a v1 source (which the sync would walk and the runs probe
// would demand a v1 predicate for). A store that cannot be read is a named gap, as a v1 one is.
// An agent's spend requests (spark athena-control-mcp) are the same kind of pile: one per day with a
// request waiting, `pkt:spend:<day>`, read from the kernel's spend-request store beside the proofs.
// A stat reel's stops (pipeline/reel.mts) are read the same way from the reel folders: `pkt:reel:<slug>:<stop>`
// for each card, sheet or cut nobody has judged yet. A stop is a look, not a job, so the ledger has no source for it.
async function liveWithProofs(): Promise<LiveRead> {
  const [live, reels] = await Promise.all([liveNow(), liveReelPiles()]);
  const kernelPiles = [
    { source: "proof", piles: liveProofPiles() },
    { source: "spend", piles: liveSpendPiles() },
    { source: "final", piles: liveFinalPiles() },
    { source: "reel", piles: reels },
  ];
  return kernelPiles.reduce<LiveRead>(
    (acc, { source, piles }) => (piles.ok ? { ...acc, weir: [...acc.weir, ...piles.value] } : { ...acc, failures: [...acc.failures, { source, error: `${piles.error.code}: ${piles.error.message}` }] }),
    live,
  );
}

export const liveRead: () => Promise<LiveRead> = cache(liveWithProofs);
