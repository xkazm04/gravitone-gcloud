// THE DOJO'S BLIND GATE — pure, shared by the disk layer and the gate surface.
// Nothing here imports Node.
//
// The gate used to show every pair labelled baseline/challenger with the
// chokepoint's pick stamped on it, then ask for the claim. The only judge that
// counted was anchored by the judge under evaluation, and judge-vs-human
// agreement could not be measured per pair. The blind phase fixes the order:
// the human picks A / B / tie per pair with no arm names and no judge chrome,
// THEN the judges are unmasked and agreement is computed, THEN the claim.
//
// Storage: cycle verdicts.json keeps its shape (one string per improvement — the
// verdict kernel, the Board and the cycle list all read that map). The blind
// picks live beside it in blind.json, written under the same run lock.

import type { Improvement, MediaRef, PairResult, TrainingVerdict } from "./types";

/** Fewer judged pairs than this cannot support a verdict about a judge, so the
 *  ledger row reads `unmeasurable` unless the human overrides it explicitly. */
export const BLIND_FLOOR = 4;

export type BlindPick = "A" | "B" | "tie";
export type Arm = "baseline" | "challenger";

export interface ImprovementBlind {
  /** pairId -> the human's blind pick. */
  picks: Record<string, BlindPick>;
  /** "Skip blind": the claim was decided with the judges in view. */
  anchored?: boolean;
  /** Explicit permission to record a verdict from fewer than BLIND_FLOOR pairs. */
  floorOverride?: boolean;
}

export interface BlindState {
  version: 1;
  /** `${improvementId}/${pairId}` -> which arm sits in slot A. Seeded from the
   *  cycle id + "human", never from the judge's pick or its A/B order. */
  map: Record<string, Arm>;
  improvements: Record<string, ImprovementBlind>;
}

/** One edit to the blind sidecar. `pick: null` clears a pair. */
export interface BlindEdit {
  imp: string;
  pair?: string;
  pick?: BlindPick | null;
  anchored?: boolean;
  floorOverride?: boolean;
}

export const blindKey = (impId: string, pairId: string) => `${impId}/${pairId}`;

/** FNV-1a, 32 bit — a stable, dependency-free seed hash. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Which arm the human sees as A for one pair. Deterministic in (cycle, improvement, pair). */
export function armInSlotA(cycleId: string, impId: string, pairId: string): Arm {
  // Mix before taking the low bit: FNV's last multiply leaves the low bit a
  // plain function of the last byte, which would pair up neighbouring ids.
  let h = fnv1a(`${cycleId}\u0000human\u0000${impId}\u0000${pairId}`);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h & 1) === 0 ? "baseline" : "challenger";
}

export function buildBlindMap(cycleId: string, improvements: Improvement[]): Record<string, Arm> {
  const map: Record<string, Arm> = {};
  for (const imp of improvements) for (const p of imp.pairs ?? []) map[blindKey(imp.id, p.id)] = armInSlotA(cycleId, imp.id, p.id);
  return map;
}

export const emptyBlind = (): BlindState => ({ version: 1, map: {}, improvements: {} });

/** The stored state with any missing map entry filled in from the seed. A
 *  stored entry wins, so a map persisted at first open never moves. */
export function withBlindMap(cycleId: string, improvements: Improvement[], stored?: Partial<BlindState> | null): BlindState {
  return {
    version: 1,
    map: { ...buildBlindMap(cycleId, improvements), ...(stored?.map ?? {}) },
    improvements: stored?.improvements ?? {},
  };
}

/** What the blind phase may render for one pair: two anonymous images. Arm
 *  names, the judge's pick and its reason are not on this object at all. */
export interface BlindPairView {
  id: string;
  scene: string;
  a: MediaRef;
  b: MediaRef;
}

export function blindPairView(pair: PairResult, slotA: Arm): BlindPairView {
  const other: Arm = slotA === "baseline" ? "challenger" : "baseline";
  return { id: pair.id, scene: pair.scene, a: pair[slotA], b: pair[other] };
}

/** A blind pick, resolved to the arm it chose. */
export function pickToArm(pick: BlindPick, slotA: Arm): Arm | "tie" {
  if (pick === "tie") return "tie";
  if (pick === "A") return slotA;
  return slotA === "baseline" ? "challenger" : "baseline";
}

