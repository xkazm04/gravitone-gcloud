// THE TRANSLATION TABLE — every source's own verdict words, read into the
// Board's one vocabulary (approve | reject | null) and written back out.
//
// Pure, and in one file, because this table IS the Board's correctness: an
// adapter that read "keep" as approve but wrote approve as "approved" would
// pass every screen test and corrupt the source on the first key press. The
// node-lane probe (tests/golden-path/board.probe.spec.ts) asserts each row in
// both directions without a DOM or a disk.

import type { VerdictRecord } from "@/lib/foundry/types";
import type { ExtractVerdictRecord } from "@/lib/foundry/extract/types";
import type { TrainingVerdict } from "@/lib/foundry/training/types";
import type { ProofState } from "@/lib/themes";
import type { SlotStatus } from "@/lib/publish/types";

import type { BoardVerdict } from "./types";

/* ── cull + extract: keep | reject, absent = undecided ───────────────────── */
// lib/foundry/types.ts:158 and lib/foundry/extract/types.ts:259. Undecided is
// the ABSENCE of a key (store.ts putVerdicts drops anything else), so `null`
// on the Board writes as a deleted key, never as a third word.

export function fromKeep(rec: { verdict: "keep" | "reject" } | undefined | null): BoardVerdict {
  if (!rec) return null;
  return rec.verdict === "keep" ? "approve" : rec.verdict === "reject" ? "reject" : null;
}

export function toKeep(v: BoardVerdict): "keep" | "reject" | undefined {
  return v === "approve" ? "keep" : v === "reject" ? "reject" : undefined;
}

/** The whole-map write both foundry routes take (PUT replaces the map), with
 *  one key changed. Returns a NEW map; the input is the fresh read. */
export function withCullVerdict(
  map: Record<string, VerdictRecord>,
  key: string,
  v: BoardVerdict,
  reasons: readonly string[] = [],
  note: string | null = null,
  at: string = new Date().toISOString(),
): Record<string, VerdictRecord> {
  const next = { ...map };
  const word = toKeep(v);
  if (!word) {
    delete next[key];
    return next;
  }
  const written = encodeNote(v === "reject" ? reasons : [], note);
  next[key] = { verdict: word, at, ...(written ? { note: written } : {}) };
  return next;
}

export function withExtractVerdict(
  map: Record<string, ExtractVerdictRecord>,
  key: string,
  v: BoardVerdict,
  at: string = new Date().toISOString(),
): Record<string, ExtractVerdictRecord> {
  const next = { ...map };
  const word = toKeep(v);
  if (!word) delete next[key];
  else next[key] = { verdict: word, at };
  return next;
}

/* ── reasons, carried in the cull's free-text note ───────────────────────── */
// The cull's VerdictRecord has a `note` and no reasons field, and the store
// keeps the note verbatim (store.ts putVerdicts). A reject's axes ride on it as
// a leading `reasons: style, subject` line so the record stays readable by a
// human opening verdicts.json and the Board can read them back.

const REASONS_LINE = /^reasons:\s*([^\n]*)\n?/;

export function encodeNote(reasons: readonly string[], note: string | null): string | undefined {
  const head = reasons.length ? `reasons: ${reasons.join(", ")}` : "";
  const body = note?.trim() ?? "";
  const out = [head, body].filter(Boolean).join("\n");
  return out || undefined;
}

export function decodeNote(note: string | undefined | null): { reasons: string[]; note: string | null } {
  if (!note) return { reasons: [], note: null };
  const m = REASONS_LINE.exec(note);
  if (!m) return { reasons: [], note };
  const reasons = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rest = note.slice(m[0].length).trim();
  return { reasons, note: rest || null };
}

/* ── dojo: approve | reject | null — the Board's own words ──────────────── */
// lib/foundry/training/types.ts: `TrainingVerdicts` is already this
// vocabulary; the mapping is the identity, stated so the table is complete.

