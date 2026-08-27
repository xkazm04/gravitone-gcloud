// STEP 2 (Script) — THE TRAILER CUT, as pure functions.
//
// Nothing here renders and nothing here persists. `composeCut` turns the spine
// Step 1 confirmed (one picked variant per slot) into the `TrailerCut` that
// `./structure.ts` reads; the `with*` updaters are the only way the surface
// changes a cut, and each returns a NEW object so a `useMemo` over the cut
// re-runs the checker exactly when something changed. The picks are never
// written back — once composed, the cut is the creator's and the board's
// picks are its history.

import type { BeatSlot } from "../../research/beats/beats";

import {
  SPINE_RANK,
  type Allowance,
  type Connector,
  type Cue,
  type Movement,
  type MovementRole,
  type PromiseClaim,
  type RaisedVariable,
  type TrailerBeat,
  type TrailerCut,
  type WithholdingBudget,
} from "./types";

/* ─────────────────────────────── composing ────────────────────────────────── */

/** Spine order first, then the slot's own ordinal — so a second escalation
 *  movement (the fixture's reset part) keeps its place before the climax and
 *  a tail never drifts ahead of a cold open, whatever order the slots arrive in. */
function spineSort(a: Movement, b: Movement): number {
  // SPINE_RANK, not SPINE_ORDER.indexOf: a role the order list does not carry
  // came back as -1, which sorts it AHEAD of the cold open rather than reading
  // as unknown. The rank is a Record over the role union, so the compiler will
  // not let a role go unranked in the first place. See types.ts.
  const ra = SPINE_RANK[a.role];
  const rb = SPINE_RANK[b.role];
  return ra !== rb ? ra - rb : a.ordinal - b.ordinal;
}

export function composeCut(opts: {
  projectId: string;
  title: string;
  picks: Record<string, string>;
  slots: BeatSlot[];
  cue: Cue;
}): TrailerCut {
  const chosen = opts.slots
    .map((slot) => {
      const variant = slot.variants.find((v) => v.id === opts.picks[slot.id]);
      return variant ? { movement: slot.movement, beat: variant.beat } : null;
    })
    .filter((x): x is { movement: Movement; beat: TrailerBeat } => x !== null)
    .sort((a, b) => spineSort(a.movement, b.movement));

  return {
    form: "trailer",
    id: `cut-${opts.projectId}`,
    title: opts.title,
    rung: "long-cut",
    lane: "wide-release",
    cue: opts.cue,
    movements: chosen.map((c) => ({ ...c.movement })),
    // Movement ids preserved: the beat carries the id of the movement whose
    // slot offered it, which is what `checkGraph` resolves against.
    beats: chosen.map((c) => ({ ...c.beat, movement: c.movement.id })),
  };
}

/* ─────────────────────────────── updating ─────────────────────────────────── */

export type BeatPatch = Partial<
  Pick<TrailerBeat, "label" | "text" | "connector" | "raises" | "promises" | "spends">
>;

function mapBeat(cut: TrailerCut, beatId: string, fn: (b: TrailerBeat) => TrailerBeat): TrailerCut {
  if (!cut.beats.some((b) => b.id === beatId)) return cut;
  return { ...cut, beats: cut.beats.map((b) => (b.id === beatId ? fn(b) : b)) };
}

export function withBeat(cut: TrailerCut, beatId: string, patch: BeatPatch): TrailerCut {
  return mapBeat(cut, beatId, (b) => ({ ...b, ...patch }));
}

/** An empty payer is stored as ABSENT, not as "" — `checkPromises` reads
 *  `!p.payer`, and an empty string that survived as a field would still count
 *  as unnamed while looking, in the record, like an answer. */
export function withPromisePayer(
  cut: TrailerCut,
  beatId: string,
  promiseId: string,
  payer: string,
): TrailerCut {
  const trimmed = payer.trim();
  return mapBeat(cut, beatId, (b) => ({
    ...b,
    promises: (b.promises ?? []).map((p) => {
      if (p.id !== promiseId) return p;
      const next: PromiseClaim = { ...p };
      if (trimmed) next.payer = trimmed;
      else delete next.payer;
      return next;
    }),
  }));
}

