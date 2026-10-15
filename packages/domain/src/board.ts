// THE BOARD'S RECORDS, zod-free: what the Board sheet reads (PacketView), what
// the Floor's rail lists (PacketSummary), what a blind pick and a returned
// review carry (PickOutcome, EditPlan), and what a commit will do before it is
// done (Consequence). A client component holds every one of these, so this
// module imports only types and ./errors.ts; the zod doors for the two inputs a
// server receives (a pick, an edit plan) are in ./decision.ts and call the
// checks here, so the browser and the server refuse the same things.

import type { BlobRef } from "./blob.ts";
import type { Grade } from "./candidate.ts";
import { err, ok, type Result } from "./errors.ts";
import type { CandidateId, PacketId, PartId, RunId } from "./ids.ts";
import type { MediaLane } from "./lane.ts";
import type { PacketState } from "./packet.machine.ts";
import type { PacketMode, PacketSource } from "./source.ts";

/* ── blind pairs ───────────────────────────────────────────────────────────── */

/**
 * The operator's answer on one blind pair (prototype index.html:617: 1 left,
 * 2 right, 0 tie, X both bad). v1's dojo had three (training/blind.ts
 * `BlindPick = "A" | "B" | "tie"`); `both-bad` is the prototype's, for a pair
 * where neither arm is worth keeping - a tie says "equally good".
 */
export const PICK_OUTCOMES = ["a", "b", "tie", "both-bad"] as const;
export type PickOutcome = (typeof PICK_OUTCOMES)[number];

export type ArmVerdict = "keep" | "reject";

/**
 * The two arms' verdicts a pick writes, [arm a, arm b]. One rule today for
 * every source (Phase 3 decision 7): the chosen arm is kept and the other
 * rejected, a tie keeps both, both-bad rejects both. It is a function of the
 * source so a source with another rule changes one line, not the kernel.
 */
export function pickVerdicts(source: PacketSource, outcome: PickOutcome): readonly [ArmVerdict, ArmVerdict] {
  void source;
  switch (outcome) {
    case "a":
      return ["keep", "reject"];
    case "b":
      return ["reject", "keep"];
    case "tie":
      return ["keep", "keep"];
    case "both-bad":
      return ["reject", "reject"];
  }
}

/* ── the review's edit plan ────────────────────────────────────────────────── */

/** The prototype's five (index.html:625 DIRECTIVES), in its Tab order. */
export const EDIT_DIRECTIVES = ["more_weight", "less_weight", "remove", "reposition", "free_text"] as const;
export type EditDirective = (typeof EDIT_DIRECTIVES)[number];

/** One note on one section (prototype `EditNote`: section id, directive, text). */
export type EditNote = { readonly section: string; readonly directive: EditDirective; readonly text: string };
export type EditPlan = readonly EditNote[];

/** v1's rework bound per note (lib/articles/types.ts NOTE_MAX_CHARS). */
export const EDIT_TEXT_MAX = 2000;
/** More notes than this is a rewrite brief, not a review. */
export const EDIT_PLAN_MAX = 64;

/**
 * A plan a review may be sent back with. At least one note: a return with no
 * instruction sends the work round again to come back the same (v1's rework
 * refused an empty note, lib/articles/rework.ts trimmedNote). A text over the
 * bound is REFUSED, not cut - v1's rework refused too, "because a cut
 * instruction silently changes what the operator asked for".
 */
export function checkEditPlan(plan: EditPlan): Result<EditPlan> {
  if (plan.length === 0) return err("invalid", "an edit plan names at least one note");
  if (plan.length > EDIT_PLAN_MAX) return err("invalid", `an edit plan carries at most ${EDIT_PLAN_MAX} notes; this one has ${plan.length}`);
  const out: EditNote[] = [];
  for (const [i, n] of plan.entries()) {
    const section = n.section.trim();
    const text = n.text.trim();
    if (section === "") return err("invalid", `note ${i + 1} names no section`);
    if (!EDIT_DIRECTIVES.includes(n.directive)) return err("invalid", `note ${i + 1}: unknown directive ${String(n.directive)}`);
    if (text === "") return err("invalid", `note ${i + 1} is blank`);
    if (text.length > EDIT_TEXT_MAX) return err("invalid", `note ${i + 1} is ${text.length} characters; a note is at most ${EDIT_TEXT_MAX}`);
    out.push({ section, directive: n.directive, text });
  }
  return ok(out);
}

/* ── the blast radius ──────────────────────────────────────────────────────── */

/** One thing a commit touches, by what the operator would recognise it as. */
export type ConsequenceItem = { readonly target: string; readonly candidate?: string; readonly detail?: string };

/**
 * What committing a packet will do, computed by its source's adapter from
 * v1's own planners (planForgeCommit, planExtractCommit, planStripCommit, …)
 * BEFORE the commit, and shown to the operator (Phase 3 decision 6).
 *
 * `token` = consequenceToken(decisions, v1Digest) (@gt/kernel/decision/
 * consequence): a commit carries it back, and the kernel refuses it (409,
 * detail "stale-preview") when either the decisions or the v1 state the
 * preview read have moved, so what is committed is what was shown
 * (hitl-approval: resume-after-decision, "what runs on approval is not what
 * was shown"). v1's token was the verdict revision alone; it missed the v1
 * side moving under an unchanged verdict map.
 */
