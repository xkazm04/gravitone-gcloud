// THE NOTEBOOK CONTRACT — the nouns Research produces and Script consumes.
//
// This is the one shape both steps agree on, which is why it lives in _shared
// rather than inside either step. A notebook conforms to
// pipeline/NOTEBOOK-SCHEMA.md; the fixtures beside this file are the real run at
// pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/, retyped.
//
// Render-side shapes (beats, checks, script renders) are NOT here — they belong
// to the Script step and live in app/_phases/script/types.ts. A type used by one
// step is that step's business.

export type Confidence = "high" | "medium" | "low";

/** HOW a claim is known — the axis `confidence` has never been able to say.
 *
 *  This is the run's recurrence item, and the reason it is written in a type
 *  rather than in advice: `pipeline/runs/2026-08-11-.../NOTES.md:79` already
 *  wrote "require primary sources for load-bearing quantitative claims" after
 *  run 1 shipped an all-aggregator source list — and nothing consumed it, so
 *  run 2 shipped the same way. A rule with no field to live in is a comment.
 *
 *  Interest is NOT unreliability: `vendor` is `low` by default because a
 *  third-party research shop sells the conclusion, but an income disclosure or
 *  a regulator's own reference price is `self-published`/`primary` AND
 *  interested AND authoritative. One scalar could not say that, which is how
 *  the ladder demoted a regulation's own number. */
export type EvidenceClass =
  | "primary" // the record itself: a filing, the statute, the chain, the disclosure
  | "secondary" // reporting or analysis about a primary record
  | "aggregator" // a site that restates others' numbers (run 1's whole source list)
  | "vendor" // a third-party research shop selling the conclusion
  | "self-published" // the subject's own account of itself — authoritative AND interested
  | "protected"; // true, verified by the researcher, not citable by the reader

/** WHAT KIND of claim it is. The notebook checked where every claim came from
 *  and never what kind of claim it was, so an announced reserve and a built one
 *  were the same shape — and "we asked, they did not reply" had nowhere to go
 *  but a research gap, where it reads as the researcher's omission rather than
 *  the subject's refusal. `absence` is the container for that. */
export type FactKind =
  | "found" // a claim about the world, sourced
  | "derived" // computed from other facts — carries its inputs and method
  | "absence" // a record established NOT to exist — carries searchScope
  | "utterance" // someone said it; separates "the ministry said it" from "it is true"
  | "plan"; // announced, not yet done — separates announced from installed capacity

/** One source, singular. The scar: run 1 comma-joined three publications into
 *  the singular `source` string, so "invezz, crypto.news, intellectia" rendered
 *  as one source-shaped blob and nothing could count, class, or locate them.
 *  Anti-shape: a second source appended to `source` with a comma. */
export interface FactSource {
  name: string;
  evidenceClass: EvidenceClass;
  /** Page, line, article, tx hash, timestamp — whatever makes it findable. */
  locator?: string;
  /** Interest is NOT unreliability. A disclosure is self-published AND authoritative. */
  interested?: boolean;
}

/** A dated, sourced, one-line claim. `loadBearing` + `low` confidence is the
 *  single most dangerous combination a notebook can hold (schema § facts).
 *
 *  Everything below `source` is optional in the TYPE and required in the schema
 *  document for new notebooks: the run-1 fixture beside this file is the control
 *  for every adopted edit, and a control you had to rewrite to compile is not a
 *  control. */
export interface Fact {
  id: string;
  claim: string;
  loadBearing: boolean;
  /** @deprecated Use `sources[]`. Kept so the control fixture still compiles. */
  source: string;
  sources?: FactSource[];
  kind?: FactKind;
  confidence: Confidence;
  /** Why the confidence is what it is — stated, never implied. */
  confidenceNote?: string;
  /** When the RESEARCHER last checked. Staleness, never the event. Run 1 used
   *  one field for three meanings — checked-on, happened-on, and covers — which
   *  is how a 30-day window was compared to a 60-day one. */
  asOf: string;
  /** When the thing described happened. */
  eventDate?: string;
  /** The window the quantity covers. NOT asOf. */
  period?: string;
  /** BTC · % · wafer starts · $m. The word "unit" appeared nowhere in the
   *  methodic, and `f-midtier-distribute` called 77,800 "slightly more than"
   *  270,000 with `loadBearing: true`, into three rendered scripts. */
  unit?: string;
  /** What a percentage is a percentage OF. */
  denominator?: string;
  /** Who the claim is about, when that matters for exposure. */
  subject?: string;
  /** `kind: "absence"` only — the register searched, the period, the request
   *  reference. An absence without its search scope is an assertion. */
  searchScope?: string;
  /** `kind: "derived"` only. */
  derivedFrom?: string[];
  method?: string;
  /** THE SIDEWAYS EDGE. Fact ids this fact contradicts. The wound graph modelled
   *  support only, so descoping one of a contradicting pair silently RESOLVED a
   *  live source conflict and reported no wound — a safety graph blind to the
   *  one relation that matters is worse than none, because it produces
   *  confidence. Descoping one of a contested pair must WOUND. */
  contests?: string[];
  /** Fact ids this one qualifies or bounds — the measured/inferred pair that
   *  lost its binding when the two halves landed in different columns. */
  qualifies?: string[];
  note?: string;
}

