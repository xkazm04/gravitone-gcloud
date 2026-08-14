// SCRIPT VERSIONS — feedback in, a recalibrated set of renders out.
//
// The loop this models: you read the matrix, you stack notes against individual
// research tracks ("more focus", "descope completely", "bring it earlier"), and
// then you recalibrate ONCE against all of them. Note-by-note editing is what
// this exists to avoid — a script rewritten per comment is a script pulled in
// six directions, and the creator never sees the aggregate they actually asked
// for.
//
// ─── what is real here and what is mocked ──────────────────────────────────
//
// Real: the note model, the aggregation, the one-at-a-time rule, the version
// history, and the OVERRUN arithmetic (below).
//
// Mocked: the recalibration itself. A production build sends the notes and the
// notebook to a model and gets new beats back. Here the transform is a
// deterministic function of the note kind, and it is labelled as simulated
// everywhere it surfaces. It does NOT rewrite beat text — so a recalibrated
// version can be compared by weight, which is exactly what Coverage and the
// Spend bar are for, and cannot be read as prose, which is why Candidates and
// Tracks stay on the baseline.
//
// The honest constraint: a render's runtime is FIXED. Asking for more focus
// everywhere does not make the video longer, it makes it over-committed — so
// the recalibration reports an overrun rather than quietly rescaling everyone's
// seconds to fit. A plan that does not fit is a finding, not a rounding error.

import { IMPACT, type Usage } from "./impact";
import { RENDERS, RENDER_BY_ID } from "./renders";

export type NoteKind =
  | "more-focus"
  | "less-focus"
  | "descope"
  | "move-earlier"
  | "move-later"
  | "custom";

export const NOTE_KINDS: { kind: NoteKind; label: string; hint: string }[] = [
  { kind: "more-focus", label: "Can have more focus", hint: "give it more of the runtime — or bring it in if no render uses it" },
  { kind: "less-focus", label: "Spends too long here", hint: "cut it back, keep it" },
  { kind: "descope", label: "Descope completely", hint: "out of every render" },
  { kind: "move-earlier", label: "Bring into the beginning", hint: "same weight, earlier in the running order" },
  { kind: "move-later", label: "Push it later", hint: "same weight, later in the running order" },
  { kind: "custom", label: "Something else…", hint: "free text — no weight change can be simulated from it" },
];

export const KIND_LABEL: Record<NoteKind, string> = Object.fromEntries(
  NOTE_KINDS.map((k) => [k.kind, k.label]),
) as Record<NoteKind, string>;

export interface Note {
  id: string;
  cardId: string;
  kind: NoteKind;
  /** Only meaningful on `custom`; otherwise the kind carries the meaning. */
  text?: string;
  at: number;
}

export interface Version {
  id: string;
  label: string;
  /** null on the baseline. */
  basedOn: string | null;
  /** The notes that produced it. Empty on the baseline. */
  notes: Note[];
  createdAt: number;
  impact: Record<string, Record<string, Usage>>;
  /** Per render: attributed seconds vs the runtime available. */
  budget: Record<string, { attributed: number; duration: number; overrunS: number }>;
  /** Notes the recalibration REFUSED, and why. A rebalance that can quietly do
   *  what the triage board forbids is not a rebalance, it is a bypass. */
  refusals: Refusal[];
  /** Two notes on one track that cannot both hold. */
  conflicts: Conflict[];
  /** Cards still spoken whose supporting evidence this version removed. */
  unsupported: Unsupported[];
  /** WHICH ENGINE PRODUCED THIS.
   *
   *  The `simulated` label on the pad is derived from this field rather than
   *  hand-removed: a version built by the model says so, a version built by the
   *  fallback transform says so, and neither can be mistaken for the other by
   *  editing a string. A label you delete when you believe the wiring is done is
   *  a label that lies the first time the wiring falls back. */
  engine: "model" | "simulated";
  /** Set on `engine: "model"` — the beats the edit plan produced, per render.
   *  Absent on a simulated version, which re-weights without rewriting text. */
  beats?: Record<string, import("./types").Beat[]>;
  /** The model's own account of what it did and would not do. */
  summary?: string;
  modelRefusals?: { note: string; why: string }[];
  /** WHAT THE TURN ACTUALLY COST. Absent on a simulated version — see EngineRun. */
  engineRun?: EngineRun;
}

/** The engine's own account of the turn that produced a version.
 *
 *  Every field is optional because the CLI is not obliged to report any of them,
 *  and the rule this type exists to hold is that **an unreported cost is
 *  unknown, never zero**. A version with no `engineRun` at all did not make a
 *  model call; a version whose `engineRun.costUsd` is absent made one and was
 *  not told what it cost. Those are different facts and the surfaces say so
 *  differently. */
export interface EngineRun {
  /** Which engine. "local-claude-code" today; the field exists so a second one
   *  cannot arrive silently. */
  kind: string;
  model?: string;
  /** The CLI session, for anyone reading the run back out of `~/.claude`. */
  sessionId?: string;
  costUsd?: number;
  durationMs?: number;
  /** How much prompt the run was billed for. The one number that says whether a
   *  payload change actually reduced anything. */
  promptChars?: number;
}

