// THE NOTES PAD AS A TRANSITION TABLE.
//
// useVersions.ts used to hold this machine in ten useState cells, four refs and
// six `if (running)` guards, inside a "use client" hook the Node probe lane
// cannot execute. Every rule the hook's header promises is a case of
// `padReduce` now, and the hook keeps only what has to be React: loading and
// saving, the turn ledger, and the pre-flight.
//
// The phases:
//
//   idle ──run──▶ starting ──started──▶ (the ledger) running ──land──▶ staged
//                    │                                  │                │
//                    └──refused──▶ staged               └─cancelled─▶ idle ◀─accept/discard
//
// `running` is the LEDGER's word, not this file's: the hook feeds `sync` with
// what the jobs provider reports, so a turn started in another tab or device
// locks this pad too. `starting` is the one phase only a click can enter — the
// gap between the click and the 202, when no turn id exists yet.
//
// THE LEDGER IS STAMPED WITH THE NOTEBOOK IT WAS WRITTEN AGAINST. A version is
// a set of beat chains edited against one notebook's cards; sent beside another
// notebook it is a base chain for reasoning it never saw. So a ledger whose
// digest is not the dealt one is an ORPHAN — the same rule, and the same legacy
// reading, as the scope's (research/useScope.ts orphanOf): held, never deleted,
// and replaced only when the creator writes on the notebook in front of them.
//
// THE HISTORY IS WALKED FORWARD (history.ts): a staged run is saved whole and
// resumed on reload if its baseline and notebook have not moved, and `restore`
// stages any earlier version as a new candidate — idle ──restore──▶ staged —
// through the same accept path a run takes.

import { fixtureSource } from "../_shared/notebook/source";
import { recalibrate, recalibrateFromPlan, type ScopeCtx } from "./recalibrate";
import type { EditPlan } from "./editPlan";
import { acceptInto, restoreAs, resumeStaged, stagedOf, type LostCandidate } from "./history";
import { BASELINE, engineRunWith, type GateOverride, type Note, type NoteKind, type Version } from "./versions";

export type PadPhase = "idle" | "starting" | "running" | "staged";

export type { LostCandidate } from "./history";

/** The pad as it is stored (phase key `script-versions`). */
export interface PadRecord {
  notes: Note[];
  /** Accepted versions, oldest first. The baseline itself is never stored. */
  accepted: Version[];
  /** The staged candidate, against what it was built on (history.ts
   *  StagedRecord). `unknown` because a stored one is read, never trusted —
   *  an older build wrote a bare {label, at, notes} receipt here. */
  staged?: unknown;
  /** The last turn whose answer this pad took. A mount never takes it twice. */
  turn?: string;
  /** The digest of the notebook the ledger was written against. Absent on a
   *  ledger stored before the stamp — which reads as the fixture's. */
  digest?: string;
  savedAt?: number;
}

/** A ledger written on a notebook other than the one being dealt. */
export interface PadOrphan {
  digest: string;
  accepted: number;
  notes: number;
}

export interface PadState {
  phase: PadPhase;
  notes: Note[];
  accepted: Version[];
  candidate: Version | null;
  lost: LostCandidate | null;
  /** The last turn this pad took — the exactly-once guard, and what is saved. */
  consumed: string | null;
  /** Why the simulated engine ran, when it did. */
  engineNote: string | null;
  /** Renders and conclusions the creator put back into the next run (AIO-B).
   *  Decisions about the NEXT run: never persisted, answered by accepting. */
  forceRenders: string[];
  forceConclusions: string[];
  /** THE NOTE ORDINAL, AND IT MUST NOT REWIND. Minting from `notes.length`
   *  re-issued an id after a removal, so one ✕ deleted two notes. */
  seq: number;
  /** The ledger's stamp. */
  digest: string | undefined;
  /** The notebook being dealt now, as the hook last reported it. */
  dealt: string | undefined;
  /** Whether the ledger reports this project's recalibration live. */
  live: boolean;
}

/** What a landing needs of a settled turn — a TurnRecord satisfies it. */
export interface LandedTurn {
  id: string;
  status: string;
  result?: unknown;
  error?: { message?: string } | null;
}

export type PadAction =
  | { type: "hydrate"; record: PadRecord | null | undefined; dealt?: string }
  | { type: "sync"; live: boolean; dealt?: string }
  | { type: "add-note"; cardId: string; kind: NoteKind; text?: string }
  | { type: "remove-note"; id: string }
  | { type: "clear-notes" }
  | { type: "force-render"; id: string }
  | { type: "force-conclusion"; id: string }
  | { type: "run"; blocked?: boolean }
  | { type: "started" }
  | { type: "refused"; why: string; at: number; ctx: ScopeCtx }
  | { type: "land"; turn: LandedTurn; at: number; ctx: ScopeCtx }
  | { type: "accept"; override?: GateOverride; digest: string }
  | { type: "restore"; id: string; at: number }
  | { type: "discard" };

