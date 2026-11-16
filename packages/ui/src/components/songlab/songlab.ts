// THE SONG LAB'S VIEW SHAPES (spark yue2-song-lab S2, the contest winner "Knockout"): what the
// knockout desk draws, as plain data a server read builds and a client island renders. The port
// (app/(studio)/audio/_songlab/_port/port.ts) composes its read from these; the /kit specimens
// hand them literal values.
//
// THE BLIND IS IN THE SHAPE. Nothing here carries a take id, and nothing before a vote says which
// take plays as which arm: an entrant is its seed, its words and its rights; a match waiting for
// the ear carries its pair id and two opaque arm sources; the takes behind the arms arrive only
// in a `Reveal`, which the server builds for a decided match alone.
//
// Absent-value convention: an optional field is OMITTED, never null; a score the scorer did not
// compute is absent, never 0.
import type { AbAnswer, AbQuestion } from "@gt/domain/audio.yue2";
import type { DrawRound, LabProposalKind, MatchOutcome } from "@gt/domain/audio.yue2.lab";

/** The rights line a YuE2 take carries: the short mark on a row, the licence in full on a reveal. */
export type RightsView = { readonly short: string; readonly licence: string };

/** One drawn take, as the bracket names it. */
export type EntrantView = {
  readonly seed: number;
  /** The row's short name: `off 1.5 r8 s8`, `v1 debuzz·mix·master`. */
  readonly label: string;
  /** The condition in full: `cot off · cfg 1.5 · rank8 ×0.5 · seed 8`. */
  readonly cond: string;
  readonly rights: RightsView;
};

/** How an entrant left a decided match. */
export type SlotMark = "won" | "upset" | "out" | "neither" | "walked";

export type SlotView =
  | { readonly kind: "entrant"; readonly entrant: EntrantView; readonly mark?: SlotMark }
  /** A place no entrant holds yet (`winner of R16 1`), a bye, or a slot both entrants left. */
  | { readonly kind: "ghost"; readonly text: string; readonly seed?: number };

/** tbd: an entrant is still unknown · open: booked, waiting for the ear · done: voted · walk/bye: no pair. */
export type MatchStatus = "tbd" | "open" | "done" | "walk" | "bye";

export type MatchView = {
  /** The match's address on the desk: `<round>-<slot>`. */
  readonly id: string;
  readonly round: DrawRound;
  readonly slot: number;
  readonly status: MatchStatus;
  readonly a: SlotView;
  readonly b: SlotView;
  readonly outcome?: MatchOutcome;
  /** The winner's connector lights: someone advanced out of this match. */
  readonly lit: boolean;
};

export type RoundView = {
  readonly round: DrawRound;
  /** The column's head: `R16`, `QF`, `SF`, `final`. */
  readonly name: string;
  readonly matches: readonly MatchView[];
  readonly decided: number;
  /** Matches that need the ear (byes and walkovers are not counted). */
  readonly of: number;
  readonly open: number;
};

export type ChampionView = { readonly entrant: EntrantView };

export type BracketView = {
  readonly rounds: readonly RoundView[];
  readonly champion?: ChampionView;
  readonly decided: number;
  readonly total: number;
  readonly upsets: number;
  readonly open: number;
};

/** One draw tab: the main draw or one raw take's post draw. */
export type DrawTabView = { readonly drawId: string; readonly name: string; readonly open: number; readonly decided: number; readonly total: number };

/** A take a rule took out of the draw, named with the rule's reason. */
export type CutView = { readonly label: string; readonly why: string; readonly rights: RightsView };

/** The open draw's head: its rules as chips, its tallies, and the takes it cut. */
export type DrawHeadView = { readonly rules: readonly string[]; readonly cut?: readonly CutView[] };

export type ArmSrc = { readonly arm: "a" | "b"; readonly src: string };

