// CONCLUSIONS — the synthesis layer.
//
// A fact is something the research found. A conclusion is something the model
// *reasoned* by putting the dimensions together and pattern-matching them against
// everything it has read. Those are different kinds of claim and they must never
// be rendered as the same kind of thing.
//
// Why this is dangerous, stated once, at the top:
//
//   The knowledge library's whole honesty discipline is that a claim carries its
//   evidence. A conclusion has NO direct source — its support is other cards plus
//   an analogy. Presented next to sourced facts it would launder itself: it reads
//   as more authoritative precisely because it sounds more insightful. So:
//
//     · conclusions are OFF by default. Facts are in-scope until you cut them;
//       a conclusion is out until you let it in. The asymmetry is the safeguard.
//     · every conclusion states its LEAP — how far past the evidence it goes.
//     · every conclusion states what would FALSIFY it. A synthesis that cannot
//       be wrong is not a conclusion, it is a vibe, and it does not belong here.
//     · a conclusion whose supporting cards get descoped is wounded like any
//       other dependent — the same graph, the same arithmetic.
//
// The user gates these. That is the entire point: the model is allowed to be
// interesting, and the human decides whether interesting goes in the video.
//
// TWO AXES, AND THEY ARE ORTHOGONAL — the thing this file got wrong for a year:
//
//   · LEAP is distance from the EVIDENCE. How far past the cards the sentence
//     travels. It is an epistemic measure and it is what the ladder below is for.
//   · SUBJECT is distance from an ACCUSATION. Who the claim is about, and
//     therefore what saying it costs.
//
//   "The award did not comply with the applicable rule" is a `near` leap AND a
//   legal conclusion about a named body. Every safeguard in this file used to be
//   calibrated to the first axis while the harm is a function of the second, and
//   `Conclusion` had no field naming who the claim was about — so no rule could
//   ever fire on identifiability. A falsifiable defamation is still defamation.
//   Disprovable is not printable. `subject` is that missing axis; the naming
//   rules below hang on it, never on `leap`.
//
//   Corollary, and the reason the top tier alone was never enough: `far` has
//   ample room to attribute and carries no badge at all. Capping only the tier
//   that announces itself disciplines only the claims that already confessed.

export type Leap = "near" | "moderate" | "far" | "unhinged";

/** THE SCAR: this ladder used to define `unhinged` as "a claim about MOTIVE,
 *  which is the least verifiable kind of claim there is — nobody can source what
 *  someone intended" — forty lines below the header rule that a synthesis which
 *  cannot be wrong is a vibe and does not belong here. Two sentences, one file,
 *  mutually exclusive: the top tier was DEFINED as the one claim class the
 *  admission test DEFINES as inadmissible. The worked run escaped only because
 *  its author quietly falsified the reserve's BEHAVIOUR instead of its motive —
 *  a good move nobody wrote down, and therefore a good move nobody could repeat.
 *
 *  The tier is redefined by DISTANCE, not by kind. Motive claims are not a tier;
 *  they are one thing you can find at the far end of the ladder, next to
 *  attribution, intent, and counterfactuals. The gate and its higher bar STAY —
 *  they gate the reviewer exactly where a careful reviewer gates themselves.
 *
 *  Anti-shape: a tier note that names a claim CLASS. If the note says "a claim
 *  about X", it is measuring the wrong axis — see the header. */
export const LEAP_NOTE: Record<Leap, string> = {
  near: "Barely a leap — restates what the cards already imply, in one sentence.",
  moderate: "A real inference. The cards support it; they do not compel it.",
  far: "A genuine reach. Interesting, arguable, and the first thing a hostile viewer attacks.",
  unhinged:
    "The largest leap the cards permit — the furthest from this evidence you can get and still be reasoning from it rather than about it. Entertaining, defensible as speculation, indefensible as fact. Held to a HIGHER bar than the tiers below, not a lower one: it still states a falsifier, and if it names anyone it answers to every rule in conclusionIssues().",
};

/** WHO the claim is about. The exposure axis — see the header.
 *
 *  `none` is not "no proper nouns in the sentence". It is: nobody carries a
 *  consequence if this is printed and wrong. "Adoption was a one-time re-rating"
 *  is `none`; "the reserve was never meant to be built" is a claim about a
 *  government's intent and is `state` however abstractly it is phrased. */
