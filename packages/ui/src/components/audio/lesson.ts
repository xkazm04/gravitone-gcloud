// A LESSON - "when X, brief Y, because Z" - and the evidence it stands on (Phase 6, L65). Pure.
//
// v1 kept the law in three places (lib/sound/ledger.ts appendLesson, POST /api/sound/lessons,
// app/playground/hunt/Lesson.tsx): a lesson is NEVER saved without a human's confirm - an engine
// draft is a proposal - and when the engine cannot draft, the evidence is still filled from the
// map and the sentence is written by hand (`handLesson`). Both are kept. Upgraded:
//   · ONE count of the evidence. v1's engine path counted JUDGED takes (n = takes kept or
//     rejected) and its hand path counted HEARD leaves - so the same hunt signed two ways carried
//     two different n. Here both paths count the map (`evidenceOf`); the engine drafts the claim
//     and the techniques only, never a number (v1's own rule for the claim, kept for all of it).
//   · the confirm carries the evidence's KEY (`evidenceKey`): the door recounts the hunt and
//     refuses a draft signed over evidence that has since moved (a crown added or taken off in
//     another tab), with both counts in the sentence - what is saved is what the signer saw
//     (hitl-approval resume-after-decision).
//   · a cell of the strengths table may draft a lesson too (L66), held to the same evidence
//     floor the table draws (n < 3 is "waiting for evidence", not a finding to sign).
import { buildTree, type HuntNodeView } from "./hunt.ts";
import { MIN_N } from "./strengths.ts";

export type LessonKind = "music" | "sfx";
export type LessonSource = "triage" | "hunt";

export type LessonEvidence = {
  readonly n: number;
  readonly keepRate: number | null;
  readonly meanScore: number | null;
  readonly takeIds: readonly string[];
};

/** A lesson before a human signs it: an engine's draft, a hand draft, or a strengths cell's. */
export type LessonProposal = {
  readonly kind: LessonKind;
  readonly source: LessonSource;
  readonly provider: string | null;
  readonly huntId: string | null;
  readonly claim: string;
  readonly technique: readonly string[];
  readonly evidence: LessonEvidence;
};

export const CLAIM_MAX = 600;
/** Below this many judged takes a strengths cell is "waiting for evidence" (v1 triage cellView):
 *  the table's own floor, read from it, so the cell that draws pips is the cell refused here. */
export const EVIDENCE_FLOOR = MIN_N;

/* ── what a hunt measured ───────────────────────────────────────────────── */

export type HuntEvidence<N extends HuntNodeView = HuntNodeView> = {
  /** Leaves with a take to judge. */
  readonly heard: readonly N[];
  readonly winners: readonly N[];
  /** The axes the winners came from, most first: the lesson is tied to the axis that won. */
  readonly axes: readonly { readonly axis: string; readonly n: number }[];
  /** Techniques on winners, with how many heard losers carried the same one. */
  readonly techniques: readonly { readonly technique: string; readonly won: number; readonly lost: number }[];
  /** Each winner's newest take: what the lesson cites. */
  readonly takeIds: readonly string[];
};

export function evidenceOf<N extends HuntNodeView>(nodes: readonly N[]): HuntEvidence<N> {
  const heard = buildTree(nodes).leaves.filter((l) => l.state === "rendered");
  const winners = heard.filter((l) => l.winner);
  const losers = heard.filter((l) => !l.winner);
  const axisN = new Map<string, number>();
  for (const w of winners) axisN.set(w.axis, (axisN.get(w.axis) ?? 0) + 1);
  const tech = new Map<string, { won: number; lost: number }>();
  for (const w of winners) for (const t of w.technique) tech.set(t, { won: (tech.get(t)?.won ?? 0) + 1, lost: 0 });
  for (const l of losers)
    for (const t of l.technique) {
      const c = tech.get(t);
      if (c !== undefined) c.lost++;
    }
  return {
    heard,
    winners,
    axes: [...axisN].map(([axis, n]) => ({ axis, n })).sort((a, b) => b.n - a.n || a.axis.localeCompare(b.axis)),
    techniques: [...tech].map(([technique, v]) => ({ technique, ...v })).sort((a, b) => b.won - a.won || a.lost - b.lost),
    takeIds: winners.flatMap((w) => w.takeIds.slice(-1)),
  };
}

