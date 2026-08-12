# Run brief — 2026-08-12 · L1 first sweep

**Mode:** `/gauntlet run --l1` · full cast (20) · model: Opus for every walker.
**Subject under test:** the research methodic. Not the app.

## Why Opus for the walkers

The judgement layer is the product here. A walker that reads an instruction set charitably and
reports "this seems fine" costs the run its entire value — L1's known blind spot is that a model
reading a prompt imagines a competent execution of it. The cast is where objectivity has to live,
because the judge sees only what the cast produces.

## Dispatch

One agent per Creator, in parallel, no browser, no searches. Each reads `gauntlet/env.md` § L1 for
its required reading list, its own `gauntlet/creators/<id>.md`, and walks its topic through the
methodic on paper.

**Forbidden reading: `gauntlet/lens-spec.md`.** It holds the orchestrator's hypotheses about which
domains need their own lens. A walker who reads it will find what it told them to find, and the
whole point of dispatching twenty independent passes is to discover whether those hypotheses survive
contact with twenty topics that were chosen before the hypotheses were written.

## Orchestrator leads — ALL UNVERIFIED HYPOTHESES

These were written from a skim by the one participant nobody reviews. **Verify each independently
and contradict me if the artifacts say otherwise.** A walker that spends its pass confirming these
has produced nothing.

- HYPOTHESIS — the seven columns in `dimensions.ts` are market-shaped and will collapse or leave
  orphans on non-market topics. *Contradict me by placing your material cleanly.*
- HYPOTHESIS — the evidence ladder (MEASURED · OBSERVED · INFERRED · ASSUMED) has no honest rung for
  interpretive or practitioner-consensus evidence. *Contradict me by finding one.*
- HYPOTHESIS — the `unhinged` leap tier in `conclusions.ts` is unsafe when a conclusion names a
  living person. *Contradict me if the falsifier requirement already constrains it adequately.*
- HYPOTHESIS — Phase 1's mandatory counter-case row is unsatisfiable for topics with no literature.
  *Contradict me if the prompt already provides a fallback.*

Known and pre-recorded — do NOT re-raise as new findings, cite as `G-000`: untagged cards fall
through `?? DEFAULT_DIMENSION` into "The number" (`dimensions.ts:42-49`). See `accepted-gaps.md`.

## Retractions

_(none yet — appended in-flight the moment a lead proves wrong)_

---

## RETRACTION 1 — issued mid-run, 2026-08-12

**Lead #2 ("the evidence ladder has no honest rung for interpretive or practitioner-consensus
evidence") was wrong in its premise, and so was the `evidence` dimension in `gauntlet/rubric.md`.**

`sanctions-trade` checked instead of confirming, and was right. Verified independently by the
orchestrator: MEASURED · OBSERVED · INFERRED · ASSUMED is defined in `knowledge/README.md:32-40`
under **"The evidence contract"**, and it governs claims in a `PATTERNS.md` — the *craft* knowledge
library. `grep` for all four tokens across `pipeline/RESEARCH-PROMPT.md`,
`pipeline/NOTEBOOK-SCHEMA.md` and `knowledge/CRAFT-BASELINE.md` returns **nothing**.

**The ladder does not govern notebooks at all.**

Consequences for every walker still running and for the synthesis:

1. Do **not** report "the ladder demotes my best material" as a finding. It cannot demote anything;
   it isn't applied to notebook facts.
2. The real question is bigger and every seat should answer it: **a notebook fact has no evidence
   label at all.** Read `facts[]` in `NOTEBOOK-SCHEMA.md` and say what a fact actually carries, and
   whether the *absence* of any evidence-class field is a defect for your topic. For seats whose
   whole discipline is separating classes of evidence — `conflict-osint`'s provenance classes,
   `crypto-collapse`'s measured-transfer vs inferred-attribution, `security-breach`'s vendor vs
   researcher, `public-co-fraud`'s filing vs advocacy — this is now the central question, and it is
   a **stronger** finding than the one my lead pointed you at.
3. Findings already written against lead #2 are not void — **re-scope them** from "wrong rung" to
   "no rung exists", and re-run the refuter on the re-scoped version.

I wrote the lead from a skim of `knowledge/`, assumed the contract was global, and did not grep
before priming twenty walkers with it. This is exactly the failure the HYPOTHESIS labelling exists
to contain, and the containment worked: the first returning walker contradicted it with citations
rather than confirming it.