export const fromTraining = (v: TrainingVerdict | null | undefined): BoardVerdict => (v === "approve" || v === "reject" ? v : null);
export const toTraining = (v: BoardVerdict): TrainingVerdict | null => v;

/* ── proof: pending | approved | rejected ────────────────────────────────── */
// lib/themes.ts:47. Pending is a stored word here, not an absence.

export function fromProof(s: ProofState): BoardVerdict {
  return s === "approved" ? "approve" : s === "rejected" ? "reject" : null;
}
export function toProof(v: BoardVerdict): ProofState {
  return v === "approve" ? "approved" : v === "reject" ? "rejected" : "pending";
}

/* ── adoption: one pointer among N renders ───────────────────────────────── */
// app/_phases/script/candidates/adoption.ts — `renderId` is a pointer, `""` is
// an explicit clear, absent is never-adopted. A candidate is approved exactly
// when the pointer names it; nothing about the others is recorded, so they are
// undecided rather than rejected.

export function fromAdoption(stored: string | undefined, candidate: string): BoardVerdict {
  return stored && stored === candidate ? "approve" : null;
}

/** The record an adoption decision writes, or `undefined` for "nothing to
 *  write" (clearing a candidate that is not the adopted one). Reject is not
 *  here: it has no native writer (the caller refuses it). */
export function toAdoption(stored: string | undefined, candidate: string, v: "approve" | null): string | undefined {
  if (v === "approve") return candidate;
  return stored === candidate ? "" : undefined;
}

/* ── alternative: exactly one active plate per scene ─────────────────────── */
// app/_phases/frames/alternatives/alts.ts — `activeId` is the cut's picture.

export const fromAlternative = (activeId: string | null, altId: string): BoardVerdict => (activeId === altId ? "approve" : null);

/* ── triage: kept | cut, with a default that is not a decision ───────────── */
// app/_phases/research/scope.ts:39 `stateOf`. A card with no explicit entry is
// in its DEFAULT (facts kept, conclusions not taken) and nobody decided that.
// Once the creator CONFIRMS the board the whole scope is their decision, and
// every card reads as one.

export interface TriageCardState {
  descoped: boolean;
  liked: boolean;
  deepen: boolean;
}

export function fromTriage(explicit: TriageCardState | undefined, effective: TriageCardState, confirmed: boolean): BoardVerdict {
  if (!explicit && !confirmed) return null;
  return effective.descoped ? "reject" : "approve";
}

/** The scope entry a triage decision writes; `undefined` deletes the entry (U),
 *  which returns the card to its default. A card that also carries a like or a
 *  deepen keeps its entry with the default `descoped`, because those two are
 *  the creator's too and deleting the entry would erase them. */
export function toTriage(
  current: TriageCardState | undefined,
  fallback: TriageCardState,
  v: BoardVerdict,
): TriageCardState | undefined {
  if (v === null) {
    if (!current || (!current.liked && !current.deepen)) return undefined;
    return { ...current, descoped: fallback.descoped };
  }
  return { ...(current ?? fallback), descoped: v === "reject" };
}

/* ── publish: a slot that missed or failed waits for a human ─────────────── */
// The brief's HTTP contract: approve = PATCH {status:"scheduled", publishAt},
// reject = DELETE (status cancelled, never a hard delete). A slot only reads as
// DECIDED when it carries the trace of having missed — `missedAt` or an
// `error` — and has moved on; a plain scheduled slot was never a question.

export interface SlotLike {
  status: SlotStatus;
  missedAt: string | null;
  error: string | null;
}

/** `undefined` = this slot is not a Board item at all. */
export function fromSlot(s: SlotLike): BoardVerdict | undefined {
  if (s.status === "missed" || s.status === "failed") return null;
  const wasQuestion = Boolean(s.missedAt || s.error);
  if (!wasQuestion) return undefined;
  if (s.status === "cancelled") return "reject";
  return "approve";
}

/** One hour from `now`: where an approved missed slot is put back. */
export const rescheduleAt = (now: Date = new Date()): string => new Date(now.getTime() + 60 * 60 * 1000).toISOString();