export interface ConclusionSubject {
  names: "none" | "org" | "living-person" | "state";
  /** The named party, when there is one. */
  who?: string;
}

/** WHAT KIND of thing would settle it. `falsifiableBy: string` controlled for the
 *  presence of a sentence, not for the existence of a test — every one of the
 *  seven below passes that check and only some of them name something a reader
 *  could actually go and look at. */
export type FalsifierKind =
  | "document" // a filing, a statute, an audited statement — someone could obtain it
  | "record" // a register, a ledger, a chain, a docket
  | "measurement" // a number that would have to come out differently
  | "event"; // a thing that would have to happen (weakest: it may simply never)

/** A clause of the claim, so `Falsifier.binds` can point at one.
 *
 *  Needed because the rule "the falsifier must bind the LOAD-BEARING clause" is
 *  unenforceable against a claim that has no clause register: a clause id with
 *  nothing to resolve against is a string, and we already learned what a rule
 *  with no field to live in is worth. Optional, like everything here — a
 *  single-clause conclusion binds `"whole-claim"` and needs none of this. */
export interface ConclusionClause {
  id: string;
  text: string;
  /** The clause the claim would lose its point without. Usually exactly one. */
  loadBearing?: boolean;
}

/** THE COMPOUND-CLAIM EVASION, demonstrated four times independently on
 *  `c-reserve-was-the-product` by seats who never saw each other's notes:
 *
 *    claim     = "it was never meant to be built" (intent)
 *    falsifier = "a funded, audited reserve with a published coin count"
 *
 *  Building the reserve late falsifies the shell and the imputation walks. The
 *  falsifier disproves *unbuilt*; it never touches *never-meant*. A compound
 *  claim may NOT discharge the requirement by falsifying its checkable half, so
 *  the falsifier says which half it binds and the gate checks that half is the
 *  load-bearing one. */
export interface Falsifier {
  test: string;
  kind: FalsifierKind;
  /** `"whole-claim"`, or the id of the clause it actually binds. The `string`
   *  arm is written `(string & {})` only so editors still offer the literal;
   *  the pinned meaning is "whole-claim | clause id". */
  binds: "whole-claim" | (string & {});
  /** Why this test is the right one, or — as on the exemplar — a standing note
   *  that it is knowingly the wrong one and the claim is carried anyway. */
  note?: string;
}

export interface Conclusion {
  id: string;
  /** The claim, as it would be said aloud. */
  claim: string;
  /** Why it follows — the reasoning, not the evidence. */
  reasoning: string;
  leap: Leap;
  /** Notebook cards this synthesis stands on. Same dependency graph as anything else. */
  restsOn: string[];
  /** The pattern from outside this subject that the model matched against.
   *  This is the "big brain" part, and it is also the part with no citation —
   *  so it is labelled as an analogy every time it is shown. */
  precedent?: { domain: string; note: string };
  /** What would show this is wrong. REQUIRED — see the header note.
   *
   *  The bare `string` is the legacy form and still compiles (the fixture beside
   *  this file is the control, and a control you had to rewrite is not a
   *  control). `Falsifier` is the target: a string controls for the presence of
   *  a sentence, not for the existence of a test. */
  falsifiableBy: string | Falsifier;
  /** WHO this is about. Optional in the type, required in the schema for new
   *  notebooks. Absent means "not yet assessed", NOT `{names:"none"}` — the gate
   *  must be able to tell an unnamed claim from an unexamined one. */
  subject?: ConclusionSubject;
  /** The claim's clauses, when it has more than one and they are not equally
   *  checkable. Only needed so `Falsifier.binds` resolves. */
  clauses?: ConclusionClause[];
  /** Where it would land in a script, if accepted.
   *
   *  `boundary` is new and is the whole of a finding that previously had no
   *  shape: *"the mechanics are established and the intent is not, and that is
   *  the finding"*. Without it the reviewer's only moves were to assert the
   *  intent (a `far`/`unhinged` card about a named party) or to say nothing —
   *  and saying nothing renders as the mechanics being all there is. A boundary
   *  card states the limit itself, and being a conclusion it is gateable,
   *  woundable, and OUT of scope until taken (Guardrail 1: the opt-in asymmetry
   *  is untouchable, and a card class that defaulted in because it "only states
   *  a limit" would be the first hole in it). */
  useFor: "thesis" | "reversal" | "reframe" | "steel-man" | "colour" | "boundary";
  /** The reviewer looked, and is declining to say. Distinct from a boundary
   *  card, which is the finding itself: `withheld` marks a claim the notebook
   *  HOLDS and will not print — kept so the next round does not rediscover it
   *  and print it, and so descoping it still wounds what rests on it. Renders as
   *  the withholding, never as the claim. */
  withheld?: boolean;
  /** What KIND of claim this is. Gates independently of `leap`. */
  assertion?: ConclusionAssertion;
  /** The single fact id — a filed action or published admission — that licenses a
   *  legal-conclusion, a motive claim, or a leap past `moderate` about a named
   *  subject. Named, not inferred from set membership. */
  licensedBy?: string;
  /** 😈 The hottest take: deliberately conspiratorial, offered as speculation.
   *
   *  Held to a HIGHER bar than the others, not a lower one. A spicy claim that
   *  cannot be wrong is just an accusation, so this one still states its
   *  falsifier — and the UI marks it, because a viewer must be able to tell the
   *  difference between "the evidence says" and "here is a thought". */
  hottest?: boolean;
}

