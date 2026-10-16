import type { Actor } from "@gt/domain/event";
import type { Result } from "@gt/domain/errors";
import type { PacketFact } from "@gt/domain/plan";
import type { ReadContext } from "../records/read.ts";
import { releaseHeldIn } from "../records/write.ts";
import type { Reader, Store } from "../store.ts";

// A GATE PART'S FACT - its Board packet (COMMON decision 10). A gate is not a job: the part is
// ratified when its packet commits, and failed when its review is sent back. The records module
// derives part state from `ReadContext.packetOf` and has, until now, been handed nothing
// ("no packet yet", records/read.ts); this is the reader that answers it from the decision
// tables, so every caller of the plan - the Plan view, `releaseHeld` - reads the same fact.
//
// One packet per gate part, named by the part: `pkt:step:<gatePartId>` (the Phase 3 id rule,
// `pkt:<source>:<ref>`, with the part as the ref). v1 had a per-step `signedOff[phase]`
// timestamp any surface could write (lib/projects.ts signOff), guarded only by "not empty, not
// blocked"; here the only way to ratify is a committed packet.

export const stepPacketId = (gatePartId: string): string => `pkt:step:${gatePartId}`;

/** The packet's state as the plan reads it; undefined while no packet is open for the gate. */
export function gatePacketFact(r: Reader, gatePartId: string): PacketFact | undefined {
  const row = r.get("SELECT state FROM packets WHERE id = ?", stepPacketId(gatePartId));
  if (row === undefined) return undefined;
  const state = row["state"];
  return state === "committed" ? "committed" : state === "returned" ? "rejected" : "open";
}

/** The read context with the gate facts wired, for a reader inside `r`'s snapshot. */
export function gateContext(r: Reader, now: number): ReadContext {
  return { now, packetOf: (partId) => gatePacketFact(r, partId) };
}

/**
 * Release what a gate held: inside ONE transaction, read the gates' packets and move every
 * planned job whose upstream is now ratified to queued (records/write.ts `releaseHeldIn`). Called
 * by the step packet's apply after its commit; idempotent (a released job is no longer planned).
 */
export function releaseAfterGate(store: Store, projectId: string, actor: Actor, now: number): Result<string[]> {
  return store.tx((t) => releaseHeldIn(t, projectId, actor, gateContext(t, now)));
}
