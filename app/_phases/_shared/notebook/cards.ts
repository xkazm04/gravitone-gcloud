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
  // A MECHANISM'S SUPPORT IS A CARD EDGE, and it was a hardcoded `[]`.
  //
  // types.ts explains the wound graph's blindness to the card class carrying
  // the thesis as a DATA problem: "run 1's `m-institutionalisation` is annotated
  // 'This is the video. Everything else is evidence for it.' and cites nothing,
  // so cutting every fact under it wounded nothing." True, and only half of it.
  // The other half is here: `dependsOn: []` meant that even once a run DID
  // author `Mechanism.evidence` or `steps[].evidence`, `buildCards` threw it
  // away before `woundsOf` could ever see it. The reasoned layer was traceable
  // and the researched layer was not, and fixing the fixture alone would not
  // have changed that.
  //
  // Deduped: a fact may support the mechanism as a whole AND one of its steps,
  // and counting it twice would make one descope report two missing ids.
  //
  // No mechanism in the shipped fixture cites anything, so this wounds nothing
  // TODAY. It is the difference between a graph that cannot read the edge and
  // one that has no edge to read.
  for (const m of nb.mechanisms) {
    cards.push({
      id: m.id, kind: "mechanism", dimension: CARD_DIMENSION[m.id] ?? UNTAGGED_DIMENSION_ID,
      title: m.name, detail: m.explains,
      dependsOn: [...new Set([...(m.evidence ?? []), ...(m.steps ?? []).flatMap((s) => s.evidence ?? [])])],
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
 *  carry the `untagged` dimension, which says what it is.
 *
 *  WHERE THE MIS-FILING BECOMES VISIBLE: three places, since `c7b2bd6`.
 *  `notebookIssues()` below reports it to the dev console on every page load and
 *  to `npm run check:notebook` in a terminal — and BOTH boards now draw it.
 *  research/ResearchTriageBoard.tsx and script/_matrix/MatrixCoverage.tsx call
 *  `columnsFor()` off the same card set, so an untagged card appears on both or
 *  neither; it can no longer be visible on one surface and invisible on the
 *  other. */
export function untaggedIds(nb: Notebook = NOTEBOOK): string[] {
  const ids = [
    ...nb.facts.map((f) => f.id),
    ...nb.mechanisms.map((m) => m.id),
    ...nb.reversals.map((r) => r.id),
  ];
  return ids.filter((id) => !CARD_DIMENSION[id]);
}

/* ──────────────── the graph is checked, and was assumed ──────────────────── */

/** The notebook is a graph held together by string ids, and nothing checked
 *  that the graph was real. Two failures, both silent:
 *
 *    · `woundsOf()` (research/scope.ts) wounds only when a dependency id is
 *      EXPLICITLY DESCOPED. A typo'd or deleted id is never in the `gone` set,
 *      so it never wounds anything — a stale reference and a healthy one are
 *      indistinguishable, and the safety graph answers with confidence.
 *    · `FACT_BY_ID` / `UNKNOWN_BY_ID` are `Object.fromEntries`, so a reused id
 *      overwrites the earlier row. The loser does not error; it vanishes. */
export type GraphIssueKind = "duplicate-id" | "dangling-ref" | "untagged" | "stale-tag";

/** Both ends of the broken edge, always. `from` holds the reference, `ref` is
 *  what it points at — an unresolvable id, or the one spent twice. */
export interface GraphIssue {
  kind: GraphIssueKind;
  from: string;
  ref: string;
  detail: string;
}

export function notebookIssues(nb: Notebook = NOTEBOOK): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const add = (kind: GraphIssueKind, from: string, ref: string, detail: string) =>
    issues.push({ kind, from, ref, detail });

  // ONE namespace, deliberately. Ids are quoted across sections with no type
  // tag — `restsOn: ["f-mnav", "m-treasury-flywheel"]` — so two sections may
  // not spend the same string, whatever their prefixes suggest.
  const owner = new Map<string, string>();
  const claim = (id: string, where: string) => {
    const prior = owner.get(id);
    if (prior)
      add("duplicate-id", where, id, `also declared by ${prior}. The by-id maps are built with Object.fromEntries: the later row wins and the earlier one disappears without an error.`);
    else owner.set(id, where);
  };
  nb.facts.forEach((f) => claim(f.id, "facts[]"));
  nb.mechanisms.forEach((m) => claim(m.id, "mechanisms[]"));
  nb.reversals.forEach((r) => claim(r.id, "reversals[]"));
  nb.unknowns.forEach((u) => claim(u.id, "unknowns[]"));
  (nb.obligations ?? []).forEach((o) => claim(o.id, "obligations[]"));
  CONCLUSIONS.forEach((c) => claim(c.id, "conclusions[]"));
  claim("steel-man", "steelMan");

  const factIds = new Set(nb.facts.map((f) => f.id));
  const cards = buildCards(nb);
  const cardIds = new Set(cards.map((c) => c.id));

  const edge = (
    from: string,
    field: string,
    refs: readonly (string | null | undefined)[] | undefined,
    universe: Set<string>,
    what: string,
  ) => {
    for (const r of refs ?? []) {
      if (r == null) continue;
      if (!universe.has(r))
        add("dangling-ref", `${from}.${field}`, r, `names no ${what} in this notebook. An id that resolves to nothing can never be descoped, so it can never wound what rests on it.`);
    }
  };

  // The edge woundsOf() actually reads.
  for (const c of cards) edge(c.id, "dependsOn", c.dependsOn, cardIds, "card");
  // And the same edges at their own, tighter universe. A mechanism's evidence
  // is now also a card edge (see buildCards), so the pass above would catch a
  // reference to nothing — but only "no such CARD". These must name a FACT, and
  // a mechanism citing a reversal id is a real mis-wiring that the card pass
  // would wave through. The rest of these edges become no card edge at all, so
  // this is the only place anything reaches them.
  for (const f of nb.facts) {
    edge(f.id, "contests", f.contests, factIds, "fact");
    edge(f.id, "qualifies", f.qualifies, factIds, "fact");
    edge(f.id, "derivedFrom", f.derivedFrom, factIds, "fact");
  }
  for (const m of nb.mechanisms) {
    edge(m.id, "evidence", m.evidence, factIds, "fact");
    (m.steps ?? []).forEach((s, i) => edge(m.id, `steps[${i}].evidence`, s.evidence, factIds, "fact"));
  }
  edge("steelMan", "restsOnAbsence", [nb.steelMan.restsOnAbsence], factIds, "fact");
  for (const u of nb.unknowns) edge(u.id, "about", u.about, factIds, "fact");
  for (const o of nb.obligations ?? []) edge(o.id, "about", o.about, factIds, "fact");
  for (const c of CONCLUSIONS) edge(c.id, "licensedBy", [c.licensedBy], factIds, "fact");
  nb.scaleConversions.forEach((s, i) => edge(`scaleConversions[${i}]`, "for", [s.for], factIds, "fact"));
  nb.analogyCandidates.forEach((a, i) => edge(`analogyCandidates[${i}]`, "for", [a.for], cardIds, "card"));
  edge("currency", "expiresFirst", nb.currency.expiresFirst, cardIds, "card");
  edge("currency", "durable", nb.currency.durable, cardIds, "card");

  for (const id of Object.keys(CARD_DIMENSION))
    if (!cardIds.has(id))
      add("stale-tag", "CARD_DIMENSION", id, `tags an id this notebook does not have. If the card was renamed, the tag is dead AND the card is now untagged.`);
  for (const id of untaggedIds(nb))
    add("untagged", "CARD_DIMENSION", id, `has no dimension. It carries "${UNTAGGED_DIMENSION_ID}" and renders in the Untagged column on both boards — a queue awaiting a domain, not a domain. Tag it in dimensions.ts::CARD_DIMENSION.`);

  return issues;
}

/** THE CHECK RUNS WHERE A DEVELOPER LOOKS. In the browser, in dev, once per
 *  module instantiation: a broken edge announces itself the moment the notebook
 *  is imported, rather than waiting for somebody to remember a script. Not in
 *  production, and not in Node — there `pipeline/check-notebook.mts` owns the
 *  report and this would only prefix it with noise.
 *
 *  IT IS NO LONGER THE WHOLE APPARATUS, and this comment used to say it was:
 *  "This repo has no test suite and declined to add one, so a module assertion
 *  and a script is the whole apparatus, on purpose." That was true when it was
 *  written. The repo now runs @playwright/test over `tests/golden-path/`, and
 *  `npm test` is inside `npm run verify` — so the justification for leaving the
 *  graph on a console line had expired without the comment noticing.
 *
 *  What each layer is FOR, now that there are three:
 *    · this console line — the fastest feedback there is, while you edit
 *    · `check:notebook` — the terminal report, and in the gate since a7be959
 *    · `tests/golden-path/notebook-graph.probe.spec.ts` — the layer neither of
 *      the other two has: it drives `notebookIssues` against DELIBERATELY BROKEN
 *      notebooks, so a checker that quietly stopped detecting anything is itself
 *      detected. A green check over a checker that cannot fail is the failure
 *      mode a clean fixture hides best. */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const found = notebookIssues();
  if (found.length)
    console.error(
      `NOTEBOOK GRAPH — ${found.length} broken edge(s). Run: npx tsx pipeline/check-notebook.mts\n` +
        found.map((i) => `  · [${i.kind}] ${i.from} → ${i.ref} — ${i.detail}`).join("\n"),
    );
}
