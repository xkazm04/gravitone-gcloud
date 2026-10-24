// THE DECISION-ADAPTER HARNESS (Phase 3 wave B) - drives one v1 adapter
// through the REAL kernel, the way wave C's Server Actions will: open the
// packet the adapter planned, let the operator patch or pick, preview with the
// adapter's consequence, commit with that token, and take the apply claim the
// outbox hands the adapter. Nothing here is a stand-in for the kernel; only the
// v1 store under it is a temp directory the test seeded.

import type { Result } from "@gt/domain/errors";
import type { PickOutcome } from "@gt/domain/board";
import { applyNext, takeApply, type ApplyClaim, type ApplyReport } from "@gt/kernel/decision/apply";
import { commit } from "@gt/kernel/decision/commit";
import { openPacket, patchMany, pick, type PatchChange } from "@gt/kernel/decision/driver";
import { currentDecisions, head } from "@gt/kernel/decision/read";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import type { DecisionAdapter, OpenPlan, Preview } from "../../lib/decision/v1/types.ts";

export const operator = { by: "operator", surface: "board", who: "op-test" } as const;

export function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

export type Flow<V> = {
  readonly store: Store;
  readonly plan: OpenPlan;
  readonly v1: V;
  /** Patch keys of the open packet as one act (the Board's verdict write). */
  patch(changes: readonly { candidate: string; verdict: "keep" | "reject" | null; reasons?: readonly string[]; note?: string }[]): void;
  pick(pair: string, outcome: PickOutcome): void;
  /** The adapter's consequence over the kernel's current decisions. */
  preview(v1?: V): Result<Preview>;
  /** Preview, then commit with the preview's token; `undecidedAs: "leave"` commits a partial packet with cells undecided. */
  commit(v1?: V, undecidedAs?: "leave"): Result<unknown>;
  /** The outbox row's claim, as the applier would receive it. */
  claim(): ApplyClaim;
  /** One delivery through the kernel's own applier. */
  deliver(): Promise<ApplyReport | undefined>;
};

/** Read v1, open the planned packet in a fresh in-memory kernel. */
export async function openFlow<V>(adapter: DecisionAdapter<V>, runId: string, blobDir: string): Promise<Flow<V>> {
  const v1 = must(await adapter.read({ runId }));
  const plan = must(adapter.packet(v1));
  const k = must(openKernel(":memory:"));
  const store = k.store;
  must(store.tx((t) => openPacket(t, { packet: plan.packet, initial: plan.initial, ...(plan.machinePicks === undefined ? {} : { machinePicks: plan.machinePicks }) }, { by: "agent", surface: "cli" })));
  const id = plan.packet.id;
  const rev = () => must(store.read((r) => head(r, id).rev));
  const decisions = () => must(store.read((r) => currentDecisions(r, id).decisions));
  const preview = (over?: V) => adapter.consequence(over ?? v1, { packetId: id, rev: rev(), decisions: decisions() });
  return {
    store,
    plan,
    v1,
    patch(changes) {
      const cs: PatchChange[] = changes.map((c) => ({ key: `${id}::${c.candidate}`, verdict: c.verdict, ...(c.reasons === undefined ? {} : { reasons: c.reasons }), ...(c.note === undefined ? {} : { note: c.note }) }));
      const baseRev = rev();
      const out = must(store.tx((t) => patchMany(t, { ...operator, packetId: id, baseRev, changes: cs })));
      if (!out.ok) throw new Error(`patch refused: ${out.error.message}`);
    },
    pick(pair, outcome) {
      const baseRev = rev();
      const out = must(store.tx((t) => pick(t, { ...operator, packetId: id, baseRev, pair, outcome })));
      if (!out.ok) throw new Error(`pick refused: ${out.error.message}`);
    },
    preview,
    commit(over, undecidedAs) {
      const p = preview(over);
      if (!p.ok) return p;
      return must(store.tx((t) => commit(t, { ...operator, packetId: id, ticket: "ticket-1", token: p.value.consequence.token, v1Digest: p.value.v1Digest, ...(undecidedAs === undefined ? {} : { undecidedAs }) })));
    },
    claim() {
      const c = must(store.tx((t) => takeApply(t, { holder: "harness", leaseMs: 1 })));
      if (c === undefined) throw new Error("no apply is due");
      return c;
    },
    deliver() {
      return applyNext(liveEffects(store, blobStore(blobDir)), { holder: "harness", apply: (c) => adapter.apply(c) });
    },
  };
}
