// THE NOTEBOOK, FLATTENED INTO REVIEWABLE CARDS.
//
// Shared rather than research-owned: Step 1 scopes these, Step 2's impact matrix
// uses the same list as its rows. Two steps disagreeing about what "a card" is
// would make the matrix unreadable against the board that produced it.

import { CONCLUSIONS, falsifierOf, falsifierText, type ConclusionSubject, type Falsifier, type Leap } from "./conclusions";
import { CARD_DIMENSION, UNTAGGED_DIMENSION_ID, type DimensionId } from "./dimensions";
import { NOTEBOOK } from "./notebook";
import type { Notebook } from "./types";

export type CardKind = "fact" | "mechanism" | "reversal" | "steel-man" | "conclusion";

export interface Card {
  id: string;
  kind: CardKind;
  dimension: DimensionId;
  title: string;
  detail?: string;
  /** Facts only. */
  loadBearing?: boolean;
  confidence?: "high" | "medium" | "low";
  source?: string;
  asOf?: string;
  /** Ids this card needs in order to stand. Descoping any of them wounds it. */
  dependsOn: string[];
  /** True where the library forbids removal outright. */
  required?: boolean;
  requiredWhy?: string;
  /** Conclusions only — see conclusions.ts for why these are mandatory. */
  leap?: Leap;
  precedent?: { domain: string; note: string };
  /** The falsifier's PROSE, always a string. A card is a render-side object and
   *  the tiles print this field directly; handing the UI a union it would have
   *  to narrow is how an object gets stringified into a viewer's face. The typed
   *  form travels beside it. */
  falsifiableBy?: string;
  /** The typed falsifier, when the conclusion has one. Absent on the legacy
   *  string form — and that absence is itself the finding worth showing. */
  falsifier?: Falsifier;
  /** Who the claim is about. Carried onto the card because the exposure axis has
   *  to be visible where the gating decision is actually made. */
  subject?: ConclusionSubject;
  useFor?: string;
  /** 😈 the hottest take — see conclusions.ts */
  hottest?: boolean;
  /** Held and not printed — see conclusions.ts. Renders as the withholding. */
  withheld?: boolean;
  /** Conclusions start OUT of scope. The asymmetry with facts is the safeguard. */
  optIn?: boolean;
}

/** Flatten the notebook into reviewable cards, carrying the dependency graph
 *  the fixture already encodes (reversals cite fact ids and a mechanism). */
export function buildCards(nb: Notebook = NOTEBOOK): Card[] {
  const cards: Card[] = [];

  for (const f of nb.facts) {
    cards.push({
      id: f.id, kind: "fact", dimension: CARD_DIMENSION[f.id] ?? UNTAGGED_DIMENSION_ID,
      title: f.claim, detail: f.note, loadBearing: f.loadBearing,
      confidence: f.confidence, source: f.source, asOf: f.asOf, dependsOn: [],
    });
  }
  for (const m of nb.mechanisms) {
    cards.push({
      id: m.id, kind: "mechanism", dimension: CARD_DIMENSION[m.id] ?? UNTAGGED_DIMENSION_ID,
      title: m.name, detail: m.explains, dependsOn: [],
    });
  }
  for (const r of nb.reversals) {
    cards.push({
      id: r.id, kind: "reversal", dimension: CARD_DIMENSION[r.id] ?? UNTAGGED_DIMENSION_ID,
      title: r.obviousReading, detail: r.whyWrong,
      dependsOn: [...r.evidence, ...(r.mechanismId ? [r.mechanismId] : [])],
    });
  }
  for (const c of CONCLUSIONS) {
    cards.push({
      id: c.id, kind: "conclusion", dimension: "conclusions",
      title: c.claim, detail: c.reasoning,
      dependsOn: c.restsOn,
      leap: c.leap, precedent: c.precedent, useFor: c.useFor,
      falsifiableBy: falsifierText(c), falsifier: falsifierOf(c) ?? undefined,
      subject: c.subject, hottest: c.hottest, withheld: c.withheld,
      optIn: true,
    });
  }
  cards.push({
    id: "steel-man", kind: "steel-man", dimension: "counter-case",
    title: nb.steelMan.claim, detail: nb.steelMan.statement,
    dependsOn: nb.steelMan.evidence,
    required: true,
    requiredWhy:
      "The steel-man is mandatory (NOTEBOOK-SCHEMA §steel_man). Without it the script can only produce a polemic, and Engine D cannot be run honestly at all.",
  });
  return cards;
}

/** Notebook ids with no entry in CARD_DIMENSION. They used to land in
 *  DEFAULT_DIMENSION — the price column — where they were both invisible to the
 *  reviewer who needed them and load-bearing enough to keep that column
 *  permanently non-empty, so its `emptyMeans` alarm could never fire. They now
 *  land in the `untagged` bucket, which says what it is.
 *
 *  Exported so the mis-filing is checkable rather than invisible; a follow-up
 *  that writes facts without tagging them is exactly how this happens. Feed it
 *  to `columnsFor({ hasUntagged })` so the bucket appears only when it has to. */
export function untaggedIds(nb: Notebook = NOTEBOOK): string[] {
  const ids = [
    ...nb.facts.map((f) => f.id),
    ...nb.mechanisms.map((m) => m.id),
    ...nb.reversals.map((r) => r.id),
  ];
  return ids.filter((id) => !CARD_DIMENSION[id]);
}
