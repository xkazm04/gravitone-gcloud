// WHICH CARDS A STRIP RUN AUTHORS - the selection pipeline/strips/run.mts made from its
// flags before Phase 4, moved here so the CLI and the strip job's entry (lib/producers/strips.ts)
// select the same cards from the same words (a server module could not import a script). Pure, but for
// `loadApproaches`, which reads pipeline/strips/approaches.json.
//
// Kept from v1 to the letter: the lane and `--only` filter the approach cards; a
// `--replicas` approach gets a second card (`--r2`) that records what it replicates; an
// `--effort-arm` approach gets a low-effort card (`--low`); `--controls` adds one plain
// "house infographic" card per brief, which every approach must beat, and
// `--controls-only` authors nothing else.

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Approach, StripCard, StripLane, StripRunOptions } from "./types";

export type CardSelection = {
  readonly lane: StripLane | "all";
  readonly only: readonly string[];
  readonly replicas: readonly string[];
  readonly effortArm: readonly string[];
  readonly effort: string;
  readonly controls: boolean;
  readonly controlsOnly: boolean;
};

export const DEFAULT_SELECTION: CardSelection = { lane: "all", only: [], replicas: [], effortArm: [], effort: "high", controls: false, controlsOnly: false };

/**
 * Measured 2026-10-06: first authoring turns ran 6-38 min, and two intricate cards died at
 * a 40-min cap before reporting. 75 leaves headroom without hiding a hang (v1 run.mts).
 */
export const DEFAULT_OPTIONS: StripRunOptions = { rounds: 2, review: true, leonardo: true, authorTimeoutMin: 75 };

/** The approach cards, as pipeline/strips/approaches.json holds them. */
export function loadApproaches(root: string = process.cwd()): Approach[] {
  const doc = JSON.parse(readFileSync(path.join(root, "pipeline", "strips", "approaches.json"), "utf8")) as { approaches?: Approach[] };
  return Array.isArray(doc.approaches) ? doc.approaches : [];
}

/** The positive control: the "infographic post" every approach must beat. */
export const control = (lane: StripLane, kase: string): Approach => ({
  id: "CTRL",
  lane,
  case: kase,
  name: "House infographic (control)",
  medium: "svg",
  grammar: lane === "stat" ? "reflow" : "draw-on",
  density: "low",
  leonardo: "none",
  direction:
    lane === "stat"
      ? "The plain, correct baseline: flat light ground, one accent for the leader, a clean horizontal bar race in a neutral sans, year top right, source line. No theme, no texture, no metaphor."
      : "The plain, correct baseline: flat light ground, one accent, a clean labelled diagram of the causal steps in a neutral sans, steps appearing in order. No theme, no texture, no metaphor.",
  falsifier: "None intended: this card exists to prove the brief is legible and the harness works. If it fails its countable expectations, the brief or the harness is wrong.",
});

export const cardId = (a: Approach, suffix = ""): string => `${a.case.startsWith(`${a.lane}-`) ? a.case : `${a.lane}-${a.case}`}--${a.id === "CTRL" ? "ctrl" : a.id}${suffix}`;

export const blankCard = (a: Approach, id: string, effort: string, replicaOf?: string): StripCard => ({
  id,
  lane: a.lane,
  case: a.case,
  approach: a.id,
  ...(replicaOf ? { replicaOf } : {}),
  effort,
  status: "pending",
  rounds: 0,
  authorMs: 0,
  renderMs: 0,
  files: {},
});

export type Selected = { readonly card: StripCard; readonly approach: Approach };

/** The cards the flags select, in v1's order: controls first, then each approach with its replica and effort arm. */
export function selectCards(approaches: readonly Approach[], s: CardSelection): Selected[] {
  const out: Selected[] = [];
  const picked = approaches.filter((a) => (s.lane === "all" || a.lane === s.lane) && (!s.only.length || s.only.includes(a.id)));
  if (s.controls || s.controlsOnly) {
    const cases = [...new Map(picked.map((a) => [a.case, a.lane] as const)).entries()];
    for (const [kase, lane] of cases) {
      const c = control(lane, kase);
      out.push({ card: blankCard(c, cardId(c), s.effort), approach: c });
    }
  }
  if (!s.controlsOnly) {
    for (const a of picked) {
      out.push({ card: blankCard(a, cardId(a), s.effort), approach: a });
      if (s.replicas.includes(a.id)) out.push({ card: blankCard(a, cardId(a, "--r2"), s.effort, cardId(a)), approach: a });
      if (s.effortArm.includes(a.id)) out.push({ card: blankCard(a, cardId(a, "--low"), "low", cardId(a)), approach: a });
    }
  }
  return out;
}

/** The approach a card renders (a control is its brief's, made on the spot). */
export function approachOfCard(approaches: readonly Approach[], card: Pick<StripCard, "approach" | "lane" | "case">): Approach | undefined {
  if (card.approach === "CTRL") return control(card.lane, card.case);
  return approaches.find((a) => a.id === card.approach);
}