/** A promise added by the creator is a `claim` — a sentence the cut makes,
 *  as opposed to one the register or the assembly makes for it. Its id is
 *  derived from the beat and a counter, so two adds in one session never
 *  collide and the id survives a reload. */
export function addPromise(cut: TrailerCut, beatId: string, sentence: string): TrailerCut {
  const s = sentence.trim();
  if (!s) return cut;
  return mapBeat(cut, beatId, (b) => {
    const existing = b.promises ?? [];
    const taken = new Set(existing.map((p) => p.id));
    let n = existing.length + 1;
    while (taken.has(`${b.id}-p${n}`)) n++;
    return { ...b, promises: [...existing, { id: `${b.id}-p${n}`, sentence: s, source: "claim" }] };
  });
}

/** Flipping an allowance keeps the trade sentence only while it still means
 *  something: a trade recorded for a spend is dropped when the asset goes
 *  back to hold or imply, so a later re-spend has to be argued again rather
 *  than inheriting an old reason. */
export function withAllowance(
  budget: WithholdingBudget,
  assetId: string,
  allowance: Allowance,
  trade?: string,
): WithholdingBudget {
  return {
    ...budget,
    assets: budget.assets.map((a) => {
      if (a.id !== assetId) return a;
      const next = { ...a, allowance };
      const t = (trade ?? (allowance === "spend" ? a.trade : undefined))?.trim();
      if (allowance === "spend" && t) next.trade = t;
      else delete next.trade;
      return next;
    }),
  };
}

/** The raised variable a rung declares, when it declares exactly one. Used by
 *  the surface to warn a rung that repeats its predecessor; the checker makes
 *  the same reading in `checkEscalation`. */
export function singleRaise(b: TrailerBeat | undefined): RaisedVariable | null {
  return b?.raises?.length === 1 ? b.raises[0] : null;
}

export const CONNECTOR_OPTIONS: readonly Exclude<Connector, null>[] = ["BUT", "THEREFORE", "AND THEN"] as const;

/* ─────────────────────────────── the curve ────────────────────────────────── */

export interface EnergyPoint {
  beatId: string;
  /** 0..1 across the cut, one step per beat. */
  x: number;
  /** 0..1, higher is louder. */
  y: number;
  movement: string;
}

/**
 * THE ENERGY CURVE IS A SHAPE DERIVED FROM STRUCTURE, NOT A MEASUREMENT.
 *
 * Nothing in this repo measures loudness, cut rate or magnitude — `checkMagnitude`
 * reports unmeasured without a shot-layer seam, and this function has no more
 * data than it does. What it draws is the shape the doctrine PRESCRIBES for the
 * roles the cut declares: a cold open at mid energy, an introduction low, each
 * escalation movement a step higher than the last, a reset beat dipping under
 * the introduction, the climax at the peak, and a tail falling away. It exists
 * so the author can see whether the dip is THERE as a shape (PATTERNS.md § 9.6),
 * not whether it is loud enough — a curve that read as a measurement would be
 * the green-verdict lie in a picture.
 */
export function energyPoints(cut: TrailerCut): EnergyPoint[] {
  const roleOf = new Map<string, MovementRole>(cut.movements.map((m) => [m.id, m.role]));
  // Escalation movements in cut order, so the ordinal is "which rung", not the
  // movement's own ordinal (which counts every part).
  const escalations = cut.movements.filter((m) => m.role === "escalation").map((m) => m.id);
  const steps = Math.max(escalations.length, 1);

  const n = cut.beats.length;
  return cut.beats.map((b, i) => {
    const role = roleOf.get(b.movement);
    let y: number;
    if (b.kind === "reset") y = 0.18;
    else if (role === "cold-open") y = 0.5;
    else if (role === "introduction") y = 0.3;
    else if (role === "escalation") {
      const k = escalations.indexOf(b.movement);
      y = 0.4 + (0.45 * (Math.max(k, 0) + 1)) / (steps + 1);
    } else if (role === "climax") y = 1;
    else if (role === "tail") y = 0.35;
    else y = 0.5;
    return {
      beatId: b.id,
      x: n <= 1 ? 0.5 : i / (n - 1),
      y,
      movement: b.movement,
    };
  });
}
