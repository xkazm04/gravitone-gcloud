// THE ONE STATUS VOCABULARY: every machine's states -> a look -> a token role -> a label.
//
// The prototype spelled this mapping five times and they disagreed at the edges:
// index.html `SLOT_STATE` (and its inline twin at the slot detail, which forgot `missed`),
// kit.js `mslot`, projects.js `STATUS_TO_STATE` and the ribbon's slot tail (which sent
// every slot that was not published or failed to amber, `missed` and `cancelled` included).
// Each was a string-keyed object, so a word nobody mapped rendered as a colourless `.state`.
// Here there is one table per machine, keyed by the machine's own state union from
// `@gt/domain`: a state added to a machine is a compile error in this file until it has a
// look and a label (status-vocabulary/vocabulary-chain-integrity: key the presentation by
// the wire union, colour and label in ONE entry).
//
// A LOOK is the design's display vocabulary (tokens.css `.state.*` plus library.css's
// reference/candidate rings): eight shapes, each one colour role and one glyph. Machines
// map onto looks; components draw looks. Nothing below the table names a colour.

import type { JobState } from "@gt/domain/job.machine";
import type { PacketState } from "@gt/domain/packet.machine";
import type { PartState } from "@gt/domain/part.machine";
import type { ProjectState } from "@gt/domain/project.machine";
import type { RunState } from "@gt/domain/run.machine";
import type { SlotState } from "@gt/domain/slot.machine";
import type { StyleStatus } from "@gt/domain/style.machine";
import type { LibraryItem } from "@gt/domain/libraryItem";
import type { TokenName } from "../../tokens.ts";

export type Look = "idle" | "paused" | "running" | "awaiting" | "done" | "failed" | "reference" | "candidate";

/** The glyph a look draws before its words: never colour alone (status-color-mapping). */
export type Mark = "dot" | "pulse" | "bars" | "ring" | "dashed-ring";

type LookSpec = { readonly role: TokenName; readonly mark: Mark };

/** Look -> token role and mark. The roles are the signal tokens' one meaning each. */
export const LOOKS: { readonly [L in Look]: LookSpec } = {
  idle: { role: "faint", mark: "dot" },
  paused: { role: "faint", mark: "bars" },
  running: { role: "cyan", mark: "pulse" },
  awaiting: { role: "amber", mark: "dot" },
  done: { role: "emerald", mark: "dot" },
  failed: { role: "rose", mark: "dot" },
  reference: { role: "reference-text", mark: "ring" },
  candidate: { role: "amber", mark: "dashed-ring" },
};

export type StatusEntry = { readonly look: Look; readonly label: string };

type LibraryState = LibraryItem["state"];

export type Vocabulary = {
  readonly job: JobState;
  readonly run: RunState;
  readonly part: PartState;
  readonly project: ProjectState;
  readonly packet: PacketState;
  readonly slot: SlotState;
  readonly style: StyleStatus;
  readonly library: LibraryState;
};
export type Machine = keyof Vocabulary;

export type StatusTable = { readonly [M in Machine]: { readonly [S in Vocabulary[M]]: StatusEntry } };

const e = (look: Look, label: string): StatusEntry => ({ look, label });

/**
 * Labels are the prototype's words where it had them ("at weir", "shipped"), otherwise
 * the state with its underscore spaced. Decisions the prototype never had to make:
 *   job.interrupted  awaiting, not failed: the outcome is unknown and the vendor may have
 *                    been paid, so it waits on the operator's look (@gt/domain/job).
 *   packet.returned  idle: the next turn arrives as a new packet; this one is spent.
 *   cancelled        idle everywhere (index.html's month tallies drew cancelled as draft).
 */
export const STATUS: StatusTable = {
  job: {
    planned: e("idle", "planned"),
    queued: e("idle", "queued"),
    running: e("running", "running"),
    paused: e("paused", "paused"),
    failed: e("failed", "failed"),
    interrupted: e("awaiting", "interrupted"),
    done: e("done", "done"),
    cancelled: e("idle", "cancelled"),
  },
  run: {
    draft: e("idle", "draft"),
    queued: e("idle", "queued"),
    running: e("running", "running"),
    awaiting_gate: e("awaiting", "at weir"),
    blocked: e("failed", "blocked"),
    ratified: e("done", "ratified"),
    cancelled: e("idle", "cancelled"),
  },
  part: {
    draft: e("idle", "draft"),
    queued: e("idle", "queued"),
    running: e("running", "running"),
    paused: e("paused", "paused"),
    awaiting_gate: e("awaiting", "at weir"),
    failed: e("failed", "failed"),
    blocked: e("failed", "blocked"),
    ratified: e("done", "ratified"),
  },
  project: {
    draft: e("idle", "draft"),
    queued: e("idle", "queued"),
    running: e("running", "running"),
    awaiting_gate: e("awaiting", "at the weir"),
    blocked: e("failed", "blocked"),
    ratified: e("done", "shipped"),
  },
  packet: {
    open: e("awaiting", "at weir"),
    committed: e("done", "committed"),
    returned: e("idle", "returned"),
  },
  slot: {
    scheduled: e("awaiting", "scheduled"),
    publishing: e("running", "publishing"),
    published: e("done", "published"),
    missed: e("failed", "missed"),
    failed: e("failed", "failed"),
    cancelled: e("idle", "cancelled"),
  },
  style: {
    candidate: e("candidate", "candidate"),
    proven: e("done", "proven"),
    locked: e("done", "locked"),
  },
  library: {
    reference: e("reference", "reference"),
    candidate: e("candidate", "candidate"),
    ratified: e("done", "ratified"),
    rejected: e("failed", "rejected"),
    unjudged: e("awaiting", "unjudged"),
  },
};

/** The entry for a state the type system has already vouched for. */
export function statusOf<M extends Machine>(machine: M, state: Vocabulary[M]): StatusEntry {
  const table: StatusTable[M] = STATUS[machine];
  return table[state];
}

/**
 * A token that has not been decided: amber "unknown", the look that asks for the
 * operator. Degrading toward attention, never toward calm - a state this build cannot
 * name is a state it cannot vouch for, and drawing it green or idle would claim it can
 * (status-color-mapping, "the unknown direction"). The raw token is never the label.
 */
export const UNKNOWN: StatusEntry = { look: "awaiting", label: "unknown" };

export type StatusMiss = { readonly machine: Machine; readonly token: string };

/**
 * For a token arriving as a plain string (a wire payload from another build). Total by
 * policy; a miss is handed to `report` every time it happens, in production too -
 * version skew is a production phenomenon (vocabulary-chain-integrity).
 */
export function statusFromWire(machine: Machine, token: string, report: (miss: StatusMiss) => void): StatusEntry {
  const table: Readonly<Record<string, StatusEntry>> = STATUS[machine];
  const hit = Object.hasOwn(table, token) ? table[token] : undefined;
  if (hit !== undefined) return hit;
  report({ machine, token });
  return UNKNOWN;
}
