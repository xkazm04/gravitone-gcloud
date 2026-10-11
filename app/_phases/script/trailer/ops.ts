// STEP 2 (Script) — THE TRAILER CUT AS AN EDIT LOG, as pure functions.
//
// The cut used to be one mutable snapshot: every beat edit replaced it, there
// was no undo, and taking a newer spine from Step 1 threw every edit away. Here
// the cut is stored as the cut `composeCut` dealt (the ORIGIN) plus an ordered
// log of typed ops, and the snapshot Step 3 reads is DERIVED by replaying the
// applied part of the log. Undo and redo are a move of `head`; a recompose is a
// rebase (compose a new origin, replay what still has somewhere to land); and
// the record finally says what the creator changed versus what the board dealt.
//
// Nothing here renders and nothing here persists. Every op carries its own
// inverse data (`prev`), emitted at the moment the edit is made from the cut it
// was made against — never reconstructed later from a cut that may have moved.

import {
  addPromiseWithId,
  nextPromiseId,
  removePromise,
  withAllowance,
  withBeat,
  withPromisePayer,
  type BeatPatch,
} from "./cut";
import type { Allowance, TrailerBeat, TrailerCut, WithholdingBudget } from "./types";

/* ─────────────────────────────────── ops ──────────────────────────────────── */

interface OpBase {
  /** Edits made inside one focus of one field share a gesture token and
   *  coalesce into a single op. Absent = never coalesces. */
  gesture?: string;
}

export type CutOp =
  | (OpBase & { kind: "patch-beat"; beatId: string; patch: BeatPatch; prev: BeatPatch })
  | (OpBase & { kind: "set-payer"; beatId: string; promiseId: string; payer: string; prev: string })
  | (OpBase & { kind: "add-promise"; beatId: string; promiseId: string; sentence: string })
  | (OpBase & {
      kind: "set-allowance";
      assetId: string;
      allowance: Allowance;
      trade?: string;
      prev: { allowance: Allowance; trade?: string };
    })
  /** INVERSE-ONLY. The undo of `add-promise`; no updater emits it into a log. */
  | (OpBase & { kind: "remove-promise"; beatId: string; promiseId: string; sentence: string });

/** The op that undoes `op` — swap what it set with what it replaced. */
export function inverseOf(op: CutOp): CutOp {
  switch (op.kind) {
    case "patch-beat":
      return { kind: "patch-beat", beatId: op.beatId, patch: op.prev, prev: op.patch };
    case "set-payer":
      return { kind: "set-payer", beatId: op.beatId, promiseId: op.promiseId, payer: op.prev, prev: op.payer };
    case "add-promise":
      return { kind: "remove-promise", beatId: op.beatId, promiseId: op.promiseId, sentence: op.sentence };
    case "remove-promise":
      return { kind: "add-promise", beatId: op.beatId, promiseId: op.promiseId, sentence: op.sentence };
    case "set-allowance":
      return {
        kind: "set-allowance",
        assetId: op.assetId,
        allowance: op.prev.allowance,
        trade: op.prev.trade,
        prev: { allowance: op.allowance, trade: op.trade },
      };
  }
}

/** Does this op touch a beat (as opposed to the withholding budget)? */
function beatIdOf(op: CutOp): string | null {
  return op.kind === "set-allowance" ? null : op.beatId;
}

/* ───────────────────────────────── replay ─────────────────────────────────── */

export interface Replayed {
  cut: TrailerCut;
  budget: WithholdingBudget | null;
  /** Ops that had nowhere to land — their beat, promise or asset is gone.
   *  Reported, never dropped silently. */
  skipped: CutOp[];
}