/* ------------------------------------------------------------ the gate rules

   Written as code rather than as advice, for the reason stated one file over:
   a rule with no field to live in is a comment, and a rule with a field but no
   consumer is a comment with a type. These are the `subject`-keyed rules, and
   they fire on identifiability — never on `leap`, which measures the other axis.

   Advisory by construction: this returns findings for the reviewer, it does not
   delete cards. Nothing here may make the falsifier optional (Guardrail 2). */

export type ConclusionAssertion =
  /** A reading of what the evidence means. The default, and the safe one. */
  | "interpretation"
  /** A finding reserved to a body empowered to make it — unlawful, non-compliant,
   *  fraudulent, negligent. A SMALL leap from the evidence and a LARGE leap from
   *  an accusation, which is exactly why it cannot be a `leap` value. */
  | "legal-conclusion"
  /** A claim about why someone did something. */
  | "motive"
  | "prediction";

export interface ConclusionIssue {
  rule:
    | "falsifier-missing"
    | "falsifier-untyped"
    | "falsifier-kind"
    | "falsifier-binds"
    | "leap-cap"
    | "subject-unassessed"
  | "clauses-undeclared"
  | "licence-invalid"
  | "assertion-unlicensed";
  detail: string;
}

export function falsifierOf(c: Conclusion): Falsifier | null {
  return typeof c.falsifiableBy === "string" ? null : c.falsifiableBy;
}

/** The falsifier's prose, whichever form it is in. */
export function falsifierText(c: Conclusion): string {
  return typeof c.falsifiableBy === "string" ? c.falsifiableBy : c.falsifiableBy.test;
}