export function padInit(): PadState {
  return {
    phase: "idle",
    notes: [],
    accepted: [],
    candidate: null,
    lost: null,
    consumed: null,
    engineNote: null,
    forceRenders: [],
    forceConclusions: [],
    seq: 0,
    digest: undefined,
    dealt: undefined,
    live: false,
  };
}

/** The stamp a stored ledger carries. Unstamped and non-empty was written
 *  before the stamp existed, and every one of those against the fixture. */
function stampOf(r: Pick<PadRecord, "notes" | "accepted" | "digest">): string | undefined {
  if (r.digest !== undefined) return r.digest;
  return r.notes.length || r.accepted.length ? fixtureSource().digest : undefined;
}

/** What the pad shows on the notebook `digest`: its baseline, its notes, and
 *  the ledger it is NOT applying, if any. Pure; the record is never touched. */
export function padBasis(
  record: Pick<PadRecord, "notes" | "accepted" | "digest">,
  digest: string | undefined,
): { baseline: Version; notes: Note[]; orphan: PadOrphan | null } {
  const stamp = stampOf(record);
  if (digest !== undefined && stamp !== undefined && stamp !== digest)
    return { baseline: BASELINE, notes: [], orphan: { digest: stamp, accepted: record.accepted.length, notes: record.notes.length } };
  return { baseline: record.accepted[record.accepted.length - 1] ?? BASELINE, notes: record.notes, orphan: null };
}

/** The record to save. A staged candidate is saved WHOLE, against the
 *  baseline and notebook it was built on, so a reload can resume it. */
export function padRecordOf(s: PadState): PadRecord {
  return {
    notes: s.notes,
    accepted: s.accepted,
    staged: s.candidate ? stagedOf(s.candidate, padBasis(s, s.dealt).baseline.id, s.digest ?? s.dealt) : undefined,
    ...(s.consumed ? { turn: s.consumed } : {}),
    ...(s.digest !== undefined ? { digest: s.digest } : {}),
  };
}

/** The phase the pad rests in: the ledger first, then the candidate. A click
 *  between itself and its 202 is left alone — only `started`/`refused` end it. */
function settle(s: PadState): PadState {
  if (s.phase === "starting") return s;
  const phase: PadPhase = s.live ? "running" : s.candidate ? "staged" : "idle";
  return phase === s.phase ? s : { ...s, phase };
}

/** A pad that may take an edit: on an orphan, a FRESH ledger for the dealt
 *  notebook (the orphan stays on disk until this one is saved over it). */
function owned(s: PadState): PadState {
  if (padBasis(s, s.dealt).orphan) return { ...s, notes: [], accepted: [], digest: s.dealt };
  return s.dealt !== undefined && s.digest !== s.dealt ? { ...s, digest: s.dealt } : s;
}

const flip = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
const nextId = (s: PadState) => `v${s.accepted.length + 2}`;

/** RULE 2: nothing on the pad may change while a run is starting or live — a
 *  note added mid-flight would not be in the run whose result you compare. */
const locked = (s: PadState) => s.phase === "starting" || s.phase === "running";

