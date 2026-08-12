# Two inherited structures

**Status: PROPOSAL. Nothing here is adopted, and it should not be adopted on my say-so.**

Author: orchestrator, 2026-08-12, after the L1 sweep (187 findings), the adoption of VERDICT E1–E11,
and L2 on four hostile seats (34 findings). Written as a concept doc rather than an edit because
both proposals change a **shared contract** on the strength of findings that have not been judged,
and because this run has a measured base rate for my unreviewed diagnoses: **three of my four L1
leads were wrong**, one retracted mid-run. Everything below is my reading of *someone else's*
finding, which is exactly the category that keeps failing.

Intended consumer: `/gauntlet judge`, with the remaining hostile seats' L2 evidence.

---

## The shared diagnosis

`G-CTRL-01` (no connector for a co-premise) and `G-L2-CO-02` (source independence is unexpressible)
look unrelated. I think they are **the same mistake, twice**:

> A structure that was correct at one layer was inherited by another layer without being re-derived
> for it.

- The **beat chain's** connector vocabulary was inherited by the **mechanism chain**.
- The **source's** classification was inherited by the **source set**.

In both cases the inherited thing works fine for the simple case that motivated it, and the failure
only appears when the second layer is asked to carry something the first layer never had to.

That framing is itself a claim, and it is the first thing the judge should try to break. If the two
findings have nothing structural in common, then these are two unrelated patches and should be
judged separately — which changes the cost/benefit of both.

---

# Proposal A · The mechanism is not a chain

## What forces it

| Finding | Seat | The gap |
|---|---|---|
| `G-L1S-MI-02` | `music-industry` | A royalty flow's honest links include **transfers** — a deduction, a hand-off. Neither `BUT` nor `THEREFORE` describes one, so the law's instruction ("find the missing link or drop it") deletes the two parties whose shares are the subject. |
| `G-CTRL-01` | control migration | Two of the reference notebook's `mechanisms[].chain` steps are bare `AND` — **co-premises**, two independent premises supporting one `THEREFORE`. Valid argument structure, flagged by a bar that permits zero `AND`. Both survived the artifact's whole life uncaught. |

Adoption already patched the first with a `TRANSFER` connector. **We have now patched this enum
twice, from opposite directions, in one day.** Two independent gaps in a three-value vocabulary is
not bad luck — it is the vocabulary answering the wrong question.

## The claim

**A beat chain and a mechanism chain are different objects, and only one of them is a chain.**

A **beat chain** is a viewing experience: a sequence *in time* that a viewer moves through, where
each adjacent pair must earn its transition. `AND THEN` is a real defect there — the viewer is given
no reason to keep watching. `news-reaction` refuted the suggestion that the law is too strict for
breaking news, and `creator-economy` built three clean BUT/THEREFORE reversals from timestamps
alone. **The law is right about beats and is not in question.**

A **mechanism chain** is an argument: a directed graph of support. Its structure is logical, not
temporal. Two premises feeding one conclusion are not "adjacent" — they are siblings. A transfer step
is not a weak causal link — it is a different edge. Forcing either into a list is what produces the
extorted `THEREFORE`, which the schema now names as an anti-pattern while the type still requires it.

This is the judge's own P6 ruling followed one step further: *"the law stands, unmodified, at the
script layer… at the notebook layer it is over-scoped."* P6 fixed the symptom with `TRANSFER`. This
proposes fixing the shape.

## The shape

Additive. `steps?: ChainStep[]` already exists beside the legacy `chain: string[]` (Editor A's
deviation, because the render side maps `chain` into a `(step: string)` callback).

```ts
export interface ChainStep {
  id: string;
  text: string;
  /** Ids of the steps this one supports. Empty = a root premise.
   *  MULTIPLE PARENTS ARE THE POINT: two premises supporting one conclusion is
   *  the co-premise case, expressed without a new connector. */
  supports?: string[];
  /** Describes the EDGE to each supported step, not a position in a list. */
  connector?: "BUT" | "THEREFORE" | "TRANSFER";
  evidence?: string[];
}
```

`TRANSFER` survives, demoted from "third connector" to "edge type" — which is what
`music-industry`'s ledger always needed.

## What it changes in named runs

- The reference notebook's two bare `AND`s at `notebook.json:207` and `:222` become two roots
  supporting one node. **No text changes.** The argument was always this shape; the type could not
  say so. (Contrast the alternative: merging them into the following `THEREFORE` re-authors the
  argument, which is a research act and precisely the anti-pattern the schema now forbids.)
- `music-industry`'s five-step royalty flow keeps the platform and the label.
- `game-postmortem`'s production timeline gets a spine whose edges can be evidenced individually.

## What it unlocks that we currently cannot check at all

**The gate gains the one check that connects the two layers: a rendered beat chain must be a valid
linearisation of its mechanism graph.** Today nothing relates them — a render can assert a causal
order the notebook never claimed, and no check exists, which is a superset of the
`u-yield-causality` class of failure.

## Cost, and what it does not fix

- Three mechanisms to migrate in the incumbent; `Argument.tsx` / `chainLink` need to read `steps`.
  Retires `G-CTRL-03` (chain/steps drift) by giving `steps` a reason to be authoritative.
- **It does not make the one law enforceable at render.** That is the gate's job and the gate is
  lexical.
- It does not tell you whether a co-premise is *true*, only that the notebook may state it.

## What would falsify it

- If a judge finds the co-premise case is **rare** — one instance in one notebook — then an
  `AND-ALSO` connector is the cheaper correct answer and this is over-engineering.
