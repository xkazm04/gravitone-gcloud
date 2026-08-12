# L2 BRIEF — hostile seats, post-adoption · 2026-08-12

**Mode:** `/gauntlet run --l2 --hostile`, in the originating run's directory because this is
adoption verification, not a new sweep.

**What changed since L1:** E1–E11 landed (see `RECERTIFY.md`). The counter-case has a null path, a
fact has an anatomy, mechanisms carry evidence, conclusions carry a subject. **The judge's
instruction was to re-run the hostile seats after E1–E8 — that is this run.**

## The question L2 exists to answer

L1 read the instruction set. **L2 executes it.** The gap between *"the prompt asks for X"* and *"the
run produced X"* is the entire reason this level exists, and L1's charitable reading is a known
weakness — one L1 walker proved it by finding a mandate that had **failed open on the shipped
reference artifact**, which no amount of reading the instruction would have caught.

So the question is not *"is the amended methodic better on paper?"* It is:

> **Does the amended methodic hold when a real topic is actually researched through it — and do the
> new fields get filled honestly, or do they get filled to pass?**

A field that exists and gets stuffed with a plausible value is worse than a missing field, because
it manufactures the appearance of rigour. **Watch for that specifically.** `evidence_class`,
`kind`, `unit`, `period`, `subject` are all new and all guessable.

## Hard rules

1. **Real research. Real sources. `WebSearch`/`WebFetch`.** Never fabricate a source or a figure. A
   run that cannot find real material **reports that as the finding** — a domain whose evidence is
   not reachable in one pass is precisely what this exercise hunts, and inventing a citation
   destroys the only thing the run is for.
2. **Record the actual search count.** The prompt budgets 4–8 for Phase 1. Blowing past it to make
   the topic work is itself the finding.
3. **Compute, never estimate.** Any arithmetic claim in your report must be computed. The scar: a
   `load_bearing` fact shipped saying 77,800 was *"slightly more than"* 270,000, over *"the same
   60-day window"* its sibling dated at 30 days, and **none of twelve self-checks was arithmetic.**
   That fact was corrected during adoption; do not create its successor.
4. **The deliverable is a test of the METHODIC.** These notebooks are internal test artifacts, not
   publishable pieces. For seats whose topics name people: stay on already-public, already-reported
   matters; adjudicate, never accuse; no motive claims about named individuals; and if the methodic
   *lets* you write one, **that is the finding you lead with.**

## Orchestrator leads — ALL UNVERIFIED HYPOTHESES

Three of my four L1 leads were wrong and one was retracted mid-run. Weight these accordingly:
**verify independently and contradict me if the artifacts say otherwise.**

- HYPOTHESIS — the null path (E1) makes a counter-case-free topic passable. *Contradict me if the
  pressure to fabricate survives the edit.*
- HYPOTHESIS — `facts[].kind: "absence"` gives an established absence a home. *Contradict me if it
  is unusable in practice, or if you find yourself reaching for it to launder a gap in effort.*
- HYPOTHESIS — `subject` + typed falsifier constrain naming. *Contradict me — `conclusionIssues()`
  is advisory and does not block, so the honest test is whether you could ship past it.*
- HYPOTHESIS — the amended methodic moves time-saved toward your acceptance bar. **20/20 seats
  failed it at L1.** *I expect this to still fail; say by how much and name the block it doesn't
  touch.*

Known, pre-recorded, do not re-raise: `G-000` (untagged fallback), `G-CTRL-01` (no co-premise
connector), `G-CTRL-02` (board UI not migrated), `G-CTRL-03` (chain/steps drift). See `RECERTIFY.md`.

## Output per seat

```
gauntlet/runs/2026-08-12-l1-first-sweep/l2/<creator>/
  notebook.json     # conforms to the AMENDED pipeline/NOTEBOOK-SCHEMA.md
  NOTES.md          # what the run did, what it could not find, what it had to invent
  <creator>--l2.md  # report + first-person voice (APPENDED to the L1 voice, never replacing it)
```

**Keep both voices.** The L1 voice judged the designed methodic; the L2 voice judges the produced
artifact. The escalation between them is where the sharpest findings live.