function applyOp(cut: TrailerCut, budget: WithholdingBudget | null, op: CutOp): { cut: TrailerCut; budget: WithholdingBudget | null; ok: boolean } {
  if (op.kind === "set-allowance") {
    if (!budget || !budget.assets.some((a) => a.id === op.assetId)) return { cut, budget, ok: false };
    return { cut, budget: withAllowance(budget, op.assetId, op.allowance, op.trade), ok: true };
  }
  const beat = cut.beats.find((b) => b.id === op.beatId);
  if (!beat) return { cut, budget, ok: false };
  switch (op.kind) {
    case "patch-beat":
      return { cut: withBeat(cut, op.beatId, op.patch), budget, ok: true };
    case "set-payer":
      if (!(beat.promises ?? []).some((p) => p.id === op.promiseId)) return { cut, budget, ok: false };
      return { cut: withPromisePayer(cut, op.beatId, op.promiseId, op.payer), budget, ok: true };
    case "add-promise":
      return { cut: addPromiseWithId(cut, op.beatId, op.promiseId, op.sentence), budget, ok: true };
    case "remove-promise":
      return { cut: removePromise(cut, op.beatId, op.promiseId), budget, ok: true };
  }
}

/** Fold `ops` over `origin`. `replay(origin, [])` is `origin` itself. */
export function replay(origin: TrailerCut, ops: readonly CutOp[], originBudget: WithholdingBudget | null = null): Replayed {
  let cut = origin;
  let budget = originBudget;
  const skipped: CutOp[] = [];
  for (const op of ops) {
    const r = applyOp(cut, budget, op);
    if (!r.ok) skipped.push(op);
    cut = r.cut;
    budget = r.budget;
  }
  return { cut, budget, skipped };
}

/* ─────────────────────────────────── the log ──────────────────────────────── */

export interface CutLog {
  /** The cut `composeCut` dealt. */
  origin: TrailerCut;
  /** The withholding budget the origin was dealt with. */
  originBudget: WithholdingBudget;
  /** Every op, including the redo tail beyond `head`. */
  ops: CutOp[];
  /** How many of `ops` are applied. */
  head: number;
}

export function newLog(origin: TrailerCut, originBudget: WithholdingBudget): CutLog {
  return { origin, originBudget, ops: [], head: 0 };
}

/** Read a persisted record. A legacy record (a `cut`, no `origin`/`ops`) is its
 *  own origin with an empty log — no data loss. */
export function logFromRecord(rec: {
  cut: TrailerCut;
  budget: WithholdingBudget;
  origin?: TrailerCut;
  originBudget?: WithholdingBudget;
  ops?: CutOp[];
  head?: number;
}): CutLog {
  if (!rec.origin || !Array.isArray(rec.ops)) return newLog(rec.cut, rec.budget);
  const head = typeof rec.head === "number" ? Math.max(0, Math.min(rec.head, rec.ops.length)) : rec.ops.length;
  return { origin: rec.origin, originBudget: rec.originBudget ?? rec.budget, ops: rec.ops, head };
}

export function applied(log: CutLog): CutOp[] {
  return log.ops.slice(0, log.head);
}

/** The snapshot — the origin with every applied op replayed over it. */
export function derive(log: CutLog): { cut: TrailerCut; budget: WithholdingBudget } {
  const r = replay(log.origin, applied(log), log.originBudget);
  return { cut: r.cut, budget: r.budget ?? log.originBudget };
}

export const canUndo = (log: CutLog) => log.head > 0;
export const canRedo = (log: CutLog) => log.head < log.ops.length;
export const undo = (log: CutLog): CutLog => (canUndo(log) ? { ...log, head: log.head - 1 } : log);
export const redo = (log: CutLog): CutLog => (canRedo(log) ? { ...log, head: log.head + 1 } : log);

/** Has the creator changed this beat from the dealt one? */
export function edited(log: CutLog, beatId: string): boolean {
  return applied(log).some((op) => beatIdOf(op) === beatId);
}

/** Reset a beat to what was dealt: remove ITS ops (applied and redo tail alike). */
export function resetBeat(log: CutLog, beatId: string): CutLog {
  const keep: CutOp[] = [];
  let head = 0;
  log.ops.forEach((op, i) => {
    if (beatIdOf(op) === beatId) return;
    keep.push(op);
    if (i < log.head) head++;
  });
  return keep.length === log.ops.length ? log : { ...log, ops: keep, head };
}

/* ────────────────────────────── emitting edits ────────────────────────────── */

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function push(log: CutLog, op: CutOp): CutLog {
  // A new edit after an undo truncates the redo tail.
  const ops = [...log.ops.slice(0, log.head), op];
  return { ...log, ops, head: ops.length };
}