export function conclusionIssues(
  c: Conclusion,
  opts: {
    /** Ids in `restsOn` that are a FILED ACTION or a PUBLISHED ADMISSION — the
     *  only things that buy a named claim a leap past `moderate`. This file
     *  cannot decide that itself: it would have to read `facts[].kind` and
     *  `sources[].evidenceClass`, which belong to the notebook contract. Absent,
     *  the cap is applied — the strict reading, deliberately. */
    filedOrAdmitted?: ReadonlySet<string>;
  } = {},
): ConclusionIssue[] {
  const issues: ConclusionIssue[] = [];
  const f = falsifierOf(c);
  const text = falsifierText(c).trim();

  if (!text) {
    issues.push({
      rule: "falsifier-missing",
      detail: "No falsifier. A synthesis that cannot be wrong is a vibe, not a conclusion.",
    });
  }
  if (!f && text) {
    issues.push({
      rule: "falsifier-untyped",
      detail:
        "Falsifier is a bare sentence. State its kind and what clause it binds — otherwise this checks that a sentence exists, not that a test does.",
    });
  }

  if (!c.subject) {
    issues.push({
      rule: "subject-unassessed",
      detail: "No `subject`. Unassessed is not the same as nobody-is-named; the exposure axis is unread.",
    });
    return issues;
  }
  if (c.subject.names === "none") return issues;

  // ---- named-subject rules -------------------------------------------------
  const who = c.subject.who ?? c.subject.names;

  if (f && f.kind !== "document" && f.kind !== "record") {
    issues.push({
      rule: "falsifier-kind",
      detail: `Claim is about ${who}; its falsifier is a ${f.kind}. A named claim answers to the standard facts[] already holds itself to — something obtainable: a document or a record.`,
    });
  }

  // A named claim must DECLARE its clause structure. The exploit this closes:
  // delete `clauses[]`, bind "whole-claim", ship with zero issues — because the
  // whole check below sat inside the `binds !== "whole-claim"` branch, so
  // honesty was the trigger that armed the rule. Undeclared is not simple.
  // (public-corruption, L2 `G-L2-PC-01`: "I simply did not tell it there were
  // two halves, and the rule that exists to catch a sentence with two halves is
  // written inside an `if` that only opens when you say so.")
  if (f && (!c.clauses || c.clauses.length === 0)) {
    issues.push({
      rule: "clauses-undeclared",
      detail: `Claim is about ${who} and declares no clauses. A falsifier binding "whole-claim" is only meaningful over a claim whose parts are stated — otherwise a compound claim discharges the requirement by not mentioning that it is compound.`,
    });
  }

  if (f && f.binds !== "whole-claim") {
    const bound = c.clauses?.find((cl) => cl.id === f.binds);
    if (!bound) {
      issues.push({
        rule: "falsifier-binds",
        detail: `Falsifier binds "${f.binds}", which is not a clause this claim declares.`,
      });
    } else if (!bound.loadBearing) {
      issues.push({
        rule: "falsifier-binds",
        detail: `Falsifier binds the clause "${bound.text}", which is not the load-bearing one. Falsifying the checkable half does not discharge the requirement — the imputation walks.`,
      });
    }
  }

  const filed = opts.filedOrAdmitted;
  // MEMBERSHIP IS NOT SUPPORT. `restsOn.some(id => filed.has(id))` let one filed
  // document buy the whole card — and the demonstrated case used a judgment that
  // EXPRESSLY DECLINED the attribution it was purchasing (L2 `G-L2-PC-03`). The
  // conclusion must now name which filed item licenses the leap, so the claim
  // and its licence can be read against each other.
  const licence = c.licensedBy;
  const bought = !!(filed && licence && filed.has(licence) && c.restsOn.includes(licence));
  if (filed && licence && !bought) {
    issues.push({
      rule: "licence-invalid",
      detail: `\`licensedBy\` names "${licence}", which is not both in restsOn and a filed action or published admission.`,
    });
  }

  // THE CAP HANGS ON THE ASSERTION, NOT THE LEAP. This file's own header says
  // naming rules hang on `subject`, never on `leap` — and the first
  // implementation contradicted it by gating on `far | unhinged`, which let the
  // domain's single most dangerous sentence through at `near`: "the award did
  // not comply with the applicable rule" is a small step from the evidence AND a
  // legal conclusion reserved to a body empowered to make it. Leap distance and
  // accusation distance are orthogonal (public-corruption, L1 + L2).
  const assertion = c.assertion ?? "interpretation";
  if ((assertion === "legal-conclusion" || assertion === "motive") && !bought) {
    issues.push({
      rule: "assertion-unlicensed",
      detail: `Claim is about ${who} and asserts a ${assertion === "motive" ? "motive" : "legal conclusion"}. That needs a filed action or published admission named in \`licensedBy\` — at ANY leap, including "near".`,
    });
  }
  if ((c.leap === "far" || c.leap === "unhinged") && !bought) {
    issues.push({
      rule: "leap-cap",
      detail: `Claim is about ${who} at leap "${c.leap}". Named claims cap at "moderate" unless a filed action or published admission is named in \`licensedBy\`.`,
    });
  }

  return issues;
}

/* ---------------------------------------------------------------------------
   The Bitcoin project's conclusions.

   Produced by combining all six research dimensions with pattern-matching to
   other markets and other times. None of these has a source, because none of
   them is a finding — they are what the material adds up to.
--------------------------------------------------------------------------- */

/** THE SEPARATE EXPORT, and the reason it is separate: a conclusion has no
 *  source, so it may not be filed inside `Notebook` beside the sourced facts.
 *  `buildCards` is the only place the two are joined.
 *
 *  A consumer serialising "the notebook" for a model must therefore send this
 *  array ALONGSIDE the notebook object. `app/api/recalibrate/route.ts` does not
 *  — see the note on `Notebook` in types.ts for exactly what that costs and the
 *  one line that fixes it. */
