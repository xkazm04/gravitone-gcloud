import "server-only";

import { cache } from "react";

import { liveProofPiles } from "../../../lib/decision/v1/sources/proof.ts";
import { liveSpendPiles } from "../../../lib/decision/v1/sources/spend.ts";
import { liveNow, type LiveRead } from "../../../lib/ledger/v1/sync.ts";

// v1's live work, read ONCE per request. The header (on every studio page) and the Floor both
// need it, and liveNow walks every v1 store (lib/ledger/v1/sources.ts); React's request cache
// makes the second caller in the same render take the first one's read, so the header's NEXT
// and the Floor's piles are computed from the same bytes.
//
// The Style table's proof piles (Phase 5, L56) join the v1 piles here: a style's pending proofs
// live in the kernel store, not in a v1 store the ledger projects, so they are read beside
// liveNow rather than registered as a v1 source (which the sync would walk and the runs probe
// would demand a v1 predicate for). A store that cannot be read is a named gap, as a v1 one is.
// An agent's spend requests (spark athena-control-mcp) are the same kind of pile: one per day with a
// request waiting, `pkt:spend:<day>`, read from the kernel's spend-request store beside the proofs.
async function liveWithProofs(): Promise<LiveRead> {
  const live = await liveNow();
  const kernelPiles = [
    { source: "proof", piles: liveProofPiles() },
    { source: "spend", piles: liveSpendPiles() },
  ];
  return kernelPiles.reduce<LiveRead>(
    (acc, { source, piles }) => (piles.ok ? { ...acc, weir: [...acc.weir, ...piles.value] } : { ...acc, failures: [...acc.failures, { source, error: `${piles.error.code}: ${piles.error.message}` }] }),
    live,
  );
}

export const liveRead: () => Promise<LiveRead> = cache(liveWithProofs);