/** Take an engine block off the wire and keep only what is actually a number or
 *  a string. A cost that arrived as `null`, `"0.4"` or `NaN` is not a cost, and
 *  admitting it here would put a fabricated figure on a spend line. */
export function engineRunOf(raw: unknown): EngineRun | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string") return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    kind: r.kind,
    model: str(r.model),
    sessionId: str(r.sessionId),
    costUsd: num(r.costUsd),
    durationMs: num(r.durationMs),
    promptChars: num(r.promptChars),
  };
}

const usd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : n >= 0.01 ? 3 : 4)}`;

const secs = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** One line of receipt for a version, or null where there is nothing to report.
 *
 *  Three distinct answers, deliberately not collapsed into one:
 *    · null          — this version was not produced by a run in this app at all
 *                      (the original renders). Absence, shown as absence.
 *    · "no model call" — the simulated transform produced it. It cost nothing
 *                      because nothing ran, which is not the same as costing 0.
 *    · the receipt   — and inside it, any figure the engine did not report reads
 *                      as "not reported", never as zero. */
export function receiptOf(v: Version): string | null {
  if (!v.basedOn) return null;
  if (v.engine !== "model") return "simulated locally — no model call, so nothing to bill";
  if (!v.engineRun) return "the engine returned a plan but reported nothing about the run";
  const r = v.engineRun;
  return [
    r.costUsd === undefined ? "cost not reported" : usd(r.costUsd),
    r.durationMs === undefined ? "duration not reported" : secs(r.durationMs),
    r.promptChars === undefined ? null : `${Math.round(r.promptChars / 1000)}k prompt chars`,
    r.model ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A note that was not applied. */
export interface Refusal {
  cardId: string;
  kind: NoteKind;
  why: string;
}

/** Two instructions on one track that cannot both hold. */
export interface Conflict {
  cardId: string;
  kinds: NoteKind[];
  applied: NoteKind;
  why: string;
}

/** A turn left arguing from evidence this version cut.
 *
 *  Severity mirrors the scope layer's wound graph (`research/scope.ts`) rather
 *  than inventing a second vocabulary: `broken` = nothing it rests on survived,
 *  `weakened` = some did. The first UAT fix only reported `broken`, so cutting
 *  all three facts under a reversal that also cites a mechanism reported
 *  nothing — the mechanism counted as a survivor and the turn looked fine. */
export interface Unsupported {
  cardId: string;
  lost: string[];
  severity: "broken" | "weakened";
}

/** Attributed seconds against the runtime available, per render.
 *
 *  `attributed` sums each card's SHARE of the beats that state it, so it is
 *  bounded by the runtime and `overrunS` means what it says. It used to sum a
 *  full beat duration per card — 1.96x the reversal chain's runtime, 2.80x the
 *  adjudication's — so every version was drawn "over budget" by hundreds of
 *  seconds, baseline included. See impact.ts::splitAcross.
 *
 *  WHAT IT MEASURES, AND WHAT IT CANNOT SEE. This is over-COMMITMENT — have more
 *  seconds been promised to cards than the render has to give — which is the
 *  question the simulated path can answer at all, because that path moves card
 *  weights and never touches a beat. On the model path a chain can also run long
 *  in a way this misses: a render's hook, question, promise and close rest on no
 *  card, so up to `unattributedS` of extra chain length is absorbed here before
 *  the number moves. Measuring that instead means measuring the CHAIN, which
 *  lives in `AppliedRender.seconds` and would have to be threaded through
 *  `recalibrate.ts` — a different number with a different name, not a correction
 *  to this one. */
export function budgetOf(impact: Record<string, Record<string, Usage>>) {
  const out: Version["budget"] = {};
  for (const r of RENDERS) {
    const attributed = Object.values(impact[r.id] ?? {}).reduce((n, u) => n + u.seconds, 0);
    out[r.id] = {
      attributed,
      duration: r.durationS,
      overrunS: Math.max(0, attributed - r.durationS),
    };
  }
  return out;
}

export const BASELINE: Version = {
  id: "baseline",
  label: "Baseline",
  basedOn: null,
  notes: [],
  createdAt: 0,
  impact: IMPACT,
  budget: budgetOf(IMPACT),
  refusals: [],
  conflicts: [],
  unsupported: [],
  engine: "simulated",
};

export function usageIn(v: Version, renderId: string, cardId: string): Usage {
  return v.impact[renderId]?.[cardId] ?? { kind: "unused", seconds: 0, beats: [] };
}

export function totalIn(v: Version, cardId: string) {
  return RENDERS.reduce((n, r) => n + usageIn(v, r.id, cardId).seconds, 0);
}

export function coverageIn(v: Version, renderId: string, cardIds: string[]) {
  const spoken = cardIds.filter((id) => usageIn(v, renderId, id).kind === "spoken");
  const cut = cardIds.filter((id) => usageIn(v, renderId, id).kind === "cut");
  const seconds = spoken.reduce((n, id) => n + usageIn(v, renderId, id).seconds, 0);
  const b = v.budget[renderId];
  return {
    spoken: spoken.length,
    cut: cut.length,
    unused: cardIds.length - spoken.length - cut.length,
    seconds,
    unattributedS: Math.max(0, (b?.duration ?? 0) - seconds),
    overrunS: b?.overrunS ?? 0,
  };
}