/** BUT / THEREFORE / AND THEN. Shared because both a mechanism chain and a beat
 *  chain are the same craft object: a sequence whose links are causal or aren't.
 *  "AND THEN" is the wiki-timeline defect and renders as one.
 *
 *  UNCHANGED, deliberately. This is the SCRIPT layer's vocabulary — script/types.ts
 *  re-exports it for `Beat.connector` — and the one law's script-layer bar stays
 *  at zero AND THEN. Nothing below relaxes it. */
export type Connector = "BUT" | "THEREFORE" | "AND THEN" | null;

/** The NOTEBOOK layer's connector, which is a longer list by exactly one word.
 *
 *  `TRANSFER` is a typed non-causal step: a deduction, a hand-off, a recognition
 *  event. It exists because the one law was derived from ARGUMENTS and was being
 *  applied to LEDGERS — a five-step royalty chain lost the two parties whose
 *  shares are the subject, because neither BUT nor THEREFORE can describe a
 *  transfer and the rule says find the missing link or drop it. There is no
 *  missing link in a deduction. Run 1's own `notebook.json:207` and `:222` carry
 *  two bare ANDs inside `mechanisms[].chain`, unnoticed, under a bar permitting
 *  zero — the vocabulary ran out and the researcher wrote AND anyway.
 *
 *  TRANSFER is notebook vocabulary ONLY. It is not a render licence: when these
 *  steps become beats, the script layer still holds them to `Connector` above.
 *  Anti-shape: a fake THEREFORE extorted from a ledger to pass the link check —
 *  "the wiki-timeline defect wearing the law's own uniform". */
export type ChainConnector = "BUT" | "THEREFORE" | "TRANSFER";

/** One link of a mechanism chain, with its own support.
 *
 *  `evidence` is per-STEP because the step is the unit a fact can be cut out
 *  from underneath. Anti-shape: a chain step asserting a causal or transfer
 *  claim that no fact supports — form validated, support unchecked. */
export interface ChainStep {
  text: string;
  /** Absent on the first step: there is nothing yet to connect to. */
  connector?: ChainConnector;
  /** Fact ids supporting THIS step. */
  evidence?: string[];
}

/** The beat chain, authored during research.
 *
 *  `chain: string[]` is the legacy form ("THEREFORE the buying stops" — the
 *  connector inlined in the prose and parsed back out at render time by
 *  sections/H.tsx::chainLink); `steps: ChainStep[]` is the target and the only
 *  form that can carry evidence.
 *
 *  DEVIATION, recorded rather than hidden: ADOPTION pinned this as
 *  `chain: string[] | ChainStep[]`. That union does not compile — sections/H.tsx
 *  exposes `chainLink(step: string)` and Argument.tsx maps `chain` straight into
 *  it, so a union widens the callback parameter to `string | ChainStep` and TS
 *  rejects it. Rule 0 outranks the pin's spelling: the fixture is the control
 *  and is not rewritten to make a type fit. The two fields carry the same
 *  sequence; `steps` wins where both are present, and a mechanism migrated to
 *  `steps` keeps `chain` as the rendered prose until the renderer is taught the
 *  typed form. Anti-shape: the two drifting apart — a step added to one and not
 *  the other. */
export interface Mechanism {
  id: string;
  name: string;
  chain: string[];
  /** The typed chain: same sequence, with the connector lifted out of the prose
   *  and each link carrying the facts that support IT. This is where a TRANSFER
   *  goes, and where the wound graph reads its mechanism edges from. */
  steps?: ChainStep[];
  /** The mechanism-level support. Its absence is why the wound graph was blind
   *  to the card class carrying the thesis: run 1's `m-institutionalisation` is
   *  annotated "This is the video. Everything else is evidence for it." and
   *  cites nothing, so cutting every fact under it wounded nothing. The reasoned
   *  layer was traceable and the researched layer was not — backwards. */
  evidence?: string[];
  explains: string;
  needsAnalogy: boolean;
  note?: string;
}