export function padReduce(s: PadState, a: PadAction): PadState {
  switch (a.type) {
    case "hydrate": {
      const r = a.record;
      const notes = r?.notes ?? [];
      const accepted = r?.accepted ?? [];
      const dealt = a.dealt ?? s.dealt;
      // The staged run, resumed only onto the baseline and notebook it was
      // built on. On an orphan it is the other notebook's, and stays on disk.
      const basis = padBasis({ notes, accepted, digest: r?.digest }, dealt);
      const resumed = r?.staged === undefined || basis.orphan ? null : resumeStaged(r.staged, { baselineId: basis.baseline.id, digest: dealt });
      const candidate = resumed && !("lost" in resumed) ? resumed : null;
      return settle({
        ...padInit(),
        notes,
        accepted,
        candidate,
        lost: resumed && "lost" in resumed ? resumed : null,
        consumed: r?.turn ?? null,
        // Seeded past every stored ordinal, so a reload cannot collide.
        seq: notes.reduce((n, x) => Math.max(n, Number.isFinite(x.at) ? x.at + 1 : 0), 0),
        digest: r ? stampOf({ notes, accepted, digest: r.digest }) : undefined,
        // The ledger and the dealt notebook are `sync`'s, not the record's.
        dealt,
        live: s.live,
      });
    }

    case "sync": {
      if (s.live === a.live && s.dealt === a.dealt) return s;
      const next = { ...s, live: a.live, dealt: a.dealt };
      // A starting pad stays starting until the 202 — unless the ledger already
      // names a live turn (another tab's, met as a 409).
      if (next.phase === "starting") return a.live ? { ...next, phase: "running" } : next;
      return settle(next);
    }

    case "add-note": {
      if (locked(s)) return s;
      const o = owned(s);
      const at = o.seq;
      return { ...o, seq: at + 1, notes: [...o.notes, { id: `n-${a.cardId}-${a.kind}-${at}`, cardId: a.cardId, kind: a.kind, text: a.text, at }] };
    }

    case "remove-note": {
      if (locked(s) || !s.notes.some((n) => n.id === a.id)) return s;
      const o = owned(s);
      return { ...o, notes: o.notes.filter((n) => n.id !== a.id) };
    }

    case "clear-notes":
      if (locked(s) || !s.notes.length) return s;
      return { ...owned(s), notes: [] };

    case "force-render":
      return locked(s) ? s : { ...s, forceRenders: flip(s.forceRenders, a.id) };

    case "force-conclusion":
      return locked(s) ? s : { ...s, forceConclusions: flip(s.forceConclusions, a.id) };

    case "run":
      if (s.phase !== "idle" || a.blocked || !padBasis(s, s.dealt).notes.length) return s;
      return { ...s, phase: "starting", lost: null };

    case "started":
      // The server holds a turn now; the ledger is what keeps the pad locked.
      if (s.phase !== "starting") return s;
      return settle({ ...s, phase: s.live ? "running" : "idle", engineNote: null });

    case "refused": {
      // Refused before any turn existed: the simulated fallback, with the
      // server's sentence beside it.
      if (s.phase !== "starting") return s;
      const { baseline, notes } = padBasis(s, s.dealt);
      return settle({
        ...s,
        phase: s.live ? "running" : "idle",
        engineNote: a.why,
        candidate: recalibrate(baseline, notes, nextId(s), a.at, a.ctx),
      });
    }

    case "land": {
      // EXACTLY ONCE: a turn this pad has taken is never taken again.
      if (s.consumed === a.turn.id) return s;
      // The turn has ended; the ledger re-locks the pad if another is live.
      const ended: PadState = { ...s, consumed: a.turn.id, live: false };
      const { baseline, notes } = padBasis(s, s.dealt);
      if (a.turn.status === "done") {
        const { plan, engine, manifest } = (a.turn.result ?? {}) as { plan?: EditPlan; engine?: unknown; manifest?: unknown };
        if (!plan) return settle(ended);
        // The receipt is the TURN's, not the plan's, so it is attached here.
        const candidate = { ...recalibrateFromPlan(baseline, notes, plan, nextId(s), a.at, a.ctx), engineRun: engineRunWith(engine, manifest) };
        return settle({ ...ended, engineNote: null, lost: null, candidate });
      }
      if (a.turn.status === "failed") {
        const why = a.turn.error?.message || "The recalibration failed. Nothing was changed.";
        return settle({ ...ended, engineNote: why, candidate: recalibrate(baseline, notes, nextId(s), a.at, a.ctx) });
      }
      // cancelled or orphaned: nothing came back, and nothing is staged.
      return settle(ended);
    }

    case "accept": {
      // RULE 3: accepting is the only thing that changes the baseline. The
      // notes that produced the candidate travel with it — they are answered.
      // A RESTORE was produced by no note on the pad, so it answers none of
      // them: the pad's notes and forced inputs stay for the next run.
      if (!s.candidate) return s;
      const o = owned({ ...s, dealt: s.dealt ?? a.digest });
      const v = a.override ? { ...s.candidate, override: a.override } : s.candidate;
      const answered = !v.restoredFrom;
      return settle({
        ...o,
        accepted: acceptInto(o.accepted, v),
        candidate: null,
        notes: answered ? [] : o.notes,
        forceRenders: answered ? [] : o.forceRenders,
        forceConclusions: answered ? [] : o.forceConclusions,
        digest: a.digest,
        dealt: s.dealt,
      });
    }

    case "restore": {
      // Only from rest: never while a run is starting or live (rule 2), and
      // never over a staged candidate — that would throw a run away unasked.
      if (s.phase !== "idle") return s;
      const { baseline, orphan } = padBasis(s, s.dealt);
      if (orphan) return s;
      const from = a.id === BASELINE.id ? BASELINE : s.accepted.find((v) => v.id === a.id);
      const candidate = from ? restoreAs(from, baseline, nextId(s), a.at) : null;
      return candidate ? settle({ ...s, candidate, lost: null, engineNote: null }) : s;
    }

    case "discard":
      return s.candidate ? settle({ ...s, candidate: null }) : s;
  }
}