export type Consequence = {
  readonly packetId: PacketId;
  /** The packet revision the preview read. */
  readonly rev: number;
  readonly counts: { readonly kept: number; readonly rejected: number; readonly undecided: number };
  /** Files and records the commit removes (v1's forge commit deleted rejected plates). */
  readonly deletes: readonly ConsequenceItem[];
  /** Index rows and files it writes. */
  readonly writes: readonly (ConsequenceItem & { readonly kind: "index-row" | "file" })[];
  /** Candidates that become library things (a kept style, a ratified take). */
  readonly promotions: readonly ConsequenceItem[];
  readonly renames: readonly { readonly from: string; readonly to: string }[];
  /** A kept candidate that is near something already kept (distance in the source's own unit). */
  readonly nearDuplicates: readonly { readonly candidate: string; readonly of: string; readonly distance?: number }[];
  /** Acts that leave this machine, as a sentence ("push branch article/<slug> to ai-registry and open a PR"). */
  readonly outward: readonly { readonly kind: string; readonly sentence: string }[];
  /** The digest of the v1 state the adapter planned from. */
  readonly v1Digest: string;
  readonly token: string;
};

/* ── the outbox, as a surface sees it ──────────────────────────────────────── */

export const APPLY_STATES = ["pending", "applied", "stuck"] as const;
export type ApplyState = (typeof APPLY_STATES)[number];

/** The v1 apply of a committed (or returned) packet: pending until v1's own
 *  writer took it, stuck after the bounded attempts, with v1's sentence verbatim. */
export type ApplyStatus = {
  readonly act: "commit" | "return";
  readonly state: ApplyState;
  readonly attempts: number;
  readonly lastError?: string;
  /** When the next attempt is due (pending only). */
  readonly nextAt?: string;
};

/* ── what the Board and the Floor read ─────────────────────────────────────── */

/**
 * One candidate's current decision, as a surface reads it: the shape of
 * ./decision.ts `Decision`, spelled here as a plain type because that module
 * imports this one for its wire doors, and a pair of modules that import each
 * other is a cycle (type-only or not). The kernel hands out the parsed record;
 * it is assignable to this.
 */
export type DecisionView = {
  /** `<packetId>::<candidateId>`. */
  readonly key: string;
  readonly verdict: "keep" | "reject" | null;
  readonly reasons: readonly string[];
  readonly note?: string;
  readonly rev: number;
  readonly by: "operator" | "agent";
  readonly surface: string;
  readonly at: string;
};

export type ViewItem = {
  readonly id: CandidateId;
  readonly row?: string;
  readonly media: BlobRef;
  /** Where the browser fetches the bytes; the caller's mapping from the blob ref. */
  readonly url: string;
  /** Withheld (empty) on a blind pair the operator has not judged yet. */
  readonly grades: readonly Grade[];
};

/** One blind pair as the desk draws it: arms in the stored, id-derived order. */
export type PairView = {
  readonly row: string;
  readonly a: CandidateId;
  readonly b: CandidateId;
  /** The operator's recorded pick, or null (unjudged, or judged arm by arm). */
  readonly outcome: PickOutcome | null;
  /** Present only once the operator has judged the pair (the blind-first guard). */
  readonly machine?: { readonly candidate: CandidateId; readonly agrees: boolean | null };
};

export type PacketView = {
  readonly id: PacketId;
  readonly lane: MediaLane;
  readonly source: PacketSource;
  readonly mode: PacketMode;
  readonly state: PacketState;
  readonly title?: string;
  readonly runId?: RunId;
  readonly partId?: PartId;
  /** Every write carries this back as its baseRev. */
  readonly rev: number;
  readonly items: readonly ViewItem[];
  /** Each judged candidate's current decision. */
  readonly decisions: readonly DecisionView[];
  readonly undecided: number;
  /** An act newer than the import is left to take back. */
  readonly canUndo: boolean;
  /** The source's vocabulary: reasons in key order, how many a verdict may carry, the note bound. */
  readonly reasons: { readonly list: readonly string[]; readonly max: number; readonly noteMax: number };
  /** Blind pair only. */
  readonly pairs: readonly PairView[];
  /** A returned review's plan. */
  readonly returned?: EditPlan;
  readonly apply?: ApplyStatus;
};

/** One row of the Floor's Weir rail. */
export type PacketSummary = {
  readonly id: PacketId;
  readonly lane: MediaLane;
  readonly source: PacketSource;
  readonly mode: PacketMode;
  readonly state: PacketState;
  readonly title?: string;
  readonly runId?: RunId;
  readonly rev: number;
  readonly items: number;
  readonly decided: number;
  readonly openedAt: string;
  readonly apply?: ApplyStatus;
};

/** A bounded listing says when it was cut (bounded-enumeration). */
export type PacketList = { readonly packets: readonly PacketSummary[]; readonly truncated: boolean };