export interface Reversal {
  id: string;
  obviousReading: string;
  whyWrong: string;
  mechanismId: string | null;
  evidence: string[];
  escalation: string;
  note?: string;
}

/** The strongest case against the verdict.
 *
 *  `provenance` is REQUIRED in the schema for new notebooks and exists because
 *  the run-1 reference shipped a steel-man that was ASSEMBLED from evidence
 *  already in hand while its own research_gaps admitted the search was never
 *  run — and then ticked its own D-honesty box twice. A constructed opposition
 *  is bounded by the author's prior; a found one is not, and a reader who
 *  cannot tell which they are looking at cannot weigh either.
 *
 *  `found-adjacent` is news-reaction's L2 refinement: the real result of a
 *  second-pass search was the right shape, the wrong date, and an interested
 *  holder — which is neither "found" nor "constructed", and E1's three
 *  discharges had no name for it.
 *
 *  Anti-shape (and this field's own origin story): the prompt mandated
 *  `steel_man.provenance` in two places while no type or schema section
 *  declared it — two parallel editors, one told to require the mark and one
 *  never told to add the field. A mandate pointing at an absent field is worse
 *  than no mandate: it reads as enforced. Caught by conflict-osint at L2. */
export interface SteelMan {
  claim: string;
  evidence: string[];
  statement: string;
  whyInclude: string;
  provenance?: "found" | "found-adjacent" | "constructed";
  /** When constructed: the fact id of the dated absence it rests on. */
  restsOnAbsence?: string;
}

/** Something the research could not settle.
 *
 *  `id` is load-bearing infrastructure, not decoration. The Script step scores
 *  each render against these (script/constraints.ts), and that ledger used to
 *  address them BY ARRAY POSITION. When follow-up round 1 resolved one unknown
 *  and the array shrank, every stored index silently pointed one slot to the
 *  left and the last one pointed at nothing — which crashed the step. An
 *  identity that survives its neighbours being deleted is the fix. */
export interface Unknown {
  id: string;
  what: string;
  why: string;
  /** What the script may NOT say. The load-bearing field.
   *
   *  UNCHANGED, and the prohibition force is not up for negotiation: this was
   *  called the best field in the schema by four seats. What was wrong was the
   *  traffic it carried — established absences and required ranges were being
   *  filed in a deny-list-shaped field, which inverted their polarity. Those
   *  two classes move out (see `kind: "absence"` on Fact, and `Obligation`
   *  below); the deny-list itself is not diluted. */
  impact: string;
  /** Fact ids this constraint is about. The constraint was written global and
   *  the defect is per-figure: "never a figure" muzzled every number in the
   *  notebook when one price series was the disputed one. */
  about?: string[];
  /** Set when a later round answered it. The unknown is KEPT rather than
   *  deleted: a constraint that used to bind is part of the notebook's history,
   *  and deleting it is what broke the ledger in the first place. */
  resolvedBy?: string;
}

/** What the script MUST say — the other half of `Unknown`, beside it rather
 *  than inside it.
 *
 *  A deny-list alone produces an evasive video. "State the range $X–$Y, name the
 *  unknown term, attribute the width to it" is a must-say, and its only home was
 *  a field whose entire purpose is taking sentences away — so the strongest
 *  material a researcher had to offer arrived phrased as a restriction on
 *  herself. `must` is the obligation; the render gate checks it was discharged,
 *  the way `impact` is checked for being violated.
 *
 *  Anti-shape: an obligation written as a negation ("do not omit the range") to
 *  smuggle a must-say through the deny-list. */
export interface Obligation {
  id: string;
  /** The sentence the render owes the viewer. */
  must: string;
  why: string;
  /** Fact ids this obligation is about — same per-figure scoping as `Unknown`. */
  about?: string[];
  /** Set when a later round discharged it permanently (the figure was settled,
   *  so the range no longer needs stating). Kept, never deleted — same reason. */
  resolvedBy?: string;
}

export type Fit = "excellent" | "good" | "poor";