const rate = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 100) / 100);

/**
 * The lesson a hunt's map supports, its claim EMPTY: a lesson is a human's sentence, and an empty
 * box is more honest than a template pretending to be a finding. The engine's draft is this
 * with a claim (and its techniques, held to the kind's list) filled in.
 */
export function handLesson(hunt: { readonly id: string; readonly kind: LessonKind; readonly nodes: readonly HuntNodeView[] }, meanScore: number | null = null): LessonProposal {
  const e = evidenceOf(hunt.nodes);
  const providers = [...new Set(e.winners.map((w) => w.provider))];
  return {
    kind: hunt.kind,
    source: "hunt",
    provider: providers.length === 1 ? (providers[0] ?? null) : null,
    huntId: hunt.id,
    claim: "",
    technique: e.techniques.filter((t) => t.won > 0).map((t) => t.technique),
    evidence: { n: e.heard.length, keepRate: rate(e.winners.length, e.heard.length), meanScore, takeIds: e.takeIds },
  };
}

/** Why a hunt cannot be signed yet, or null when it can: a lesson is what the winners did. */
export function huntLessonBlock(nodes: readonly HuntNodeView[]): string | null {
  const e = evidenceOf(nodes);
  if (e.heard.length === 0) return "nothing heard yet: render and audition first";
  if (e.winners.length === 0) return "no crown yet: a lesson is what the winners did";
  return null;
}

/**
 * The evidence's two figures in the words of what was counted: a hunt's n is the leaves HEARD
 * and its rate the share CROWNED (`handLesson`); a strengths cell's n is the takes JUDGED and its
 * rate the share KEPT (`cellLesson`). The sign and the signed list read the same words.
 */
export const evidenceWords = (source: LessonSource): { readonly n: string; readonly rate: string } => (source === "hunt" ? { n: "heard", rate: "won" } : { n: "judged", rate: "kept" });

/** The evidence's identity: a confirm signed over another count is refused, never saved. */
export function evidenceKey(e: LessonEvidence): string {
  return `${e.n}|${e.keepRate ?? "-"}|${[...e.takeIds].sort().join(",")}`;
}

/* ── a strengths cell's proposal (L66's door) ──────────────────────────── */

export type CellEvidence = {
  readonly kind: LessonKind;
  readonly provider: string;
  readonly facet: string;
  readonly value: string;
  readonly n: number;
  readonly kept: number;
  readonly meanScore: number | null;
  readonly takeIds?: readonly string[];
};

/** A strengths cell as a lesson proposal, or the floor's refusal. Its claim is the signer's. */
export function cellLesson(c: CellEvidence): { readonly ok: true; readonly value: LessonProposal } | { readonly ok: false; readonly reason: string } {
  if (c.n < EVIDENCE_FLOOR) return { ok: false, reason: `${c.provider} · ${c.value}: waiting for evidence (n=${c.n}, the floor is ${EVIDENCE_FLOOR})` };
  return {
    ok: true,
    value: {
      kind: c.kind,
      source: "triage",
      provider: c.provider,
      huntId: null,
      claim: "",
      technique: c.facet === "technique" ? [c.value] : [],
      evidence: { n: c.n, keepRate: rate(c.kept, c.n), meanScore: c.meanScore, takeIds: [...(c.takeIds ?? [])] },
    },
  };
}

/* ── the sign ──────────────────────────────────────────────────────────── */

/**
 * A claim as the signer typed it, held to the contract before the door is asked: one sentence,
 * not empty, not a paragraph. The shape "when X, brief Y, because Z" is the prompt the form
 * shows; a claim that names no reason is refused, because a lesson without its "because" cannot
 * be checked against the next hunt.
 */
export function claimProblem(claim: string): string | null {
  const c = claim.trim();
  if (c === "") return "a lesson needs its sentence: when X, brief Y, because Z";
  if (c.length > CLAIM_MAX) return `one sentence, at most ${CLAIM_MAX} characters (this is ${c.length})`;
  if (!/\bbecause\b/i.test(c)) return "say why: a lesson without its because cannot be checked against the next hunt";
  return null;
}
