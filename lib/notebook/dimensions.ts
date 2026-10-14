// The columns a reviewer reasons in, and which card belongs to which.
//
// Taken from `pipeline/RESEARCH-PROMPT.md` Phase 1, which already defines the
// causal domains a market/economics run must cover — so the review columns are
// the research brief's own checklist, not a fresh invention.
//
// THE SCAR: the prompt scopes that table honestly ("for a market/economics
// topic, that is at minimum…") and this file dropped the scoping on the way in,
// freezing one topic's answer as the universal set. A run about a bill, a
// breach, a game post-mortem derives its own five-to-seven domains and then has
// nowhere to put them: the board can only offer it a price column. So the seven
// below are the INCUMBENT set — the worked instance for a market topic, the
// default when a run does not derive its own — and not the only possible set.
//
// Anti-shape: a `DimensionId` union that a new topic's columns cannot be
// expressed in, and a comment that names the scoping while dropping it.

/** The market/economics seven. Named as such so nothing reads them as universal. */
export type IncumbentDimensionId =
  | "the-number"
  | "flows"
  | "actors"
  | "macro"
  | "politics"
  | "counter-case"
  | "conclusions";

/** Where cards land when nobody tagged them. See UNTAGGED_DIMENSION. */
export const UNTAGGED_DIMENSION_ID = "untagged";

/** Incumbent ids, the untagged bucket, or a derived topic's own column id. The
 *  `(string & {})` arm is what makes the union open while editors still offer
 *  the seven — a derived column is a first-class id, not a cast. */
export type DimensionId = IncumbentDimensionId | typeof UNTAGGED_DIMENSION_ID | (string & {});

export interface Dimension {
  id: DimensionId;
  label: string;
  /** What this dimension is for, in the reviewer's terms. */
  purpose: string;
  /** THE SPLIT. `emptyMeans` fired on column OCCUPANCY and said one thing —
   *  an accusation — because it could only imagine one reason a column is
   *  empty. Two conditions were sharing one string:
   *
   *    · the run did not look here                → a gap, say so loudly
   *    · there is nothing here to look at         → a finding, say so calmly
   *
   *  A correctly-empty column that renders an accusation trains the reviewer to
   *  ignore the accusation, which is the whole alarm gone. Both strings are
   *  required on every column, incumbent or derived (Guardrail 3): a column
   *  whose author could not say what a legitimate absence looks like has not
   *  finished designing the column. */
  emptyByOmission: string;
  /** What an honestly empty column means here. If the answer is "this can never
   *  legitimately be empty", say that — it is a real answer (see counter-case). */
  notApplicable: string;
  /** @deprecated Use `emptyByOmission` / `notApplicable`. Kept for a column
   *  that carries only the old field; the seven incumbents no longer set it.
   *  Read it through `emptyMeansOf()`. */
  emptyMeans?: string;
}

/** The deprecated single string, resolved. For consumers not yet migrated —
 *  they get the omission reading, which is what the old field always was.
 *
 *  THE SPLIT WAS UNREACHABLE UNTIL THE INCUMBENTS STOPPED SETTING `emptyMeans`.
 *  All seven carried it, six of them byte-identical to their own
 *  `emptyByOmission`, and this function prefers it — so every consumer got the
 *  undifferentiated string and `notApplicable` had no reader anywhere in the
 *  repo. The design above was fully built into the type and fully dead. */
export function emptyMeansOf(d: Dimension): string {
  return d.emptyMeans ?? d.emptyByOmission;
}