/** Edit a beat. Returns the SAME log when the patch changes nothing. */
export function editBeat(log: CutLog, beatId: string, patch: BeatPatch, gesture?: string): CutLog {
  const { cut } = derive(log);
  const beat = cut.beats.find((b) => b.id === beatId);
  if (!beat) return log;
  const keys = (Object.keys(patch) as (keyof BeatPatch)[]).filter((k) => !same(patch[k], beat[k]));
  if (keys.length === 0) return log;
  const real: BeatPatch = {};
  const prev: BeatPatch = {};
  for (const k of keys) {
    (real as Record<string, unknown>)[k] = patch[k];
    (prev as Record<string, unknown>)[k] = beat[k as keyof TrailerBeat];
  }

  const top = log.ops[log.head - 1];
  if (gesture && top && top.kind === "patch-beat" && top.beatId === beatId && top.gesture === gesture) {
    // One gesture, one op: the earliest `prev` and the latest `patch` per field.
    const merged: CutOp = {
      ...top,
      patch: { ...top.patch, ...real },
      prev: { ...prev, ...top.prev },
    };
    const m = merged as Extract<CutOp, { kind: "patch-beat" }>;
    // Typed back to where it started: the gesture changed nothing, so it leaves no op.
    const nothing = (Object.keys(m.patch) as (keyof BeatPatch)[]).every((k) => same(m.patch[k], m.prev[k]));
    const ops = log.ops.slice(0, log.head - 1);
    if (!nothing) ops.push(merged);
    return { ...log, ops, head: ops.length };
  }
  return push(log, { kind: "patch-beat", beatId, patch: real, prev, ...(gesture ? { gesture } : {}) });
}

export function editPayer(log: CutLog, beatId: string, promiseId: string, payer: string): CutLog {
  const { cut } = derive(log);
  const promise = cut.beats.find((b) => b.id === beatId)?.promises?.find((p) => p.id === promiseId);
  if (!promise) return log;
  const next = payer.trim();
  const prev = promise.payer ?? "";
  if (next === prev) return log;
  return push(log, { kind: "set-payer", beatId, promiseId, payer: next, prev });
}

export function editAddPromise(log: CutLog, beatId: string, sentence: string): CutLog {
  const s = sentence.trim();
  const beat = derive(log).cut.beats.find((b) => b.id === beatId);
  if (!s || !beat) return log;
  return push(log, { kind: "add-promise", beatId, promiseId: nextPromiseId(beat), sentence: s });
}

export function editAllowance(log: CutLog, assetId: string, allowance: Allowance, trade?: string): CutLog {
  const { budget } = derive(log);
  const asset = budget.assets.find((a) => a.id === assetId);
  if (!asset) return log;
  const after = withAllowance(budget, assetId, allowance, trade).assets.find((a) => a.id === assetId)!;
  if (after.allowance === asset.allowance && after.trade === asset.trade) return log;
  return push(log, {
    kind: "set-allowance",
    assetId,
    allowance: after.allowance,
    ...(after.trade ? { trade: after.trade } : {}),
    prev: { allowance: asset.allowance, ...(asset.trade ? { trade: asset.trade } : {}) },
  });
}

/* ───────────────────────────────── rebase ─────────────────────────────────── */

/** Take a newly composed origin and replay the creator's beat edits over it.
 *  Edits whose beat is not in the new cut come back as `skipped`. The budget is
 *  the campaign's and is kept as it stands now, so allowance ops are baked into
 *  the new origin budget rather than carried; the redo tail is dropped. */
export function rebase(log: CutLog, newOrigin: TrailerCut): { log: CutLog; skipped: CutOp[] } {
  const { budget } = derive(log);
  const beatOps = applied(log).filter((op) => op.kind !== "set-allowance");
  const r = replay(newOrigin, beatOps);
  const dropped = new Set(r.skipped);
  const ops = beatOps.filter((op) => !dropped.has(op));
  return { log: { origin: newOrigin, originBudget: budget, ops, head: ops.length }, skipped: r.skipped };
}
