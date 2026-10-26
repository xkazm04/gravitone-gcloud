import type { Estimate } from "@gt/domain/estimate";

// THE EXTRACT UNIT MACHINE, PURE - which unit of a style-extract run comes next,
// what it is called on the job, what it is estimated to cost, and why a replica's
// critique loop has ended. Moved here from lib/foundry/extract/units.ts (and
// `usableFix` from vocabulary.ts, `unitEstimate` from spend.ts) so the job's plan
// and v1's step machine read ONE rule: lib/foundry/extract/units.ts re-exports
// these with v1's scene count bound, so the CLI, the probes and the job agree on
// the order by construction rather than by a test that compares two copies.
//
// The manifest (`run.json`) stays the artefact store (§5.4); these functions read
// it through a structural VIEW, so v1's mutable `ExtractManifest` is accepted as
// it is and nothing here can write to it.

/** `has_text` is the veto (lib/foundry/extract/helpers.ts `textVetoed`): such a round never wins the recipe. */
export type CriticView = { readonly recipe_fix?: string | undefined; readonly has_text?: boolean | undefined };
export type RoundView = { readonly file: string | null; readonly error: string | null; readonly score: number | null; readonly recipe: string; readonly critique: CriticView | null };
export type ReplicaView = { readonly source: string; readonly rounds: readonly RoundView[] };
export type TransferView = { readonly scene: number; readonly file: string | null; readonly error: string | null };
export type StyleView = { readonly id: string; readonly members: readonly string[]; readonly replicas: readonly ReplicaView[]; readonly transfers: readonly TransferView[] };
export type SourceView = { readonly id: string; readonly readback: object | null; readonly error: string | null };
export type ExtractStatus = "created" | "reading" | "grouping" | "replicating" | "transferring" | "done" | "failed" | "committed";
export type StopView = { readonly by: "run-ceiling" | "period-ceiling"; readonly at: string };

export type ManifestView = {
  readonly id: string;
  readonly status: ExtractStatus;
  readonly options: { readonly rounds: number; readonly replicas: number; readonly transfers: number; readonly target: number; readonly grouping: "engine" | "none" };
  readonly sources: readonly SourceView[];
  readonly styles: readonly StyleView[];
  readonly stopped?: StopView | undefined;
  readonly error?: string | undefined;
  readonly fail_streak?: number | undefined;
};

export type Unit =
  | { readonly kind: "read"; readonly source: string }
  | { readonly kind: "group" }
  | { readonly kind: "replica"; readonly style: string; readonly source: string; readonly round: number }
  | { readonly kind: "transfer"; readonly style: string; readonly scene: number }
  | { readonly kind: "finish" };

export type SettleReason = "round-cap" | "generation-failed" | "target-met" | "no-usable-fix";

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

/**
 * The unit's name ON THE JOB: stable across retries and attempts, so a booked
 * output is never performed twice and an interruption names exactly what was in
 * flight. A replica round is named by its number, and v1's prune (breaker.ts
 * `pruneFailures`) only ever removes a LAST round that drew nothing, so a number
 * once booked is never handed to different pixels.
 */
export const stepName = (u: Unit): string => {
  switch (u.kind) {
    case "read":
      return `read:${u.source}`;
    case "group":
      return "group";
    case "replica":
      return `replica:${u.style}:${u.source}:r${u.round}`;
    case "transfer":
      return `transfer:${u.style}:${u.scene}`;
    case "finish":
      return "finish";
  }
};

/** A fix worth trying: present, long enough to be a recipe, and not the recipe already in force. */
export function usableFix(c: CriticView | null, current: string): string | null {
  const fix = c?.recipe_fix?.trim();
  if (!fix || fix.length < 40) return null;
  if (fix.toLowerCase() === current.trim().toLowerCase()) return null;
  return fix;
}

/** Which sources a style replicates: its readable members in order, capped. */
function replicaSources(m: ManifestView, s: StyleView): string[] {
  return s.members.filter((id) => m.sources.find((x) => x.id === id)?.readback).slice(0, m.options.replicas);
}

/**
 * WHY this replica's loop ended, or null while it is still running. Two of the
 * four are the loop giving up (a refusal is not burned on, a critic with no fix
 * is not asked again); the commit carries the reason onto the exemplar.
 */
