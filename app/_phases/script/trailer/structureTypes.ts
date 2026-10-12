// The vocabulary the trailer structure checker speaks in: the rule names, the
// finding shape, the citation table, and the two compile-time proofs that the
// runtime lists of beat kinds and rules have not fallen behind their unions.
// A separate file so that every rule module and the thresholds reader can share
// one definition of a finding without importing the door.

import type { Verdict } from "../gate";
import type { TrailerBeatKind } from "./types";

/* ─────────────────────────────── findings ─────────────────────────────────── */

export type StructureRule =
  | "graph"
  | "connector"
  | "spine"
  | "escalation"
  | "reset"
  | "cue"
  | "magnitude"
  | "cards"
  | "promise"
  | "ladder"
  | "withholding"
  | "concealment"
  | "efficacy";

export interface StructureFinding {
  rule: StructureRule;
  subject: string;
  verdict: Verdict;
  detail: string;
  /** The beat that tripped it. A finding you cannot locate is a rumour. */
  at?: string;
  beatId?: string;
  /** The doctrine this rule is read from. A rule with no citation is this file
   *  inventing craft, and the citation is what lets a reader who disagrees go
   *  look — `knowledge/README.md` § The evidence contract, rule 2. */
  cites: string;
}

const REG = "registry: media-generation/narrative-craft/trailer-structure";
export const CITE = {
  spine: `${REG}/trailer-structure.md § The spine, and what it is a spine of`,
  lane: `${REG}/trailer-structure.md § The spine is a default, not a law`,
  failures: `${REG}/trailer-structure.md § Failure modes of the naive reading`,
  measurable: `${REG}/trailer-structure.md § What is measurable, and what is not`,
  escalation: `${REG}/techniques/escalation-without-mechanism.md`,
  reset: `${REG}/techniques/dynamic-reset.md`,
  cue: `${REG}/techniques/cue-first-assembly.md`,
  ladder: `${REG}/techniques/length-ladder.md`,
  promise: `${REG}/techniques/promise-ledger.md`,
  budget: `${REG}/techniques/withholding-budget.md`,
  concealment: `${REG}/techniques/concealment-and-its-tells.md`,
  causality: "registry: media-generation/_laws.md#causality-over-sequence",
  unmeasured: "registry: media-generation/_laws.md#unmeasured-is-not-pass",
  graph: "this repo: pipeline/check-notebook.mts — a reference to nothing is a broken edge",
} as const;


/** Every `TrailerBeatKind`, as runtime data so the params file can be checked
 *  against it. `KIND_LIST_IS_EXHAUSTIVE` is the compiler's proof that adding a
 *  kind to the union without adding it here stops the build — the same device
 *  `types.ts` uses for `VOCABULARIES_ARE_DISJOINT`, and for the same reason: a
 *  list that silently falls behind its union validates nothing. */
export const ALL_BEAT_KINDS = [
  "cold-open",
  "stakes",
  "rung",
  "reset",
  "peak",
  "title",
  "button",
  "cta",
] as const satisfies readonly TrailerBeatKind[];

type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;

export const KIND_LIST_IS_EXHAUSTIVE: Exhaustive<
  TrailerBeatKind,
  (typeof ALL_BEAT_KINDS)[number]
> = true;

export const ALL_RULES = [
  "graph",
  "connector",
  "spine",
  "escalation",
  "reset",
  "cue",
  "magnitude",
  "cards",
  "promise",
  "ladder",
  "withholding",
  "concealment",
  "efficacy",
] as const satisfies readonly StructureRule[];

export const RULE_LIST_IS_EXHAUSTIVE: Exhaustive<
  StructureRule,
  (typeof ALL_RULES)[number]
> = true;
