// THE SONG LAB'S KNOCKOUT AND ITS AGENT (spark yue2-song-lab S2), zod-free so a client island can
// import it. The owner chose the contest winner "Knockout" (2026-11-04): the outside agent seeds a
// bracket from the lyric-gate passers and books every match; only the owner's blind ear advances a
// take. A one-line direction becomes a proposal; keeping a proposal runs it on the server. The agent
// never votes and never keeps (there is no MCP op for either). The doors are ./audio.yue2.lab.schema.ts.
//
// Absent-value convention: an optional field is OMITTED, never null.

import type { Yue2Condition, Yue2PostStage } from "./audio.yue2.ts";

/* ── the draw ── */

/** The metrics a rule can name (newest score row; `songEval` = the mean of the five dimensions). */
export const LAB_METRICS = ["wer", "werSd", "songEval", "ce", "buzzIdx"] as const;
export type LabMetric = (typeof LAB_METRICS)[number];

export const DRAW_SIZES = [8, 16] as const;
export type DrawSize = (typeof DRAW_SIZES)[number];

/** What a draw is drawn over: the main field (every lyric-gate passer) or one raw take's post field. */
export type DrawField = "main" | `post:${string}`;

/** A rule shapes who is drawn and how they are seeded. A new rule set is a new draw version. */
export type LabRule =
  | { readonly kind: "exclude"; readonly metric: LabMetric; readonly op: "gt" | "lt"; readonly value: number }
  | { readonly kind: "only"; readonly condition: Partial<Pick<Yue2Condition, "cot" | "cfg" | "adapter">> }
  | { readonly kind: "seed-by"; readonly metric: LabMetric }
  | { readonly kind: "size"; readonly size: DrawSize };

export type DrawEntrant = { readonly takeId: string; readonly seed: number };

/** One version of a draw (the `audio.ab.draw` event's data). */
export type Draw = {
  readonly drawId: string;
  readonly version: number;
  readonly field: DrawField;
  readonly size: DrawSize;
  readonly entrants: readonly DrawEntrant[];
  readonly rules: readonly LabRule[];
  /** Takes the rules cut from the previous version, named so a cut is never silent. */
  readonly cut?: readonly string[];
};

export const DRAW_ROUNDS = ["R16", "QF", "SF", "F"] as const;
export type DrawRound = (typeof DRAW_ROUNDS)[number];

/** How a decided match ended: the higher seed won, the lower seed won, both knocked out, or no opponent. */
export const MATCH_OUTCOMES = ["won", "upset", "neither", "walkover"] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

/** One match of a bracket, folded from the draw, the queued knockout pairs and the votes. */
export type Match = {
  readonly drawId: string;
  readonly round: DrawRound;
  /** 1-based position within its round. */
  readonly slot: number;
  readonly pairId?: string;
  readonly takeA?: string;
  readonly takeB?: string;
  readonly winner?: string;
  readonly outcome?: MatchOutcome;
};

export const AB_DRAW_EVENT = "audio.ab.draw" as const;
export const DRAW_SUBJECT_KIND = "ab-draw" as const;
export const abDrawKey = (drawId: string, version: number) => `audio-ab-draw:${drawId}:${version}`;

/* ── the agent's room ── */

export const LAB_SESSION_KIND = "songlab-session" as const;
export const LAB_SAY_EVENT = "audio.lab.say" as const;
export const LAB_TURN_EVENT = "audio.lab.turn" as const;
export const LAB_KEEP_EVENT = "audio.lab.keep" as const;
export const LAB_DROP_EVENT = "audio.lab.drop" as const;
export const labSayKey = (turnId: string) => `audio-lab-say:${turnId}`;
export const labTurnKey = (turnId: string) => `audio-lab-turn:${turnId}`;
export const labKeepKey = (proposalId: string) => `audio-lab-keep:${proposalId}`;
export const labDropKey = (proposalId: string) => `audio-lab-drop:${proposalId}`;

/** The closed set of acts the agent may propose. */
export const LAB_PROPOSAL_KINDS = ["rule", "launch", "post"] as const;
export type LabProposalKind = (typeof LAB_PROPOSAL_KINDS)[number];

export type LabLaunch = {
  readonly style: string;
  readonly lyrics: string;
  readonly seeds: readonly number[];
  readonly cot: Yue2Condition["cot"];
  readonly cfg?: number;
  readonly adapter?: string;
  readonly adapterStrength?: number;
};
export type LabPost = { readonly takeIds: readonly string[]; readonly stages: readonly Yue2PostStage[]; readonly referenceTakeId?: string };
export type LabRuleChange = { readonly drawId: string; readonly rules: readonly LabRule[] };

/** One proposal: the act itself, its one-line label and the agent's reason. */
export type LabProposal =
  | { readonly id: string; readonly kind: "rule"; readonly label: string; readonly why: string; readonly rule: LabRuleChange }
  | { readonly id: string; readonly kind: "launch"; readonly label: string; readonly why: string; readonly launch: LabLaunch }
  | { readonly id: string; readonly kind: "post"; readonly label: string; readonly why: string; readonly post: LabPost };

export const LAB_MAX = { line: 240, item: 200, ran: 6, learned: 6, proposals: 3, direction: 240 } as const;

/** The owner's one-line direction (the `audio.lab.say` event's data). */
export type LabSay = { readonly session: string; readonly turnId: string; readonly text: string; readonly at: string };

/** The agent's answer (the `audio.lab.turn` event's data). */
export type LabTurn = {
  readonly session: string;
  readonly turnId: string;
  /** The say this turn answers; absent for a turn the agent opens itself after background work. */
  readonly answers?: string;
  readonly line: string;
  readonly ran: readonly string[];
  readonly learned: readonly string[];
  readonly proposals: readonly LabProposal[];
  readonly at: string;
};

/** The owner's keep or drop of one proposal (`audio.lab.keep` / `audio.lab.drop` data). */
export type LabDecision = {
  readonly turnId: string;
  readonly proposalId: string;
  /** What the keep started: a job id or a draw version; absent on a drop. */
  readonly started?: string;
};