/** The market/economics columns — the worked instance, and the default set. */
export const MARKET_DIMENSIONS: Dimension[] = [
  { id: "the-number", label: "The number", purpose: "What the price actually did, and over what window.",
    emptyByOmission: "No measured baseline — every claim downstream is unanchored.",
    notApplicable: "This topic has no headline quantity. Rare here, and if it is true the tension has to be carried by a mechanism instead — say which." },
  { id: "flows", label: "Flows & plumbing", purpose: "Who is buying and selling, through what mechanism, and whether it behaves as assumed.",
    emptyByOmission: "The demand story is unexamined.",
    notApplicable: "Nothing moves through a mechanism here — the subject is not a market. Check that against the tension before believing it." },
  { id: "actors", label: "Structural actors", purpose: "Entities large enough to move this, and what governs their behaviour.",
    // THE SENTENCE THIS REPLACES: "Nobody is named — the story has no agents."
    // It read an unnamed story as a failed one, which inverts the polarity of a
    // whole discipline's strongest material: in fraud and consumer work "nobody
    // is named" is not a gap, it is the job — it is what you have instead of a
    // legal budget, and it is the difference between analysis and a trial. The
    // omission reading now asks about the SEARCH, not about the naming.
    emptyByOmission: "No actor was looked for — nobody asked who is large enough to move this, or what governs them.",
    notApplicable: "The search ran and named nobody: the behaviour is structural, or naming is not available, or the reviewer is deliberately not naming. That is a finding — see the boundary card class in conclusions.ts — not a hole." },
  { id: "macro", label: "Macro", purpose: "Rates, currency, liquidity, correlation with other assets.",
    emptyByOmission: "The asset is being explained in isolation from the market it trades in.",
    notApplicable: "The subject is genuinely insulated from the wider cycle. State why — it is a claim, and a strong one." },
  { id: "politics", label: "Politics & regulation", purpose: "What changed, and whether it was actually implemented.",
    emptyByOmission: "Policy is being assumed to work, or assumed not to.",
    notApplicable: "Nothing here is governed or was proposed to be. Uncommon — absence of rules is usually itself the policy." },
  { id: "counter-case", label: "The counter-case", purpose: "The strongest argument that nothing unusual is happening.",
    emptyByOmission: "DANGEROUS — without this the script can only produce a polemic (RESEARCH-PROMPT §Phase 6).",
    notApplicable: "There is no legitimately-empty reading of this column. If no counter-case exists, the finding is that nobody found one — which is a fact about the search, and it goes here." },
  { id: "conclusions", label: "Conclusions", purpose: "What the dimensions add up to. Reasoned, not researched — no direct sources, so every one is OFF until you let it in.",
    emptyByOmission: "Nothing synthesised. The script will report findings without saying what they mean.",
    notApplicable: "Never. A run that synthesised nothing has not finished; empty-because-you-gated-them-out is scope, not this." },
];

/** The incumbent default. Existing consumers import this name and get the
 *  market seven, exactly as before — the openness is in `dimensionsFor()`. */
export const DIMENSIONS: Dimension[] = MARKET_DIMENSIONS;

/** THE DRAIN, DISCONNECTED FROM THE ALARM.
 *
 *  `DEFAULT_DIMENSION` used to be `the-number` — so the price column was at once
 *  a domain column with a real meaning AND the bucket every untagged card fell
 *  into. It therefore could never be empty, and a column that can never be empty
 *  can never mean anything: `emptyMeans` was wired to a drain. Worse in the
 *  other direction, four seats' orphaned cards all landed in the price column,
 *  where a reviewer looking for the demand story would never find them.
 *
 *  An untagged card now says it is untagged. This bucket is a SYSTEM column, not
 *  a domain: it carries no purpose and holds nothing on merit. Emptying it is
 *  the goal; hiding it is what we did before.
 *
 *  BOTH BOARDS RENDER IT (2026-08-14) — through `columnsFor` below, which
 *  shipped with zero callers and has two now: research/ResearchTriageBoard.tsx
 *  and script/_matrix/MatrixCoverage.tsx. An untagged card is on the screen of
 *  the reviewer who can fix it, not only in `notebookIssues()`'s dev-console
 *  report and `npx tsx pipeline/check-notebook.mts`. Those still run; the column
 *  is the second place the same fact shows up, not a replacement for the first.
 *
 *  Anti-shape: pointing the fallback at any column that also means something. */
