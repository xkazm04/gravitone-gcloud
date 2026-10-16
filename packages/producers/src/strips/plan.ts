import type { Estimate } from "@gt/domain/estimate";
import type { EventData } from "@gt/domain/event";
import type { MissingStep, Outputs } from "@gt/kernel/job-core";

// THE STRIP RUN'S PLAN, PURE - which step each card needs next, read off the job's booked
// outputs and what the run's manifest says already landed. Absorbed from v1's per-card
// loop (pipeline/strips/run.mts `runCard`, before Phase 4) and kept to the letter:
//
//   round 0   author:<card>  ->  lint:<card>:r0  ->  render:<card>:r0
//   round n   fix:<card>:r<n> (after a failed lint or a failing gate) or review:<card>:r1
//             (a passing round 0 looks at its own contact sheet once) -> lint -> render
//
// and the four rules that decide when a card is settled:
//   - a turn that did not complete settles the card: on round 0 it is `author-failed`, on
//     a later round the last good render stands ("a failed fix keeps the last good render");
//   - a fix or review that changed nothing keeps the render it was shown;
//   - rounds continue only on failure (lint, a render error, or a gate: seek, legibility,
//     motion, length) and stop at `rounds`; a passing round >= 1 is the end;
//   - a control card (`CTRL`), or a run launched without review, skips the round-0 look.
//
// NEVER RE-SPEND, UPGRADED. v1's `--resume` skipped only `rendered` cards and authored
// every `pending` or `lint-failed` one again from scratch - a paid turn bought twice. Here a
// booked turn is never planned again (the plan IS the missing outputs, v1 MV), and a turn
// that LANDED without being booked - its strip.html copied into the card, then the process
// died, or a run from before Phase 4 - is adopted from the manifest instead of re-bought:
// strip.html on disk means the author turn was paid (forge's "a PNG on disk is generated"),
// and the manifest's `rounds` names the last fix round that landed. A card the manifest
// already settled with no job record (`rendered`, or `author-failed`, which was paid too)
// stays settled.

export type CardStatus = "pending" | "rendered" | "lint-failed" | "render-failed" | "author-failed";

/** One card as the plan needs it, read off run.json and the card's directory. */
export type CardView = {
  readonly id: string;
  /** The approach id, `CTRL` for a brief's positive control. */
  readonly approach: string;
  /** The card renders with a supporting image (its approach declares one and the run takes them). */
  readonly asset: boolean;
  /** strip.html sits in the card's directory: an author turn landed. */
  readonly html: boolean;
  /** The last fix round the manifest records as landed (v1 `card.rounds`). */
  readonly rounds: number;
  readonly status: CardStatus;
};

export type RunView = {
  readonly id: string;
  readonly status: "running" | "awaiting-triage" | "committed";
  readonly cards: readonly CardView[];
  /** Fix rounds after the first render (v1 `--rounds`, default 2). */
  readonly rounds: number;
  /** The round-0 contact-sheet review (v1: on unless `--no-review`; never on a control). */
  readonly review: boolean;
  /** The pre-call estimate of one supporting image (the imaging router's quote). */
  readonly assetUsd: number;
};

export type TurnKind = "author" | "fix" | "review";
export type CardStep =
  | { readonly kind: TurnKind; readonly card: string; readonly round: number; readonly name: string }
  | { readonly kind: "lint" | "render"; readonly card: string; readonly round: number; readonly name: string }
  | { readonly kind: "asset"; readonly approach: string; readonly name: string }
  | { readonly kind: "triage"; readonly name: string };

export const TRIAGE = "triage";

export const stepNames = {
  asset: (approach: string): string => `asset:${approach}`,
  author: (card: string): string => `author:${card}`,
  turn: (kind: "fix" | "review", card: string, round: number): string => `${kind}:${card}:r${round}`,
  lint: (card: string, round: number): string => `lint:${card}:r${round}`,
  render: (card: string, round: number): string => `render:${card}:r${round}`,
};

const STEP_RE = /^(author|fix|review|lint|render|asset):([^:]+)(?::r(\d+))?$/;

/** The step a name means; undefined for a name this producer never plans. */
export function parseStep(name: string): CardStep | undefined {
  if (name === TRIAGE) return { kind: "triage", name };
  const m = STEP_RE.exec(name);
  if (m === null) return undefined;
  const [, kind = "", id = "", r] = m;
  if (kind === "asset") return r === undefined ? { kind, approach: id, name } : undefined;
  if (kind === "author") return r === undefined ? { kind, card: id, round: 0, name } : undefined;
  if (r === undefined) return undefined;
  const round = Number(r);
  if (kind === "fix" || kind === "review") return round >= 1 ? { kind, card: id, round, name } : undefined;
  if (kind === "lint" || kind === "render") return { kind, card: id, round, name };
  return undefined;
}

/**
 * The estimate each step is admitted on (kernel job-core `next`). Measured, not modelled:
 * strips-r1 (2026-10-06, 41 priced cards, 170 seat turns) reported $3.19 and 879 s of
 * authoring per turn and 142 s of capture per round; strips-r1b (12 cards) $4.15 and 990 s.
 * One turn is priced at the first figure, banded by the two runs' extremes per card
 * divided by their turns. Lint and render are this machine's own work: free, not unpriced.
 */