export interface BlindMeasure {
  /** Pairs the human picked blind. */
  pairs_n: number;
  /** Pairs the improvement has at all, picked or not. Zero means nothing was compared. */
  pairs_total: number;
  /** Fraction of picked pairs where the human chose the challenger. */
  human_pick_rate: number;
  chokepoint_vs_human: number;
  /** Absent when Gemini judged none of the picked pairs. */
  gemini_vs_human?: number;
}

/** Judge-vs-human agreement over the pairs the human has picked. */
export function measureBlind(imp: Improvement, entry: ImprovementBlind | undefined, map: Record<string, Arm>): BlindMeasure {
  let n = 0;
  let challenger = 0;
  let chokeAgree = 0;
  let gemJudged = 0;
  let gemAgree = 0;
  for (const pair of imp.pairs ?? []) {
    const pick = entry?.picks[pair.id];
    if (!pick) continue;
    const arm = pickToArm(pick, map[blindKey(imp.id, pair.id)] ?? armInSlotA("", imp.id, pair.id));
    n++;
    if (arm === "challenger") challenger++;
    if (arm === pair.judge_pick) chokeAgree++;
    if (pair.gemini_pick !== undefined) {
      gemJudged++;
      if (arm === pair.gemini_pick) gemAgree++;
    }
  }
  return {
    pairs_n: n,
    pairs_total: (imp.pairs ?? []).length,
    human_pick_rate: n ? challenger / n : 0,
    chokepoint_vs_human: n ? chokeAgree / n : 0,
    ...(gemJudged ? { gemini_vs_human: gemAgree / gemJudged } : {}),
  };
}

export function pickedCount(imp: Improvement, entry: ImprovementBlind | undefined): number {
  return (imp.pairs ?? []).filter((p) => entry?.picks[p.id] !== undefined).length;
}

/** Every pair has a blind pick. An improvement with no pairs has nothing to pick. */
export function blindComplete(imp: Improvement, entry: ImprovementBlind | undefined): boolean {
  return pickedCount(imp, entry) === (imp.pairs ?? []).length;
}

/** The claim verdict may be saved: all pairs picked blind, or explicitly anchored. */
export function claimAllowed(imp: Improvement, entry: ImprovementBlind | undefined): boolean {
  return Boolean(entry?.anchored) || blindComplete(imp, entry);
}

/** The ledger row's verdict. A comparison over zero pairs measured nothing, so
 *  it is `unmeasurable` whatever the human said: an improvement with no pairs
 *  (anchored or not), and a blind row with no picks, which no floor override
 *  lifts - the override permits a SMALL sample, never an empty one. A blind row
 *  under the floor is `unmeasurable` unless overridden; an anchored row with
 *  pairs keeps the human's word. */
export function ledgerVerdict(human: TrainingVerdict, measure: BlindMeasure, entry: ImprovementBlind | undefined, floor = BLIND_FLOOR): "better" | "not-better" | "unmeasurable" {
  if (measure.pairs_total === 0) return "unmeasurable";
  if (!entry?.anchored) {
    if (measure.pairs_n === 0) return "unmeasurable";
    if (measure.pairs_n < floor && !entry?.floorOverride) return "unmeasurable";
  }
  return human === "approve" ? "better" : "not-better";
}

/** Apply one edit to a copy of the state (the gate's optimistic update and the
 *  disk layer's write are the same function). Validation is the caller's. */
export function applyBlindEdit(state: BlindState, e: BlindEdit): BlindState {
  const prev = state.improvements[e.imp] ?? { picks: {} };
  const entry: ImprovementBlind = { ...prev, picks: { ...prev.picks } };
  if (e.pair !== undefined) {
    if (e.pick === null || e.pick === undefined) delete entry.picks[e.pair];
    else entry.picks[e.pair] = e.pick;
  }
  if (e.anchored !== undefined) entry.anchored = e.anchored || undefined;
  if (e.floorOverride !== undefined) entry.floorOverride = e.floorOverride || undefined;
  return { ...state, improvements: { ...state.improvements, [e.imp]: entry } };
}
