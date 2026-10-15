import "server-only";

import { cache } from "react";

import { liveNow, type LiveRead } from "../../../lib/ledger/v1/sync.ts";

// v1's live work, read ONCE per request. The header (on every studio page) and the Floor both
// need it, and liveNow walks every v1 store (lib/ledger/v1/sources.ts); React's request cache
// makes the second caller in the same render take the first one's read, so the header's NEXT
// and the Floor's piles are computed from the same bytes.
export const liveRead: () => Promise<LiveRead> = cache(liveNow);