export const TURN_ESTIMATE: Estimate = { seconds: 880, usd: 3.2, usdRange: [1.7, 6.8] };
export const LINT_ESTIMATE: Estimate = { seconds: 1, usd: 0 };
export const RENDER_ESTIMATE: Estimate = { seconds: 140, usd: 0 };
export const TRIAGE_ESTIMATE: Estimate = { seconds: 30, usd: 0 };

export function estimateOf(step: CardStep, view: Pick<RunView, "assetUsd">): Estimate {
  switch (step.kind) {
    case "author":
    case "fix":
    case "review":
      return TURN_ESTIMATE;
    case "lint":
      return LINT_ESTIMATE;
    case "render":
      return RENDER_ESTIMATE;
    case "asset":
      return { seconds: 30, usd: view.assetUsd };
    case "triage":
      return TRIAGE_ESTIMATE;
  }
}

/** The worst case of one card: its author turn, every fix round, a capture each, and its image. */
export function cardWorstUsd(rounds: number, asset: boolean, assetUsd: number): number {
  return (rounds + 1) * (TURN_ESTIMATE.usd ?? 0) + (asset ? assetUsd : 0);
}

/* ── The booked outputs this plan reads ───────────────────────────────────── */

const bool = (o: EventData | undefined, k: string): boolean | undefined => {
  const v = o?.[k];
  return typeof v === "boolean" ? v : undefined;
};

type Turn = { readonly ok: boolean; readonly changed: boolean };

/** A turn's booked outcome: did it leave a page, and did it change the one it was shown. */
export const turnOutput = (t: Turn & { readonly outcome: string }): EventData => ({ ok: t.ok, changed: t.changed, outcome: t.outcome });
export const lintOutput = (ok: boolean, findings: readonly string[]): EventData => ({ ok, findings: findings.slice(0, 12) });
/** `ok`: the capture ran; `pass`: every gate passed as well. */
export const renderOutput = (ok: boolean, pass: boolean, error?: string): EventData => ({ ok, pass, ...(error === undefined ? {} : { error }) });

function turnOf(outputs: Outputs, name: string): Turn | undefined {
  const o = outputs.get(name)?.value;
  if (o === undefined) return undefined;
  return { ok: bool(o, "ok") === true, changed: bool(o, "changed") !== false };
}

/** A turn landed on disk without being booked: the manifest records its round (see the header). */
const landed = (card: CardView, round: number): boolean => card.html && card.rounds >= round;

/** The card's next step, or null when it is settled. Pure over its view and the job's outputs. */
export function cardNext(card: CardView, outputs: Outputs, run: Pick<RunView, "rounds" | "review">): CardStep | null {
  const c = card.id;
  const reviewOn = run.review && card.approach !== "CTRL";
  let round: number;
  let turn: Turn | undefined = turnOf(outputs, stepNames.author(c));
  if (turn === undefined) {
    if (card.status === "rendered" || card.status === "author-failed") return null;
    if (!card.html) return { kind: "author", card: c, round: 0, name: stepNames.author(c) };
    // Adopted: start at the last round the manifest says landed, never at a paid turn.
    round = Math.min(card.rounds, run.rounds);
    turn = { ok: true, changed: true };
  } else {
    round = 0;
  }
  let rendered = false;
  for (;;) {
    if (!turn.ok) return null;
    if (round > 0 && !turn.changed && rendered) return null;
    const lint = outputs.get(stepNames.lint(c, round))?.value;
    if (lint === undefined) return { kind: "lint", card: c, round, name: stepNames.lint(c, round) };
    let kind: "fix" | "review";
    if (bool(lint, "ok") !== true) {
      rendered = false;
      if (round >= run.rounds) return null;
      kind = "fix";
    } else {
      const render = outputs.get(stepNames.render(c, round))?.value;
      if (render === undefined) return { kind: "render", card: c, round, name: stepNames.render(c, round) };
      rendered = bool(render, "ok") === true;
      const failing = bool(render, "pass") !== true;
      if (round >= run.rounds || (round >= 1 && !failing)) return null;
      if (round === 0 && !failing && !reviewOn) return null;
      kind = failing ? "fix" : "review";
    }
    const next = round + 1;
    const name = stepNames.turn(kind, c, next);
    const booked = turnOf(outputs, name);
    if (booked !== undefined) turn = booked;
    else if (landed(card, next)) turn = { ok: true, changed: true };
    else return { kind, card: c, round: next, name };
    round = next;
  }
}

/**
 * The missing steps, in the order the job performs them: each unsettled card's next step, card
 * by card in the manifest's order (so the first strips are whole before the last are begun),
 * its supporting image first when it needs one, then the triage flip once every card is settled.
 * v1 ran three cards at once; a job performs one step at a time, and the lot report says why.
 */
export function planStrips(view: RunView, outputs: Outputs): MissingStep[] {
  if (view.status === "committed") return [];
  const out: MissingStep[] = [];
  const assets = new Set<string>();
  for (const card of view.cards) {
    const step = cardNext(card, outputs, view);
    if (step === null) continue;
    const approach = card.approach;
    const asset = stepNames.asset(approach);
    if (card.asset && step.kind === "author" && !outputs.has(asset) && !assets.has(asset)) {
      assets.add(asset);
      out.push({ name: asset, estimate: estimateOf({ kind: "asset", approach, name: asset }, view) });
    }
    out.push({ name: step.name, estimate: estimateOf(step, view) });
  }
  if (out.length === 0 && !outputs.has(TRIAGE)) out.push({ name: TRIAGE, estimate: TRIAGE_ESTIMATE });
  return out;
}
