// THE UNITS — what the next unit of work is, how many there are, and why a
// replica's loop has ended. Pure over the manifest; nothing here performs a unit.
//
// Its own file because the scheduler (next) and the progress strip (totalUnits,
// doneUnits) are read without performing anything, and `next` is the order a
// test pins. perform.ts is the only place a unit is carried out.

import { TRANSFER_SCENES } from "./prompts";
import type { ExtractManifest, ExtractedStyle, ReplicaRound, SettleReason } from "./types";
import { usableFix } from "./vocabulary";

/* ── Units ────────────────────────────────────────────────────────────────── */

export type Unit =
  | { kind: "read"; source: string }
  | { kind: "group" }
  | { kind: "replica"; style: string; source: string; round: number }
  | { kind: "transfer"; style: string; scene: number }
  | { kind: "finish" };

export const unitLabel = (u: Unit): string => {
  switch (u.kind) {
    case "read":
      return `read ${u.source}`;
    case "group":
      return "group into styles";
    case "replica":
      return `replicate ${u.style} on ${u.source}, round ${u.round}`;
    case "transfer":
      return `transfer ${u.style} onto scene ${u.scene + 1}`;
    case "finish":
      return "finish";
  }
};

/** Which sources a style replicates: its members in order, capped. */
function replicaSources(m: ExtractManifest, s: ExtractedStyle): string[] {
  return s.members.filter((id) => m.sources.find((x) => x.id === id)?.readback).slice(0, m.options.replicas);
}

/** WHY this replica's loop ended, or null while it is still running.
 *
 *  Same order and same conditions `replicaSettled` has always used — this
 *  function only stops throwing the reason away. A settled replica is settled
 *  for one of four reasons and two of them are the loop giving up; nothing
 *  downstream could tell them apart while this returned a boolean. */
export function settleReason(m: ExtractManifest, rounds: ReplicaRound[]): SettleReason | null {
  if (!rounds.length) return null;
  if (rounds.length >= m.options.rounds) return "round-cap";
  const last = rounds[rounds.length - 1];
  if (last.error && !last.file) return "generation-failed"; // do not burn rounds on a refusal
  if (typeof last.score === "number" && last.score >= m.options.target) return "target-met";
  if (!usableFix(last.critique, last.recipe)) return "no-usable-fix";
  return null;
}

/** Has this replica's loop ended? Either the round cap was reached, the
 *  target was met, or the last round produced no usable fix to try.
 *
 *  Deliberately unchanged in behaviour: the scheduler and the progress strip
 *  both want "will more work happen here", and for that question an abandoned
 *  replica is as finished as a successful one. */
function replicaSettled(m: ExtractManifest, rounds: ReplicaRound[]): boolean {
  return settleReason(m, rounds) !== null;
}

/** The next unit of work, or null when the run is finished. Pure over the
 *  manifest — this is the order a test pins. */
export function next(m: ExtractManifest): Unit | null {
  if (m.status === "done" || m.status === "failed" || m.status === "committed") return null;

  for (const s of m.sources) if (!s.readback && !s.error) return { kind: "read", source: s.id };
  if (!m.sources.some((s) => s.readback)) return { kind: "finish" }; // nothing readable: finish as failed
  if (!m.styles.length) return { kind: "group" };

  for (const st of m.styles) {
    for (const src of replicaSources(m, st)) {
      const rep = st.replicas.find((r) => r.source === src);
      if (!rep || !replicaSettled(m, rep.rounds)) return { kind: "replica", style: st.id, source: src, round: (rep?.rounds.length ?? 0) + 1 };
    }
  }
  for (const st of m.styles) {
    for (let k = 0; k < Math.min(m.options.transfers, TRANSFER_SCENES.length); k++) {
      if (!st.transfers.some((t) => t.scene === k)) return { kind: "transfer", style: st.id, scene: k };
    }
  }
  return { kind: "finish" };
}

/** Total units the run will take, for the progress strip. Replica ROUNDS are
 *  counted at their cap — a loop that meets the target early takes fewer, and
 *  `doneUnits` credits the cap for a settled replica, so the strip may finish
 *  early and never late.
 *
 *  REPLICAS THEMSELVES ARE COUNTED AT THE REAL NUMBER, not at the cap, and that
 *  is the half this used to get wrong. `options.replicas` is a CEILING on how
 *  many members a style replicates; a style with one member replicates once
 *  however high the ceiling is (`replicaSources`). Multiplying by the ceiling
 *  charged the strip for rounds nothing would ever take, so `done` could not
 *  reach `total` — measured on the probe's own fixture, the run stalled at 12 of
 *  15 and then jumped to 15 of 15 when `finish` set them equal. Under-reporting
 *  and then snapping is the specific dishonesty a progress strip must not have:
 *  it reads as a stall on the longest, most expensive stage.
 *
 *  Before grouping there is no member list to count, so the ceiling IS the only
 *  honest estimate and one style is the floor — that branch is unchanged. */
export function totalUnits(m: ExtractManifest): number {
  const reads = m.sources.length;
  const transfers = Math.min(m.options.transfers, TRANSFER_SCENES.length);
  if (!m.styles.length) return reads + 1 + (m.options.replicas * m.options.rounds + transfers) + 1;
  let work = 0;
  for (const st of m.styles) work += replicaSources(m, st).length * m.options.rounds + transfers;
  return reads + 1 + work + 1;
}

export function doneUnits(m: ExtractManifest): number {
  let n = m.sources.filter((s) => s.readback || s.error).length;
  if (m.styles.length) n += 1;
  for (const st of m.styles) {
    for (const r of st.replicas) n += replicaSettled(m, r.rounds) ? m.options.rounds : r.rounds.length;
    n += st.transfers.length;
  }
  return n;
}