export const CONCLUSIONS: Conclusion[] = [
  {
    id: "c-one-time-rerating",
    claim:
      "Adoption was a one-time re-rating, not a permanent bid. Going from “institutions may not own this” to “institutions may own this” is a stock adjustment — it happens once, the allocation gets set, and then the buying stops.",
    reasoning:
      "Every demand source in the notebook is a one-off transition being mistaken for a recurring flow: the ETF opened access, the treasuries levered into a fixed target, the reserve legitimised holding. None of them is a process that repeats next year. The market priced a permanent buyer and received a single purchase order.",
    leap: "moderate",
    restsOn: ["f-etf-absorbed", "f-mnav", "f-sbr", "f-genius"],
    precedent: {
      domain: "index inclusion",
      note: "A stock added to a major index gets a one-time re-rating as trackers buy their weight — and then reverts to trading on fundamentals. The inclusion is an event; investors routinely misread it as a regime.",
    },
    falsifiableBy:
      "Sustained net inflows through a year in which price falls — that would show a recurring bid independent of the access event.",
    useFor: "thesis",
  },
  {
    id: "c-correlation-is-the-product",
    claim:
      "The property that made Bitcoin worth owning is the property adoption destroyed. Institutions wanted it because it moved differently; owning it is what made it move the same.",
    reasoning:
      "An uncorrelated asset is valuable to a portfolio precisely because few portfolios hold it. As allocation rises, the same risk models size it, hedge it and cut it alongside everything else — so correlation rises toward the thing it was supposed to diversify. Success is self-consuming.",
    leap: "far",
    restsOn: ["f-correlation", "f-m2-divergence", "f-yields", "m-institutionalisation"],
    precedent: {
      domain: "published market anomalies",
      note: "Documented factor premia decay after publication — once an edge is widely known and traded it stops being an edge. Same mechanism: the property survives only while it is not general.",
    },
    falsifiableBy:
      "A risk-off episode in which Bitcoin holds while the Nasdaq falls. One clean decoupling under stress and this is wrong.",
    useFor: "reframe",
  },
  {
    id: "c-closed-end-fund",
    claim:
      "Strategy was never a Bitcoin company. It was a closed-end fund with a premium, and closed-end premiums always close.",
    reasoning:
      "mNAV above 1 is the definition of a closed-end fund trading above net asset value. The premium funded the accretion, the accretion justified the premium, and that loop runs only while sentiment holds. When it inverts, the vehicle's only remaining levers are buybacks and selling the asset — which is exactly the observed sequence.",
    leap: "moderate",
    restsOn: ["f-mnav", "f-mstr-drop", "f-mstr-sold", "m-treasury-flywheel"],
    precedent: {
      domain: "GBTC, 2020–2022",
      note: "The Grayscale trust ran a large premium, attracted capital because of it, then flipped to a persistent discount that trapped holders. Same structure, same direction, one cycle earlier — and largely the same investors.",
    },
    falsifiableBy:
      "mNAV recovering above 1 and holding there through a flat price — that would mean the premium reflects something other than reflexive sentiment.",
    useFor: "reversal",
  },
  {
    id: "c-permission-not-appetite",
    claim:
      "Washington delivered permission, and permission was never the constraint. Everyone who wanted Bitcoin already had it.",
    reasoning:
      "The reserve, the Act and the friendly regulators all remove barriers to buying. None of them creates a reason to buy. A fifteen-year retail bull market had already exhausted the population that wanted exposure through any available means — the legal wrapper arrived after the appetite it was supposed to unlock.",
    leap: "moderate",
    restsOn: ["f-sbr", "f-sbr-unbuilt", "f-genius", "f-macro-cause"],
    precedent: {
      domain: "cannabis legalisation",
      note: "Legal-market equities peaked around legalisation and fell afterwards. The regulatory event was priced as demand; it turned out to be access, and access was the smaller half.",
    },
    falsifiableBy:
      "A measurable cohort of first-time holders arriving through the retirement-account channel — new buyers who genuinely could not participate before.",
    useFor: "reversal",
  },
  {
    id: "c-scarcity-not-a-floor",
    claim:
      "A fixed supply sets no floor when the marginal holder is a rebalancer. Twenty-one million is a fact about issuance, not about who is willing to sell at what price.",
    reasoning:
      "Price is set at the margin. If the marginal seller's decision is a portfolio weight rather than a conviction, the cap is irrelevant to them — they are selling a percentage, not a belief. The cohort data shows exactly this: whales absorbing while the tier above retail distributes slightly more.",
    leap: "near",
    restsOn: ["f-whale-absorb", "f-midtier-distribute", "f-lth-distribution"],
    falsifiableBy:
      "Sustained price appreciation on falling exchange balances with no new demand source — scarcity biting on its own.",
    useFor: "reversal",
  },
  {
    id: "c-borrowed-prosperity",
    claim:
      "This was not a bull market that ended. It was a transfer of ownership that completed — from people who believed in it to people who are allocated to it.",
    reasoning:
      "Read the flows together and one story fits all of them: long-term holders sold 3.67m coins into the strength, treasury companies stopped buying when the arithmetic inverted, mid-tier holders distributed into whale accumulation, and what remains is held inside risk-managed portfolios. The believers exited; the allocators arrived. That is a change in who owns it, and owners with different reasons behave differently.",
    leap: "far",
    restsOn: ["f-lth-distribution", "f-midtier-distribute", "f-whale-absorb", "f-correlation"],
    precedent: {
      domain: "gold after the 1970s",
      note: "Gold moved from a monetary rebellion held by conviction buyers to a portfolio sleeve held by allocators — and its behaviour changed accordingly: lower drama, tighter correlation to real rates, decades of range.",
    },
    falsifiableBy:
      "Evidence that long-term-holder supply is rebuilding at these prices from the same cohort that sold — the believers returning rather than being replaced.",
    useFor: "thesis",
  },
  {
    id: "c-reserve-was-the-product",
    claim:
      "The Strategic Bitcoin Reserve was never meant to be built. Announcing it *was* the product — a way to put a floor under an asset your donors hold without appropriating a dollar to do it.",
    reasoning:
      "Look at what actually happened. The executive order lands in March 2025 and the price re-rates on it. Sixteen months later there is no stockpile, no accounting, and federal agencies cannot agree on how much Bitcoin the government owns. A policy that was genuinely intended to be executed does not look like that. A policy intended as a signal looks exactly like that: the announcement is the deliverable, the implementation is optional, and the cost is zero.",
    leap: "unhinged",
    restsOn: ["f-sbr", "f-sbr-unbuilt", "f-genius"],
    /** Rule 1's expected change #3. This card is the exemplar the whole finding
     *  was demonstrated on, and it is left FAILING the gate on purpose: the
     *  point was never that the author wrote a bad falsifier, it is that the old
     *  shape had no way to notice a good-looking one binding the wrong half. */
    subject: { names: "state", who: "the US executive branch" },
    clauses: [
      { id: "never-meant", text: "the reserve was never meant to be built", loadBearing: true },
      { id: "announcement-was-the-product", text: "announcing it was the deliverable", loadBearing: true },
      { id: "unbuilt-status", text: "and sixteen months on it is still not built (implied, not stated)" },
    ],
    precedent: {
      domain: "announced-but-unbuilt infrastructure",
      note: "Governments routinely bank the political return of an announcement and quietly never fund the thing. The tell is always the same — a launch date, no line item, and nobody able to say who owns the programme a year later.",
    },
    falsifiableBy: {
      test: "A funded, audited reserve with a published coin count. One credible balance sheet and this collapses — which is exactly why it should be labelled speculation and not reporting.",
      kind: "document",
      binds: "unbuilt-status",
      note: "KNOWINGLY THE WRONG CLAUSE. This test disproves *unbuilt*; the claim is *never-meant*. Build the reserve tomorrow and the shell falls while the imputation of intent walks away untouched. There is no document that falsifies an intention, which is what the tier is really telling you — carry it as speculation or reach for a boundary card.",
    },
    useFor: "colour",
    hottest: true,
  },
];

/* `CONCLUSION_IDS` was here: `new Set(CONCLUSIONS.map(c => c.id))`, with no
   caller. The set that IS used is `research/scope.ts::OPT_IN_IDS`, which
   computes the same thing for the reason that matters — a conclusion is OUT of
   scope until the creator takes it. One export, at the point of use. */