export interface EngineFit {
  engine: string;
  label: string;
  fit: Fit;
  why: string;
  recommended?: boolean;
  /** Set when this fit was actually rendered — links to a ScriptRender id. */
  renderId?: string;
  /** What a WRONG render of this material through this engine costs.
   *
   *  `fit` is one scalar and answers only "does the material fit the shape" —
   *  so an engine that fits EXCELLENTLY and misleads is unrepresentable today.
   *  The demonstrations: an anchor ladder whose rungs are concepts is a gift and
   *  the same ladder whose rungs are cohorts of people lands on a joke; a
   *  mechanism engine on an attack chain renders a tutorial. Both scored `good`,
   *  and the catalogue never asked what a wrong render costs.
   *
   *  Anti-shape: demoting `fit` to carry the warning. That hides the engine from
   *  selection instead of arming the person selecting it. */
  hazard?: string;
}

/** A number made felt. `for` is the fact id — the arithmetic field was the only
 *  concrete-assignment field WITHOUT one (`analogy_candidates` has had `for`
 *  since run 1), so nothing could check the felt version against the claim it
 *  restates. Three qualifier drops and one subject-class promotion walked the
 *  sanctioned pipeline into a spoken script because of it.
 *
 *  RULE (stated in the schema, enforced at the render gate): the felt version
 *  may not promote the claim's SUBJECT CLASS — an address cohort does not become
 *  "people", and "people" does not become "people who believed in it" — and may
 *  not drop a qualifier the fact carries ("in risk-on conditions", "~2% of
 *  supply"). Anti-shape: a felt line that is more vivid than the fact permits
 *  and cannot be traced back to it. */
export interface ScaleConversion {
  /** Fact id. Optional in the TYPE only so run 1's six unlinked conversions
   *  still compile; required for new notebooks. A conversion with no `for` is
   *  uncheckable by construction. */
  for?: string;
  raw: string;
  felt: string;
  kind?: "cash" | "non-cash" | "count" | "ratio";
}

/** A position held against the verdict that the script must state fairly —
 *  and, when the subject is a named party, the party's own answer.
 *
 *  It was declared with no fields and consumed by nothing, which by the schema's
 *  own admission test means it did not belong. It is kept rather than deleted
 *  because a fraud or corruption topic needs a right-of-reply home, and because
 *  the strongest counter in run 1 sat here as a bare string
 *  (`notebook.json:355` — the four-year-cycle reading, which disproves the
 *  notebook's own `tension: high`) wired to nothing.
 *
 *  It is NOT the steel-man: `steelMan` is singular and is the best case against
 *  the verdict; this array holds the positions of identified holders, which may
 *  be several and may each need attributing. `string` is the legacy form.
 *
 *  Opt-in asymmetry: this is evidence-class material, not a conclusion — it is
 *  in by default like a fact, and the approach/refusal card it carries is the
 *  one card the board may not descope. */
export interface CounterPosition {
  position: string;
  /** WHO holds it. Two independent holders collapsed into one singular
   *  steel-man is how a right of reply gets averaged away. */
  holder: string;
  /** Fact ids. Without these the position cannot downgrade a tension, and a
   *  counter that cannot affect anything is decoration. */
  evidence: string[];
  /** Their words, unparaphrased, when the position is a party's own answer. */
  statementVerbatim?: string;
  /** Where the statement was made or the request was filed. */
  locator?: string;
}

export interface Notebook {
  id: string;
  topic: string;
  question: string;
  verdict: string;
  researched: string;
  researcher: string;
  templateIntent: string;
  subjectDomain: string[];
  tension: {
    expectation: string;
    reality: string;
    whyItIsATension: string;
    strength: string;
  };
  facts: Fact[];
  mechanisms: Mechanism[];
  reversals: Reversal[];
  steelMan: SteelMan;
  scaleConversions: ScaleConversion[];
  analogyCandidates: { for: string; analogy: string; quality: string }[];
  candidateQuestions: string[];
  counterPositions: string[] | CounterPosition[];
  unknowns: Unknown[];
  /** The must-say half of the honesty layer. Optional in the TYPE because run 1
   *  predates it; a notebook whose unknowns imply a range and carries no
   *  obligation is a notebook that will render around the number. */
  obligations?: Obligation[];
  engineFit: EngineFit[];
  currency: {
    halfLife: string;
    why: string;
    expiresFirst: string[];
    durable: string[];
    advice: string;
  };
  sources: string[];
  /** What the run did NOT do. A notebook claiming no gaps did not look hard
   *  enough — so the UI must be able to render this non-empty. */
  researchGaps: string[];
}