- If any seat's mechanism genuinely needs an *ordered* chain (a chronology where sequence is the
  claim), a graph loses information a list carried. `public-corruption`'s O2 and
  `game-postmortem`'s §2.3 both concern chronology and should be read directly against this.

---

# Proposal B · Independence is a relation, not a label

## What forces it

`G-L2-CO-02` (blocker, `conflict-osint`, L2):

> A respected institute's monthly analysis whose own methodology says it draws exclusively from one
> belligerent's daily reports is **two sources by every count the schema can perform and one
> observation.** The quality bar's "reaches a primary source" and "second source" rules are
> arithmetic over independence, which is unexpressible.
>
> *"Two sources. One observation. The institute is not a second look at the war; it is a second look
> at the same press release."*

Its diagnosis of why this surfaced only now is the sharpest part: **fixing the plural-source scar is
what made it visible — the first thing a countable set did was produce a wrong count.** Before E4,
`source` was a single string and nobody could count at all. We did not introduce the defect; we made
it legible, and then immediately built a quality-bar row that depends on the count being meaningful.

Adjacent, same file: the enum has no `researcher-verified` — authenticated by the author against
independent material, re-checkable by the reader. `protected` already ships as its *un-citable*
sibling. **The enum has the exception and not the rule.**

## The shape

```ts
export interface FactSource {
  name: string;
  evidenceClass: EvidenceClass;   // + "researcher-verified"
  locator?: string;
  interested?: boolean;
  /** What this source restates.
   *    undefined  — UNASSESSED. Never counts as independent.
   *    []         — established original observation (a root).
   *    [ids]      — restates these sources; contributes no new root. */
  derivesFrom?: string[];
}
```

Independence becomes computed, and the computation returns a **pair, never a number**:

```
sourceIndependence(fact) → { roots: 1, unassessed: 3 }
```

## The design decision that matters

**Unassessed must never count as independent**, and the honest output is a pair rather than a
number. This is the render gate's own law applied one layer down: *never report a pass for something
you did not check.* The quality-bar row becomes:

> `[ ] two independently-rooted sources, or a named gap`

A wire story that does not say where it got its figure produces a **named gap**, which is the truth.

**This will make notebooks look worse, and that is the point.** Today four aggregators read as four
sources — and the incumbent's own source list is entirely aggregator-class, which the adoption
already admitted as an unfixed ceiling.

## What it changes in named runs

- `conflict-osint`'s institute/ministry pair reports `roots: 1, unassessed: 0` and fails the row
  honestly, instead of passing at two.
- `software-eng`'s comma-joined three publications (run 1 put three names in one singular string)
  become countable, then correctly report as unassessed until someone checks.
- The incumbent's `f-midtier-distribute` — already corrected for arithmetic — would additionally
  report that its "on-chain cohort analysis via aggregators" is one unassessed source, not evidence.

## Cost, and what it does not fix

- **Independence is often genuinely unknowable from outside.** Most sources will sit `unassessed`
  permanently. I think that is a feature: the honest reading of four aggregators is *one source and
  three restatements, none of them checked.*
- **It is self-reported.** Nothing verifies `derivesFrom: []`. A researcher who wants a green row can
  assert roots. This is the same shape as `news-reaction`'s L2 finding that the incentive moved
  rather than vanished — *"I only invented `not_searched` because I knew I was being watched."*
  **A field cannot fix a motive; it can only stop honesty from being unrepresentable.**
- It does not address `interested` being decorative today: `conflict-osint` recorded 8 interested
  sources and **0** were caught by any rule.

## What would falsify it

- If, across the four L2 notebooks, `derivesFrom` would be `undefined` for **every** source, the
  field buys a permanent "unassessed" label and no arithmetic — in which case the honest fix is to
  **delete the "second source" quality-bar row** rather than build machinery to fail it. That is the
  cheaper answer and the judge should weigh it seriously.
- If the seats find they can usually establish provenance, the field earns itself.

**This is the single most decidable question in this document, and it is answerable from artifacts
that already exist.** Four L2 notebooks are on disk. Someone should count.

---

## Questions for the judge

1. **Is the shared diagnosis real,** or am I pattern-matching two unrelated patches into a story?
   (My base rate this run: 3 of 4 leads wrong.)
2. **Graph or enum?** Does the co-premise case appear often enough across the 20 L1 reports to
   justify a shape change over an `AND-ALSO` value?
3. **Does a graph lose the chronology** that `public-corruption` and `game-postmortem` need?
4. **Count the four L2 notebooks:** how many sources could have carried a `derivesFrom`? If the
   answer is near zero, delete the quality-bar row instead.
5. **Does `researcher-verified` belong in the enum**, or is it `primary` + `locator`? `conflict-osint`
   says the enum has the exception and not the rule; `creator-economy` reached `primary` +
   `locator: timestamp` and called it a genuine home. **These two seats may disagree**, and per the
   rubric an opposing verdict is a finding, not an average.

## My opinion, stated plainly so it can be argued with

Proposal B is **more clearly right and much cheaper**, and its falsification test can be run today
against artifacts already on disk. I would do B first regardless of what happens to A.

Proposal A is **more interesting and less certain.** The "we patched this enum twice in one day"
argument is suggestive rather than conclusive, and the chronology objection is real and unresolved.
If the judge finds one co-premise instance across twenty reports, I am wrong and `AND-ALSO` is the
answer.

Both share one property worth protecting: **neither weakens a rule.** A stays out of the beat
layer entirely; B makes a quality-bar row harder to pass, not easier.
