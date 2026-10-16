import type { Actor } from "@gt/domain/event";
import type { Result } from "@gt/domain/errors";
import type { PacketFact } from "@gt/domain/plan";
import { committedResult } from "../decision/commit.ts";
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

/**
 * The gate's NEWEST attempt - `pkt:step:<gate>`, then `#2`, `#3` (lib/parts/gates.ts opens a new
 * packet per attempt: a commit and a return are final) - as the plan reads it; undefined while no
 * packet is open. A committed CULL ratifies only when every row (a candidate without a row is its
 * own row) kept exactly one candidate: a rejected plate owes a re-render, so that attempt failed.
 */
export function gatePacketFact(r: Reader, gatePartId: string): PacketFact | undefined {
  const base = stepPacketId(gatePartId);
  let best: { id: string; n: number; state: string; mode: string } | undefined;
  for (const row of r.all("SELECT id, state, mode FROM packets WHERE id = ? OR substr(id, 1, ?) = ?", base, base.length + 1, `${base}#`)) {
    const id = String(row["id"]);
    const n = id === base ? 1 : Number(id.slice(base.length + 1));
    if (Number.isInteger(n) && (best === undefined || n > best.n)) best = { id, n, state: String(row["state"]), mode: String(row["mode"]) };
  }
  if (best === undefined) return undefined;
  if (best.state === "returned") return "rejected";
  if (best.state !== "committed") return "open";
  return best.mode !== "matrix-cull" || cullRatifies(r, best.id) ? "committed" : "rejected";
}

function cullRatifies(r: Reader, packetId: string): boolean {
  const res = committedResult(r, packetId);
  if (res === undefined || !res.ok) return false;
  const kept = new Set<string>(res.value.kept);
  const rows = new Map<string, number>();
  for (const it of r.all("SELECT candidate_id, row FROM packet_items WHERE packet_id = ?", packetId)) {
    const id = String(it["candidate_id"]);
    const row = it["row"] === null || it["row"] === undefined ? `#${id}` : String(it["row"]);
    rows.set(row, (rows.get(row) ?? 0) + (kept.has(id) ? 1 : 0));
  }
  return rows.size > 0 && [...rows.values()].every((n) => n === 1);
}

/**
 * The read context with the gate facts wired. The lookup reads through the reader the plan is
 * being read with, so a context can be built once, outside any transaction, and handed to every
 * plan read (the produce port does): before, a caller without a reader in hand built `{ now }`
 * alone and every committed gate read "at the Weir" on the Plan.
 */
export function gateFacts(now: number): ReadContext {
  return { now, packetOf: (partId, r) => gatePacketFact(r, partId) };
}

/** `gateFacts` for a caller already inside a snapshot; the reader comes with each lookup. */
export function gateContext(_r: Reader, now: number): ReadContext {
  return gateFacts(now);
}

/**
 * Release what a gate held: inside ONE transaction, read the gates' packets and move every
 * planned job whose upstream is now ratified to queued (records/write.ts `releaseHeldIn`). Called
 * by the step packet's apply after its commit; idempotent (a released job is no longer planned).
 */
export function releaseAfterGate(store: Store, projectId: string, actor: Actor, now: number): Result<string[]> {
  return store.tx((t) => releaseHeldIn(t, projectId, actor, gateContext(t, now)));
}
