import type { Actor } from "@gt/domain/event";
import type { SpendRequest, SpendRequestState, SpendSubject } from "@gt/domain/mcp";
import type { Receipt } from "@gt/domain/produce";

import type { Reader, Tx } from "../store.ts";

// THE SPEND-REQUEST STORE (spark athena-control-mcp) - an agent's live launch that would spend, held for
// the operator's K or X on `pkt:spend:<day>`. WP0 STUB: the signatures are the contract the MCP door
// (app/_server/mcp/) and the Board adapter (lib/decision/v1/sources/spend.ts) build against; WP1 writes
// the table, its migrations (registered in ../kernel.ts) and the bodies. Every write appends a
// `spend.<state>` event with the actor it was handed; transitions follow @gt/domain/mcp SPEND_TRANSITIONS.

export type FileInput = { readonly subject: SpendSubject; readonly receipt: Receipt };

export type ListFilter = { readonly day?: string; readonly state?: SpendRequestState; readonly actorId?: string; readonly limit?: number };

export type Decision = { readonly verdict: "confirmed" } | { readonly verdict: "refused"; readonly reasons: readonly string[]; readonly note?: string };

const STUB = "spend-requests: not built yet (spark athena-control-mcp WP1)";

/** File a request inside the caller's transaction; `t.at` stamps it and names its day. */
export function fileSpendRequest(_t: Tx, _input: FileInput, _actor: Actor): SpendRequest {
  throw new Error(STUB);
}

export function readSpendRequest(_r: Reader, _id: string): SpendRequest | undefined {
  throw new Error(STUB);
}

/** Newest first. */
export function listSpendRequests(_r: Reader, _f: ListFilter = {}): readonly SpendRequest[] {
  throw new Error(STUB);
}

/** requested -> confirmed | refused. A refusal carries at least one reason. */
export function decideSpendRequest(_t: Tx, _id: string, _d: Decision, _actor: Actor): SpendRequest {
  throw new Error(STUB);
}

/** confirmed -> launched, with the jobs the launch made. */
export function markSpendLaunched(_t: Tx, _id: string, _jobIds: readonly string[], _actor: Actor): SpendRequest {
  throw new Error(STUB);
}

/** confirmed -> failed, with why the launch did not happen. */
export function markSpendFailed(_t: Tx, _id: string, _failure: string, _actor: Actor): SpendRequest {
  throw new Error(STUB);
}
