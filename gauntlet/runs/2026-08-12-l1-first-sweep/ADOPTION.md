# ADOPTION — canonical shapes, pinned before any edit

`/gauntlet adopt` on `VERDICT.md`. Four editors work in parallel on disjoint files. **This file is
the single source of truth for every shared shape**, pinned by the orchestrator first so two editors
cannot invent two versions of `evidence_class`.

Backlog items 1–11 are in scope. **Item 12 (Gauntlet's own instruments) is deliberately excluded** —
it is a separate pass, because an instrument edited in the same breath as the thing it measures has
no independent reading.

## Rule 0 — additive, not breaking

Every new field is **optional in TypeScript** and **required in the schema document for new
notebooks**. Reason: the Bitcoin fixture is the control, and a control you had to rewrite to compile
is not a control. `npx tsc --noEmit` must stay green at every step.

## Rule 1 — the Bitcoin control

Re-running the reference topic must produce the same notebook **except** where a finding named the
original wrong. Exactly three changes are expected and required:

1. `f-midtier-distribute` — the comparison is arithmetically false (77,800 called *"slightly more
   than"* 270,000, over *"the same 60-day window"* the sibling fact dates at 30 days). It gains
   `unit`/`period` and the false clause goes.
2. `notebook.json:207`, `:222` — two bare `AND` links inside `mechanisms[].chain`, under a bar
   permitting zero. They become typed `TRANSFER` steps if they are transfers, or gain their missing
   link.
3. `c-reserve-was-the-product` — gains `subject: {names: "state"}` and a falsifier flagged as binding
   the wrong clause.

**A control that preserves bugs is measuring the wrong thing** (Guardrail 10). Anything else that
moves is a regression.

## Rule 2 — the ten guardrails bind every edit

From `VERDICT.md` § Strengths as guardrails. The three most likely to be broken by these edits:

- **Opt-in asymmetry is untouchable.** No new card class may default into scope. Any new class
  declares which side of the asymmetry it lives on.
- **`unknowns[].impact` keeps its prohibition force.** E8 adds an obligation sibling; it does not
  dilute the deny-list.
- **Preserve verbatim** through any relabelling: `politics`' *"and whether it was actually
  implemented"* and `flows`' *"whether it behaves as assumed"* — praised independently by 8+ seats.

---

## Canonical shape 1 — `Fact` (E4)

```ts
export type EvidenceClass =
  | "primary"        // the record itself: a filing, the statute, the chain, the disclosure
  | "secondary"      // reporting or analysis about a primary record
  | "aggregator"     // a site that restates others' numbers (the reference run's whole source list)
  | "vendor"         // a third-party research shop selling the conclusion
  | "self-published" // the subject's own account of itself — authoritative AND interested
  | "protected";     // true, verified by the researcher, not citable by the reader

export type FactKind =
  | "found"      // a claim about the world, sourced
  | "derived"    // computed from other facts — carries its inputs and method
  | "absence"    // a record established NOT to exist — carries searchScope
  | "utterance"  // someone said it; separates "the ministry said it" from "it is true"
  | "plan";      // announced, not yet done — separates announced from installed capacity

export interface FactSource {
  name: string;
  evidenceClass: EvidenceClass;
  /** Page, line, article, tx hash, timestamp — whatever makes it findable. */
  locator?: string;
  /** Interest is NOT unreliability. A disclosure is self-published AND authoritative. */
  interested?: boolean;
}

export interface Fact {
  id: string;
  claim: string;
  loadBearing: boolean;
  /** @deprecated Use `sources[]`. Kept so the control fixture still compiles. */
  source: string;
  sources?: FactSource[];
  kind?: FactKind;
  confidence: Confidence;
  confidenceNote?: string;
  /** When the RESEARCHER last checked. Staleness, never the event. */
  asOf: string;
  /** When the thing described happened. */
  eventDate?: string;
  /** The window the quantity covers. NOT asOf. */
  period?: string;
  /** BTC · %  · wafer starts · $m. The word "unit" appeared nowhere in the methodic. */
  unit?: string;
  /** What a percentage is a percentage OF. */
  denominator?: string;
  /** Who the claim is about, when that matters for exposure. */
  subject?: string;
  /** kind: "absence" only — the register searched, the period, the request reference. */
  searchScope?: string;
  /** kind: "derived" only. */
  derivedFrom?: string[];
  method?: string;
  /** THE SIDEWAYS EDGE. Fact ids this fact contradicts. Descoping one of a
   *  contested pair must WOUND, never silently resolve the conflict. */
  contests?: string[];
  /** Fact ids this one qualifies or bounds. */
  qualifies?: string[];
  note?: string;
}
```

## Canonical shape 2 — `Mechanism` (E5, P6)

```ts
/** TRANSFER is new and is the P6 repair: a typed non-causal step — a deduction,
 *  a hand-off, a recognition event. The one law was derived from ARGUMENTS and
 *  was being applied to LEDGERS; a royalty flow lost the two parties whose
 *  shares are the subject because neither BUT nor THEREFORE could describe a
 *  transfer. TRANSFER is NOTEBOOK vocabulary only — the script-layer bar stays
 *  at zero AND THEN (Guardrail 9). */
export type ChainConnector = "BUT" | "THEREFORE" | "TRANSFER";

export interface ChainStep {
  text: string;
  connector?: ChainConnector;   // absent on the first step
  evidence?: string[];          // fact ids supporting THIS step
}

export interface Mechanism {
  id: string;
  name: string;
  /** string[] is the legacy form and still compiles; ChainStep[] is the target. */
  chain: string[] | ChainStep[];
  /** The mechanism-level support. Its absence is why the wound graph was blind
   *  to the card class carrying the thesis. */
  evidence?: string[];
  explains: string;
  needsAnalogy: boolean;
  note?: string;
}
```

## Canonical shape 3 — `Conclusion` additions (E6)

```ts
export interface ConclusionSubject {
  names: "none" | "org" | "living-person" | "state";
  who?: string;
}

export type FalsifierKind = "document" | "record" | "measurement" | "event";

export interface Falsifier {
  test: string;
  kind: FalsifierKind;
  /** "whole-claim", or the clause id it actually binds. A compound claim may NOT
   *  discharge the requirement by falsifying its checkable half — demonstrated
   *  four times independently on c-reserve-was-the-product. */
  binds: "whole-claim" | string;
}
```

Rules keyed to `subject` (enforced in the gate, stated in the schema):
- `names !== "none"` → falsifier `kind` must be `document` or `record`.
- `names !== "none"` → leap capped at `moderate` unless a filed action or published admission is in
  `restsOn`.
- **`unhinged` is redefined by DISTANCE, not by kind** — *"the largest leap the cards permit"*. A
  tier *defined* as a motive claim and a rule requiring falsifiability are mutually exclusive by the
  file's own two sentences, forty lines apart.
- New `useFor: "boundary"` + `withheld?: true` — *"the mechanics are established and the intent is
  not, and that is the finding"* becomes a first-class, gateable, wound-able object. **It defaults
  OUT of scope like every conclusion** (Guardrail 1).

## Canonical shape 4 — `Unknown` split (E8)

```ts
export interface Unknown {
  id: string; what: string; why: string;
  /** UNCHANGED. What the script may NOT say. Prohibition force is a guardrail. */
  impact: string;
  /** The constraint is per-figure, not global. */
  about?: string[];
  resolvedBy?: string;
}

/** NEW, beside unknowns — what the script MUST say. A deny-list alone produces
 *  an evasive video: "state the range $X–$Y, name the unknown term, attribute
 *  the width to it" is a must-say and had no home. */
export interface Obligation {
  id: string;
  must: string;
  why: string;
  about?: string[];
}
```

Established absences **leave `unknowns[]` entirely** — they are `facts[]` with `kind: "absence"`.
Phase 7's framing (*what the research could not settle*) is the wrong polarity for *what the world
has been shown not to contain*.

## Canonical shape 5 — smaller ones

```ts
export interface ScaleConversion {
  for: string;                 // fact id — analogy_candidates had `for`; the arithmetic field did not
  raw: string;
  felt: string;
  kind?: "cash" | "non-cash" | "count" | "ratio";
}
// RULE: the felt version may not promote the claim's SUBJECT CLASS (an address
// cohort does not become "people") and may not drop a qualifier the fact carries.

export interface EngineFit {
  engine: string; label: string; fit: Fit; why: string;
  recommended?: boolean; renderId?: string;
  /** An engine that FITS WELL and MISLEADS is today unrepresentable — `fit` is
   *  one scalar. "The catalogue never asks what a wrong render costs." */
  hazard?: string;
}
```

`Dimension` gains `emptyByOmission` + `notApplicable` (replacing the single `emptyMeans`, which is
kept as a deprecated alias so the fixture compiles). `DEFAULT_DIMENSION` **retires** in favour of an
explicit `untagged` bucket — `the-number` was simultaneously a domain-specific column and the
fallback, so *"the alarm is wired to the drain."*

---

## Assignment (disjoint files — no editor touches another's)

| Editor | Files | Items |
|---|---|---|
| **A · contract** | `app/_phases/_shared/notebook/types.ts`, `pipeline/NOTEBOOK-SCHEMA.md` | E4, E5, E8, E10-schema |
| **B · prompt** | `pipeline/RESEARCH-PROMPT.md` | E1, E2, E3-prompt, E7, E10-phase5, E11 |
| **C · board** | `.../conclusions.ts`, `.../dimensions.ts`, `.../cards.ts`, `.../unknowns.ts` | E6, E3-board |
| **D · engines** | `knowledge/ENGINES.md` | E9 |

The orchestrator owns the control migration (`facts.ts`, `notebook.ts`, the run's `notebook.json`)
after all four land, and verifies Rule 1.