export function settleReason(m: ManifestView, rounds: readonly RoundView[]): SettleReason | null {
  const last = rounds[rounds.length - 1];
  if (last === undefined) return null;
  if (rounds.length >= m.options.rounds) return "round-cap";
  if (last.error && !last.file) return "generation-failed"; // do not burn rounds on a refusal
  // A round that drew text has not arrived, whatever it scored: it can never be the recipe in force.
  if (typeof last.score === "number" && last.score >= m.options.target && last.critique?.has_text !== true) return "target-met";
  if (usableFix(last.critique, last.recipe) === null) return "no-usable-fix";
  return null;
}

const settled = (m: ManifestView, rounds: readonly RoundView[]): boolean => settleReason(m, rounds) !== null;

/** The next unit of work, or null when the run is finished. `scenes` is how many transfer scenes exist. */
export function next(m: ManifestView, scenes: number): Unit | null {
  if (m.status === "done" || m.status === "failed" || m.status === "committed") return null;
  for (const s of m.sources) if (!s.readback && !s.error) return { kind: "read", source: s.id };
  if (!m.sources.some((s) => s.readback)) return { kind: "finish" };
  if (m.styles.length === 0) return { kind: "group" };
  for (const st of m.styles) {
    for (const src of replicaSources(m, st)) {
      const rep = st.replicas.find((r) => r.source === src);
      if (rep === undefined || !settled(m, rep.rounds)) return { kind: "replica", style: st.id, source: src, round: (rep?.rounds.length ?? 0) + 1 };
    }
  }
  for (const st of m.styles) {
    for (let k = 0; k < Math.min(m.options.transfers, scenes); k++) {
      if (!st.transfers.some((t) => t.scene === k)) return { kind: "transfer", style: st.id, scene: k };
    }
  }
  return { kind: "finish" };
}

/** Total units, rounds counted at their cap and replicas at the real member count (v1 units.ts). */
export function totalUnits(m: ManifestView, scenes: number): number {
  const reads = m.sources.length;
  const transfers = Math.min(m.options.transfers, scenes);
  if (m.styles.length === 0) return reads + 1 + (m.options.replicas * m.options.rounds + transfers) + 1;
  let work = 0;
  for (const st of m.styles) work += replicaSources(m, st).length * m.options.rounds + transfers;
  return reads + 1 + work + 1;
}

export function doneUnits(m: ManifestView): number {
  let n = m.sources.filter((s) => s.readback || s.error).length;
  if (m.styles.length > 0) n += 1;
  for (const st of m.styles) {
    for (const r of st.replicas) n += settled(m, r.rounds) ? m.options.rounds : r.rounds.length;
    n += st.transfers.length;
  }
  return n;
}

/* ── The estimate a unit is admitted on ───────────────────────────────────── */

export type CallKind = "recognize" | "generate" | "reason";
export type CallEstimates = Readonly<Record<CallKind, number>>;

/** v1 DEFAULT_CALL_ESTIMATE_USD: what an unpriced call is booked at when the IO declares no rate. */
export const DEFAULT_CALL_ESTIMATE_USD: CallEstimates = { recognize: 0.002, generate: 0.04, reason: 0.01 };

/** Micro-dollar rounding (v1 spend.ts `usd6`). */
const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Seconds a unit is expected to take: v1's own bounds, a generate <= 180 s and a recognise <= 120 s (lease.ts). */
const SECONDS: Readonly<Record<CallKind, number>> = { recognize: 20, generate: 40, reason: 30 };

/**
 * What a unit is expected to cost before it starts - the calls it makes (v1
 * spend.ts `unitEstimate`). It is the figure the KERNEL checks the job's ceiling
 * against (job-core `next`), so the ceiling rule is v1's exactly: a unit that
 * would cross the line is not taken.
 */
export function unitEstimate(u: Unit, grouping: "engine" | "none", est: CallEstimates): Estimate {
  switch (u.kind) {
    case "read":
      return { seconds: SECONDS.recognize, usd: est.recognize };
    case "group":
      return grouping === "none" ? { seconds: 0, usd: 0 } : { seconds: SECONDS.reason, usd: est.reason };
    case "replica":
    case "transfer":
      return { seconds: SECONDS.generate + SECONDS.recognize, usd: usd6(est.generate + est.recognize) };
    case "finish":
      return { seconds: 0, usd: 0 };
  }
}
