import "server-only";

import { hostname } from "node:os";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { PacketId } from "@gt/domain/ids";
import { drainApplies, type Applier, type ApplyReport } from "@gt/kernel/decision/apply";
import { LEASE_MS } from "@gt/kernel/decision/apply-core";
import type { Effects } from "@gt/kernel/effects";
import { finishClaim, takeClaim } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

import { adapterFor } from "./registry.ts";

// THE APPLIER - the kernel's apply outbox (@gt/kernel/decision/apply) handed
// to the source adapters (./registry.ts), and the two ways it is driven
// (Phase 3 decision 2):
//
//   kick       right after a commit or a return, for THAT packet: started and
//              not awaited, so the operator's commit answers when the kernel
//              holds the decision, not when v1 has finished deleting plates.
//   reconcile  on a Floor or Board render, and from `pipeline/ledger-sync.mts
//              apply`: every due row, bounded. A render takes the store's
//              `decision-apply` claim first (kernel/ingest takeClaim, the
//              Phase 2 sync's discipline, lib/ledger/v1/sync.ts syncSoon), so
//              two Next workers and a CLI never sweep at once and an idle
//              studio never sweeps; the CLI is an operator's explicit act and
//              does not wait on a reader's interval.
//
// Neither needs the claim for SAFETY: each row is claimed by its own
// conditional UPDATE (apply.ts takeApply, holder + lease), so a kick racing a
// reconcile for one row ends with one attempt. The ingest claim only rate-
// limits readers; that is all v1's sync claim ever did.
//
// The applier writes no blob: v1's writers own their bytes. Its Effects port
// therefore refuses a blob loudly instead of carrying a blob store nobody
// uses (a seam with one implementation and no substitution is collapsed - but
// the port is the kernel's, and the refusal is what keeps it honest).

export const APPLY_CLAIM = "decision-apply";
/** How often a reader may start a sweep. Shorter than the first backoff (30 s): a failed row is retried by the next render after it is due. */
export const APPLY_INTERVAL_MS = 15_000;
/** How long a sweep may hold the claim before it counts as dead: two leases, NOT a full drain at
 *  the lease each (RENDER_MAX x LEASE_MS would be 16 min). A sweep slower than this loses the claim
 *  and another reader may sweep beside it - safe, each row is claimed on its own - and the late
 *  close is logged; a crashed reader holds the renders' sweeps off for 4 min, not 16. */
const APPLY_TTL_MS = LEASE_MS * 2;
/** Rows one render's sweep tries (bounded-enumeration: a render must return). */
export const RENDER_MAX = 8;

/** The one Applier: the registry's adapter for the packet's source, and its `apply`. */
export const applier: Applier = async (claim) => {
  const a = adapterFor(claim.packet.source);
  if (!a.ok) return a;
  return a.value.apply(claim);
};

/** The store's transactions and the outside call; no blob store. */
export function applyEffects(store: Store): Effects {
  return {
    tx: (_name, fn) => store.tx(fn),
    blob: () => Promise.resolve(err("refused", "the decision applier writes no blob; v1's writers own their bytes")),
    call: (_name, fn) => fn(),
  };
}

export const holderId = (): string => `${hostname()}/${process.pid}`;

export type DrainOptions = {
  readonly packetId?: PacketId;
  readonly max?: number;
  readonly holder?: string;
  /** Tests substitute an applier that fails once; the app never does. */
  readonly apply?: Applier;
};

/** Deliver due applies now and say what happened. A throw from the store is a Result, never an escape. */
export async function drainNow(store: Store, opts: DrainOptions = {}): Promise<Result<ApplyReport[]>> {
  try {
    const reports = await drainApplies(applyEffects(store), {
      holder: opts.holder ?? holderId(),
      apply: opts.apply ?? applier,
      max: opts.max ?? RENDER_MAX,
      ...(opts.packetId === undefined ? {} : { packetId: opts.packetId }),
    });
    return ok(reports);
  } catch (e) {
    return err("internal", `apply: ${errorMessage(e)}`, { cause: e });
  }
}

const logged = (what: string) => (r: Result<ApplyReport[]>): void => {
  if (!r.ok) console.error(`[decision-apply] ${what}: ${r.error.message}`);
};

/** After a commit or a return: deliver that packet's apply in the background. */
export function kickApply(store: Store, packetId: PacketId, opts: Omit<DrainOptions, "packetId" | "max"> = {}): void {
  void drainNow(store, { ...opts, packetId, max: 1 }).then(logged(`packet ${packetId}`));
}

export type Sweep = { readonly started: true; readonly done: Promise<Result<ApplyReport[]>> } | { readonly started: false; readonly nextAt: string; readonly owner: string };

/**
 * On a render: take the sweep claim if it is free and start a bounded drain
 * WITHOUT awaiting it (the render reads what the store holds now). The claim
 * closes with the drain's report and reopens after APPLY_INTERVAL_MS.
 */
export function reconcileApplies(store: Store, opts: Omit<DrainOptions, "packetId"> = {}): Result<Sweep> {
  const owner = opts.holder ?? holderId();
  const claim = takeClaim(store, APPLY_CLAIM, owner, APPLY_TTL_MS);
  if (!claim.ok) return claim;
  if (!claim.value.won) return ok({ started: false, nextAt: claim.value.nextAt, owner: claim.value.owner });
  const done = drainNow(store, { ...opts, holder: owner }).then((r) => {
    const report = r.ok ? r.value.map((x) => ({ packetId: x.packetId, attempt: x.attempt, result: x.result })) : { error: r.error.message };
    const closed = finishClaim(store, APPLY_CLAIM, owner, APPLY_INTERVAL_MS, report);
    if (!closed.ok) console.error(`[decision-apply] the sweep claim could not be closed: ${closed.error.message}`);
    // finishClaim matched no row: the claim passed its TTL mid-sweep and another reader took it, so
    // two sweeps ran at once (safe - each row is claimed on its own - but the rate limit failed).
    else if (!closed.value) console.error(`[decision-apply] the sweep outlived its claim (${APPLY_TTL_MS / 1000} s); another reader holds ${APPLY_CLAIM} now`);
    logged("sweep")(r);
    return r;
  });
  return ok({ started: true, done });
}