export const UNTAGGED_DIMENSION: Dimension = {
  id: UNTAGGED_DIMENSION_ID,
  label: "Untagged",
  purpose: "Cards nobody filed. Not a domain — a queue. Every card here is invisible to the reviewer who needs it.",
  emptyByOmission: "Every card is filed. This is the only column whose emptiness is the success condition.",
  notApplicable: "Never — this column is always applicable; it is simply usually empty.",
};

/** The columns to render, for a topic and a run.
 *
 *  `derived` is a topic's own five-to-seven domains once the researcher records
 *  them (RESEARCH-PROMPT Phase 1 → `domains[]`); absent, the incumbent market
 *  set stands in, which is what every existing run gets.
 *
 *  `untagged` APPEARS ONLY WHEN SOMETHING IS ACTUALLY UNTAGGED. That condition
 *  is the caller's to compute, and both callers compute it the same way — from
 *  the cards they are about to render (`cards.some(c => c.dimension ===
 *  UNTAGGED_DIMENSION_ID)`) rather than from the notebook — so a card cannot be
 *  visible on one board and invisible on the other. `untaggedIds(nb)` in
 *  cards.ts answers the same question at notebook level and is what the checker
 *  uses; the two agree because `buildCards` assigns the bucket from the same
 *  table. A healthy notebook gets no eighth column.
 *
 *  TWO CALLERS: research/ResearchTriageBoard.tsx and
 *  script/_matrix/MatrixCoverage.tsx. Anything that renders a column list should
 *  come through here rather than mapping `DIMENSIONS` directly — that is what
 *  left an untagged card renderable by nothing.
 *
 *  A column returned from here may omit the deprecated `emptyMeans` (the
 *  untagged bucket does). Read it through `emptyMeansOf()`, never `d.emptyMeans`
 *  — the raw field is `string | undefined` and prints as nothing. */
export function columnsFor(opts: { derived?: Dimension[]; hasUntagged?: boolean } = {}): Dimension[] {
  const base = opts.derived?.length ? opts.derived : DIMENSIONS;
  return opts.hasUntagged ? [...base, UNTAGGED_DIMENSION] : base;
}

/** Which dimension each card belongs to. Hand-assigned for the Bitcoin run;
 *  a real run would have the researcher tag them at write time.
 *
 *  This table has to be updated when a follow-up writes new facts. It was not:
 *  the three facts round 1 added (f-m2-divergence, f-whale-absorb,
 *  f-midtier-distribute) had no entry, hit the `?? "the-number"` fallback in
 *  buildCards, and were filed under the price column — where a reviewer looking
 *  for the demand story would never find them. They are tagged now, and the
 *  fallback no longer lands anywhere that means something. See UNTAGGED above.
 *
 *  Typed to the INCUMBENT ids on purpose: this is the market run's tagging, and
 *  the open `DimensionId` must not buy a typo the same green tsc. */
export const CARD_DIMENSION: Record<string, IncumbentDimensionId> = {
  "f-ath": "the-number", "f-nov-crash": "the-number", "f-now": "the-number", "f-drawdown": "the-number",
  "f-etf-lag": "flows", "f-etf-absorbed": "flows", "f-lth-distribution": "flows", "f-supply-2pct": "counter-case",
  "f-whale-absorb": "flows", "f-midtier-distribute": "flows",
  "f-mnav": "actors", "f-mstr-drop": "actors", "f-mstr-sold": "actors", "f-mstr-defence": "counter-case",
  "f-correlation": "macro", "f-yields": "macro", "f-macro-cause": "macro", "f-m2-divergence": "macro",
  "f-sbr": "politics", "f-sbr-unbuilt": "politics", "f-genius": "politics",
  "m-etf-plumbing": "flows", "m-treasury-flywheel": "actors", "m-institutionalisation": "macro",
  "r1": "flows", "r2": "actors", "r3": "politics", "r4": "macro",
  "steel-man": "counter-case",
};