/** The match the ear judges now: masked arms over a shared window. */
export type BlindMatchView = {
  readonly matchId: string;
  /** `R16 · match 1`. */
  readonly title: string;
  readonly drawName: string;
  readonly pairId: string;
  readonly arms: readonly [ArmSrc, ArmSrc];
  /** cut: both arms' windows are on disk · cutting: an ab-window job has not finished. */
  readonly window: "cut" | "cutting";
  /** Seconds of the shared window. */
  readonly windowS: number;
  /** The two entrants in bracket order (seed order): which one plays as A is not here. */
  readonly vs: readonly [EntrantView, EntrantView];
};

export type ScoreRow = { readonly label: string; readonly value: string; readonly tone?: "better" | "worse" };

export type RevealArm = {
  readonly arm: "a" | "b";
  readonly entrant: EntrantView;
  readonly gate: "pass" | "fail" | "unscored";
  /** A post variant's stages: `stems·debuzz·master`. */
  readonly stages?: string;
  readonly scores: readonly ScoreRow[];
};

/** What the ear's answer to one question says against the meters. */
export type Agreement = "agrees" | "differs" | "meters tie" | "unmeasured" | "neither";
export type QuestionVerdict = { readonly agree: Agreement; readonly detail: string };

/** A decided match, unmasked: who played as which arm, the answers, and the named upset. */
export type RevealView = {
  readonly matchId: string;
  readonly title: string;
  readonly drawName: string;
  readonly answers: Readonly<Record<AbQuestion, AbAnswer>>;
  readonly defect?: string;
  readonly arms: readonly [RevealArm, RevealArm];
  readonly winnerArm?: "a" | "b";
  readonly outcome: MatchOutcome;
  /** `seed 14 over seed 1, SongEval had it 4.06 to 3.50`. */
  readonly line: string;
  readonly verdicts: Readonly<Record<AbQuestion, QuestionVerdict>>;
  readonly windowS: number;
};

/** A booked match further down the queue. */
export type NextRowView = { readonly matchId: string; readonly drawId: string; readonly round: string; readonly label: string; readonly field: "main" | "post" };

/** A job on the GPU lane: a batch rendering, a post-chain, a window being cut. */
export type JobRowView = { readonly id: string; readonly label: string; readonly state: string; readonly done: number; readonly total: number; readonly stage?: string };

export type ProposalState = "open" | "kept" | "dropped";
export type ProposalView = { readonly turnId: string; readonly id: string; readonly kind: LabProposalKind; readonly label: string; readonly why: string; readonly state: ProposalState };

/** One RAN or LEARNED item: its act or source, the line, and the figure behind it. */
export type DetailItem = { readonly k: string; readonly line: string; readonly detail?: string };

export type DirectorView = {
  readonly presence: "listening" | "nobody";
  /** The agent's newest line and when it was said (HH:MM). Absent before its first turn. */
  readonly line?: { readonly at: string; readonly text: string };
  /** The owner's newest direction when no turn answers it yet. */
  readonly waiting?: string;
  readonly proposals: readonly ProposalView[];
  readonly ran: readonly DetailItem[];
  readonly learned: readonly DetailItem[];
  /** The one-line sums the RAN and LEARNED chips carry. */
  readonly ranSum: string;
  readonly learnedSum: string;
  /** Directions sent while nobody listened. */
  readonly inbox: number;
};

/** One take of the field sheet. */
export type FieldTakeView = {
  readonly key: string;
  readonly label: string;
  readonly cond: string;
  readonly gate: "pass" | "fail" | "unscored";
  readonly songEval?: number;
  readonly wer?: number;
  readonly durationS?: number;
  readonly rights: RightsView;
  /** Drawn in the open draw, by seed. */
  readonly seed?: number;
  readonly reference?: boolean;
};

export const QUESTION_WORDS: Readonly<Record<AbQuestion, string>> = { lyrics: "clearer lyrics", vocal: "more real vocal", release: "would release" };

/** Seconds as `0:25.0` (the booth's clock) or `0:25` (its length). */
export function clock(s: number, tenths = true): string {
  const t = Math.max(0, s);
  const base = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return tenths ? `${base}.${Math.floor((t * 10) % 10)}` : base;
}

/** A length in seconds as `m:ss`; absent is a dash. */
export function length(s: number | undefined): string {
  return s === undefined ? "—" : clock(Math.round(s), false);
}
