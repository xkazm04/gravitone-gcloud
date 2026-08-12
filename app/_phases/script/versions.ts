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
}

function budgetOf(impact: Record<string, Record<string, Usage>>) {
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
};

/** The mocked transform. Deterministic, and deliberately unable to invent prose:
 *  a `custom` note changes no seconds at all, because nothing here can read it.
 *  Saying so is better than moving a bar by a made-up amount. */
export function recalibrate(base: Version, notes: Note[], id: string, at: number): Version {
  const byCard = new Map<string, NoteKind[]>();
  for (const n of notes) byCard.set(n.cardId, [...(byCard.get(n.cardId) ?? []), n.kind]);

  const impact: Record<string, Record<string, Usage>> = {};
  for (const r of RENDERS) {
    const src = base.impact[r.id] ?? {};
    const next: Record<string, Usage> = {};
    for (const [cardId, u] of Object.entries(src)) next[cardId] = { ...u };

    for (const [cardId, kinds] of byCard) {
      const cur: Usage = next[cardId] ?? { kind: "unused", seconds: 0, beats: [] };

      if (kinds.includes("descope")) {
        next[cardId] = {
          kind: "cut",
          seconds: 0,
          beats: [],
          why: "descoped by your note — removed from every render in this recalibration",
        };
        continue;
      }
      if (kinds.includes("more-focus")) {
        next[cardId] =
          cur.kind === "spoken"
            ? { ...cur, seconds: Math.round(cur.seconds * 1.6) }
            : // Nothing used it, and you asked for focus — so it has to be brought
              // IN, at a slot sized to the render rather than a flat number.
              { kind: "spoken", seconds: Math.max(3, Math.round(RENDER_BY_ID[r.id].durationS * 0.06)), beats: ["new"] };
        continue;
      }
      if (kinds.includes("less-focus") && cur.kind === "spoken") {
        next[cardId] = { ...cur, seconds: Math.max(2, Math.round(cur.seconds * 0.55)) };
        continue;
      }
      // move-earlier / move-later / custom change no weight here.
    }
    impact[r.id] = next;
  }

  return {
    id,
    label: `Recalibration ${id.replace(/^v/, "")}`,
    basedOn: base.id,
    notes,
    createdAt: at,
    impact,
    budget: budgetOf(impact),
  };
}

/** Notes whose intent this prototype cannot act on, so the UI can say so rather
 *  than imply the bars moved because of them. */
export function inertNotes(notes: Note[]) {
  return notes.filter((n) => n.kind === "custom" || n.kind === "move-earlier" || n.kind === "move-later");
}

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
