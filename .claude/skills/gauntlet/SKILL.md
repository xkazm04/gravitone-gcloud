---
name: gauntlet
description: Battle-testing for the RESEARCH METHODIC, not the UI. A cast of 20 durable Creators — working video-essayists across Geopolitics, Tech, Fraud and Entertainment — each bring a real topic from their own beat and run it through Gravitone's research process (RESEARCH-PROMPT.md → notebook.json → triage board → engine → script), judging the output through their own consistent lens (time saved vs their manual process, senior-in-role quality, and legal/reputational exposure). Three chronological levels — L1 dry fit (no run, mass-parallel), L2 live notebook (terminal pipeline, real research), L3 surface (browser, blocked until notebooks are loadable). Every finding names the ARTIFACT it indicts (prompt / schema / dimensions / conclusions / engines / tone / knowledge / ui), so a run produces edits, not opinions. A Fable judge then sits three benches — prompt, philosophy, UX — over all 20 artifact sets, and rules on the one question the cast cannot answer individually: which domains genuinely need their own LENS, and which just need different content in the same mechanism. Invoke with `/gauntlet init|update|run|judge|adopt|recertify [args]`.
argument-hint: "[domain | creator | topic]"
category: Testing
memory: vault
version: 1.1
---

# The Gauntlet — Creator-driven hardening of the research methodic

Adopted from `/uat` (v1.5, `kp` repo). Same philosophy, different subject: `/uat` asks *can this
person finish their job in this UI?* The Gauntlet asks **can this person's topic survive this
research methodic?** — and when it can't, *which file is wrong.*

> The methodic was derived from **one topic** (`why-bitcoin-price-does-not-rise`, 2026-08-11). It fit
> that topic beautifully. That is exactly the condition under which a process looks universal and is
> not. A market-shaped domain table, a market-shaped board, and an evidence ladder that starts at
> MEASURED are all load-bearing assumptions nobody has yet tried to break. The Gauntlet exists to
> break them on purpose, before a real creator does it by accident.

## What is under test

Not the app. **These files:**

| Artifact | `targets[]` id | What a finding against it means |
|---|---|---|
| `pipeline/RESEARCH-PROMPT.md` | `research-prompt` | The instruction set asked for the wrong things, or didn't ask |
| `pipeline/NOTEBOOK-SCHEMA.md` | `notebook-schema` | The notebook has no field for something the topic needed |
| `app/_phases/_shared/notebook/dimensions.ts` (`DIMENSIONS`) | `dimensions` | The board's columns can't hold this topic's material |
| `app/_phases/_shared/notebook/conclusions.ts` | `conclusions` | The leap ladder / falsifier rule is wrong for this domain |
| `knowledge/ENGINES.md` | `engines` | No engine renders this notebook, or the wrong one is implied |
| `knowledge/TONE.md` (+ a run's `tone-profiles.json`) | `tone` | The tone layer changed the beat chain, or couldn't reach this voice |
| `knowledge/CRAFT-BASELINE.md` | `knowledge` | The craft law fails or mis-fires in this domain |
| `app/_phases/**` | `ui` | The surface can't display or operate what the methodic produced |

**A finding with an empty `targets[]` is not a finding.** It is an observation, and it goes in the
creator's voice section where observations belong. This is the single rule that separates a Gauntlet
run from a focus group.

**Every finding also carries `content | mechanism | lens`** (see `rubric.md`). The middle value was
missing in v1.0 and it is where most real findings live: *the shared mechanism is wrong for
everyone*. Without it, run 1 filed 105 schema defects as `content` — the only remaining label —
which read as "the methodic is fine, it was fed badly" when the opposite was true. A walker said it
plainly: the two-value axis *"has no value for 'the shared mechanism is wrong for everyone'."*

## The cast — Creators, not Characters

We say **Creator**: a durable, repo-committed working video-essayist with a beat, an audience, a
publishing cadence, and a topic they were *already* going to make. Twenty of them, in
`gauntlet/creators/`, across four areas plus the incumbent:

- **Geopolitics (6)** — macro-economy, sanctions & trade, active-conflict OSINT, legislative /
  bill analysis, breaking-news reaction, electoral politics
- **Tech (5)** — software engineering, hardware & semiconductors, LLM/AI research, developer-tools
  business, security & breach analysis
- **Fraud (4)** — public-company financial fraud, crypto collapse, public-sector corruption,
  consumer scam & MLM
- **Entertainment (5)** — game post-mortem, film box-office, streaming-industry economics,
  music-industry, creator-economy meta

Every Creator declares, and is judged identically every run against:

- **Their topic** — a *specific*, currently-live subject from their beat, named in the file. Not "a
  topic about semiconductors". Vague topics produce vague findings.
- **Manual baseline (a NUMBER)** — how long their normal research takes them (`~6h across 3 days`)
  and how long they'd accept via the app. The delta is emitted per run with a confidence.
- **Senior bar** — would the notebook pass as *their own* research? Would they put their name on the
  script it rendered?
- **Exposure bar** — *(Gauntlet-specific, no uat equivalent)* what does being wrong COST in this
  domain? A wrong claim about a named executive is a lawsuit; a wrong claim about a game's sales is
  a correction in the pinned comment. The exposure bar is what will justify most per-domain rules,
  and it is invisible to any methodic derived from a topic with no people in it.
- **Scored criteria** — 5–8 explicit pass/fail checks, applied identically every run. The harness.
- **Lens binding** — which hypothesis lens this Creator's topic falls under, so a finding is
  attributed to a lens rather than floating.

> **Never soften a Creator toward the product.** A cast that likes the methodic tells you nothing.
> At least four Creators must be **structurally hostile** by construction — a topic with no numbers
> at all, a topic where the counter-case is the whole story, a topic whose actors are private
> individuals, a topic that is 48 hours old and has no literature. They are marked
> `hostile: <why>` in their file and they are the most valuable seats in the room.

## Levels (chronological)

### L1 — Dry fit (no research run, mass-parallel)

The Creator reads the methodic *as written* — prompt, schema, dimension list, conclusion rules,
engine catalogue — and walks their topic through it **on paper**. "Given exactly these six search
domains and these seven board columns, where does my material go?"

Catches the structural failures, which for a methodic are the majority:
- **Column sorting** — material with no column, and columns swallowing the topic whole. Score it as
  `orphans: N · max-column concentration: X%`. **Do not score occupancy.** v1.0 scored
  `columns used/total` and run 1 killed it: a seat reported `7/7 used` and then showed one column
  had absorbed **77% of its labour undifferentiated** — *"and 7/7 cannot see it."* Seventeen of
  twenty seats filled 6–7 of 7 while 105 findings landed on the schema, so the dial read reassuring
  throughout. A board's job is to sort, not to be occupied.
- **Evidence-floor mismatch** — the ladder is MEASURED · OBSERVED · INFERRED · ASSUMED. A domain
  whose best available evidence is a single leaked deck starts at INFERRED and every downstream rule
  that privileges MEASURED silently demotes the real story.
- **Counter-case reachability** — Phase 1's last row demands the strongest argument that nothing
  unusual is happening. Some domains have no such literature yet (a 48-hour news topic). Then the
  steel-man requirement is unsatisfiable as written, and that is a `research-prompt` finding.
- **Engine availability** — walk the seven engines and say which could render this notebook. Zero
  is a blocker — that end stands. **Breadth is NOT a smell.** v1.0 called seven engines a sign the
  notebook had no shape; run 1 overruled it 3-to-1 — breadth measures *tellability*, not
  shapelessness, and the heuristic misread process-, argument- and rich-topic material. Report
  instead which engines fit, which are hazardous (an engine can fit well and endanger — see
  `knowledge/ENGINES.md` § Hazard), and what arbitrates between them.

**No run. No searches. Cheap.** Dispatch one agent per Creator; twenty finish in one agent's
wall-clock. Verdicts: `L1-pass` (methodic holds) / `L1-conditional` (holds with majors) / `L1-fail`
(a structural gap blocks the topic — do not spend L2 on it until the gap is recorded).

**L1's blind spot is that it reads the prompt charitably.** A model reading an instruction set
imagines a competent execution of it. The gap between "the prompt asks for the counter-case" and
"the run actually found one" is invisible at L1 and is L2's whole reason to exist. Never let an L1
pass stand as evidence the methodic works — only that it isn't obviously broken.

### L2 — Live notebook (terminal pipeline, real research)

Actually run it. Per `pipeline/RESEARCH-PROMPT.md`, on the Creator's real topic, producing a real
`notebook.json` and at least one rendered script. This is where the methodic is genuinely tested,
because it is the only level where the *output* exists.

**This runs in the terminal, NOT the browser.** The app's research is mocked — the triage board is
wired to the Bitcoin fixture. Driving the browser at this stage would test the fixture, not the
methodic. See `gauntlet/env.md`.

Mandatory checks at L2, each producing findings:
1. **The wiki-timeline test.** Read the rendered script and mark every adjacent beat join as BUT /
   THEREFORE / AND-THEN. Any AND-THEN is a failure of the law in `CRAFT-BASELINE.md`, and the
   question is whether the *notebook* made it inevitable. Report the count, not a verdict.
2. **The arithmetic check.** Word count, runtime at the declared wpm, fact count, source count —
   computed, never estimated. (Inherited scar: a Bitcoin script's frontmatter claimed 5:00/947w over
   a 6:07/1161w body, and none of twelve self-checks was arithmetic.)
3. **The unsourced-claim sweep.** Every factual assertion in the script traced to a notebook fact id.
   An orphan is a `notebook-schema` or `engines` finding depending on where it entered.
4. **The counter-case audit.** Did the run find a real steel-man or manufacture a weak one to knock
   down? A rigged steel-man is worse than none — it launders a polemic as an adjudication. Use the
   three structural tells in `knowledge/ENGINES.md` § D-honest vs D-rigged.
5. **The conclusions pass.** Every conclusion must carry a falsifier. Score whether the falsifier is
   *actually checkable* in this domain — "wrong if the company restates earnings" is checkable;
   "wrong if their intent was different" is not, and an uncheckable falsifier is a fig leaf.
6. **Exposure review.** For any conclusion naming a living person or an identifiable company, the
   Creator states what their lawyer/editor would say. This is not theatre — it is the finding class
   that will drive the Fraud and Geopolitics lenses, and no other level produces it.

**Control arm — run it, it is cheap.** For any claim of the form "the methodic produced X", re-run
the relevant phase with the suspected cause removed. One extra pass turns "the domain table probably
forced this" into a demonstration.

### L3 — Surface (browser) — BLOCKED, and that is finding #1

Load a Gauntlet notebook into the live triage board and check the UI holds it: do the columns render,
does the wound graph resolve against different fact ids, does a 40-fact notebook scroll, does a
notebook with an empty column show an honest empty state or a false one.

**Today it cannot run.** `ResearchStep` reads a hardcoded fixture (`_shared/notebook/notebook.ts`);
there is no path from a produced `notebook.json` to the board. That is a real `ui` finding, it is
pre-recorded in `gauntlet/accepted-gaps.md` as `known-blocker`, and every run re-states it rather
than rediscovering it. When a loader lands, L3 opens and this section becomes live.

## The Judge — Fable, on three benches

The cast is 20 domain experts, each right about their own beat and each systematically biased toward
it. **A creator asked whether their domain needs its own methodic will almost always say yes.** The
judge exists to be the participant with no beat.

Run with `/gauntlet judge [run-id]` — model `fable`, reading **every** artifact the run produced:
L1 reports, notebooks, scripts, findings, and — required, not optional — the first-person voice
sections. The judge sits three benches, in order:

**Bench 1 — Prompt.** Does `RESEARCH-PROMPT.md` ask for the right things? Output is a concrete diff
proposal against the file, not advice. Each proposed edit cites the finding ids that force it and
names what it would have changed in a specific run.

**Bench 2 — Philosophy.** The design commitments themselves, and whether the evidence still supports
them. These are the ones on trial:
- *notebook is the asset, script is a disposable render*
- *research and writing are different steps*
- *opt-in asymmetry* — facts in scope until cut, conclusions out until taken
- *every conclusion carries a falsifier*
- *the one law* — BUT or THEREFORE, never AND THEN
- *tone may never change the beat chain*
- *the wound graph* — descoping has consequences

A philosophy finding is the highest-value output a run can produce and the rarest. The bar is
correspondingly brutal: it requires **two Creators from different areas** breaking the same
commitment on different topics, or one Creator breaking it in a way that cannot be repaired by
content. Anything less is a content finding wearing a philosophy hat.

**Bench 3 — UX.** What the board, the queue, the conclusions section and the notebook modal would
have to become to hold twenty topics instead of one. Cites `ui` findings and the Creators' voices.

### The lens question — the judge's actual verdict

The run's headline deliverable is `LENSES.md`: for each domain, **does it need its own lens, or does
it need different content in the same mechanism?**

A **Lens** is a named pack of *content*, not a fork of the process:
```
lens: <id>
  search-domains:   the Phase-1 table rows for this domain
  dimensions:       the board columns (id, label, what belongs)
  evidence-floor:   where the ladder realistically starts here
  engine-affinity:  which engines render this material, and which mislead
  conclusion-policy: max leap, falsifier standard, naming rules
  exposure-class:   what being wrong costs
```

**THE LENS BAR — the constraint that keeps this from becoming twenty bespoke pipelines:**

> A lens is justified only by a finding the shared mechanism **cannot** hold — not by one it holds
> awkwardly, and never by a Creator's preference. "My domain would prefer different column names" is
> content. "My domain's evidence never reaches MEASURED, so every load-bearing rule demotes my best
> material" is a lens.

The judge must state, for every lens it proposes, **the finding id that could not be satisfied by
content alone** — and for every lens it *declines* to propose, the request it is refusing and why.
Declines are recorded with reasons, in `LENSES.md`, so a declined lens cannot resurface next quarter
as a fresh idea without new evidence.

Five hypothesis lenses are pre-written in `gauntlet/lens-spec.md`. **They are marked HYPOTHESIS and
the judge is instructed to contradict them.** They exist to be tested, not confirmed — the cast is
never shown them before L1, or they will find what they were told to find.

**Calibration from run 1 — the judge must be free to reject the QUESTION, not just the answers.**
The first run returned 187 findings and **zero lenses**: every area declined, and the two axes that
actually predicted fit (evidence **age**, subject **exposure**) were found to be per-run
*declarations* in the shared mechanism rather than packs — the lens layer was carved on the wrong
dimension entirely. The orchestrator had predicted "roughly two of four survive". So instruct the
judge explicitly: *if the evidence says the lens concept is not the right shape for this product,
rule that, and say what replaces it.* A judge that can only choose which lenses to grant will grant
lenses.

### Judge trust rules

- **Opposing verdicts are a finding, never an average.** When two Creators reach opposite verdicts on
  the same mechanism, the conflict is a first-class item — usually a segmentation decision about who
  the methodic is for. It routes to a philosophy question, not a compromise.
- **Voice escalation outranks the finding row.** When a Creator's first-person section indicts a
  dimension harder than their finding scored it, rank by the voice. That gap is the signal.
- **Convergence is not coverage.** Four Creators hitting the same column gap raises its rank; it does
  not discharge the duty to check the other six columns.
- **The judge may not invent a Creator need.** Every item cites a quoted voice or a finding id.
- **Strengths become guardrails**, phrased as constraints on proposed edits — "any new column set
  must preserve opt-in asymmetry for conclusions" — never as compliments.
- **Name the ceiling.** Every proposed lens carries what it still won't handle.

## Mode: `init`

0. **Check for an existing overlay first** (`ls gauntlet/creators/ gauntlet/runs/`). If one exists,
   this is `update` — select from the roster, never author a second cast alongside it. The overlay is
   the durable asset; protect it from its own skill. Say so and switch modes.
1. Read the methodic under test end to end — every file in the `targets[]` table above — plus the
   Bitcoin run in `pipeline/runs/` as the worked reference of what "good" produced.
2. **Research each Creator's beat before writing them** (`WebSearch`/`WebFetch`): how essayists in
   that area actually research, what their sources are, what their normal turnaround is (anchors the
   manual baseline), what gets them sued or corrected. Offline → training data, mark it.
3. Draft Creators per the template in `gauntlet/README.md`. Assign each a **specific live topic**.
4. Write `rubric.md`, `lens-spec.md` (hypotheses, marked as such), `env.md`, `accepted-gaps.md`.
5. Do **not** run anything in `init`.

## Mode: `run`

Selection: all Creators; `--area <geopolitics|tech|fraud|entertainment>`; named Creators; `--hostile`
(the four structurally hostile seats only — the cheapest high-yield sweep).
Flags: `--l1` (dry only), `--l2` (live only, assumes L1), default = L1 then L2 on survivors.

**Brief discipline (inherited scar, do not lose it):** the run brief that primes twenty parallel
walkers is written fast, from a skim, by the one participant nobody reviews. Every orchestrator lead
in it is labelled `HYPOTHESIS — verify independently, and contradict me if the artifacts say
otherwise`, and retracted in-flight the moment one proves wrong. A walker handed an assertion spends
its pass confirming rather than checking, which is the exact bias parallelism was bought to avoid.

Output per run in `gauntlet/runs/<date-slug>/`:
```
BRIEF.md                     # what was dispatched, leads marked HYPOTHESIS
findings.json                # every finding, schema in rubric.md
<creator>--l1.md             # dry-fit report + first-person voice
<creator>/notebook.json      # L2
<creator>/script--<engine>.md
<creator>--l2.md             # live report + voice (APPENDED, never replacing the L1 voice)
SUMMARY.md                   # cross-creator synthesis, impact-ranked
VERDICT.md                   # judge, three benches
LENSES.md                    # the lens rulings + declines + ceilings
```

**Keep both voices.** The L1 voice judges the *designed* methodic, the L2 voice the *produced*
artifact. Overwriting one with the other destroys the escalation between them, which is where the
sharpest findings live.

## Mode: `judge`

Fable over a completed run. Three benches, `LENSES.md`, and a proposed edit set. **Proposals only —
`judge` never edits the methodic.** Adoption is a separate, deliberate act, because a judge that both
rules and executes has no check on it.

## Mode: `adopt`

Take a `VERDICT.md` and apply it. Each accepted proposal becomes a real edit to the named artifact,
in a commit that says which finding forced it. Each declined one is recorded with its reason in
`gauntlet/declined.md`. A lens that is adopted becomes a real entry in `lens-spec.md` with
`status: adopted` and — this is the part that makes it more than a document — a corresponding change
to `DIMENSIONS` / the prompt's domain table, gated so the incumbent market lens still behaves
identically. **An adopted lens that changes the Bitcoin run's output is a regression, not an
improvement**; re-run it as the control.

## Mode: `recertify`

After adoption, re-run the specific `creator × topic` whose finding forced each edit, against that
finding's question only. `resolution: resolved-verified` requires a fresh artifact showing the topic
now survives — plus a `ceiling` naming what it still can't do. "Edited the prompt" is not "resolved".
Findings resolved this way are written back into the **originating run's** `findings.json`, with the
diff report as `recertify.md` beside it — recertify has no run id of its own.

## Trust rules

- **No finding without an artifact.** L1 cites `file:line` in the methodic; L2 cites a line in a
  produced notebook or script. A finding sourced to a Creator's opinion alone is a voice entry.
- **Cross-check before recording.** `artifact_check`: `confirmed-absent | present-but-missed |
  present-broken | by-design | n-a`. "The prompt never asks for X" must survive reading the prompt.
- **Never fabricate research to make a run complete.** An L2 that could not find real sources reports
  that as the finding — a domain where the evidence isn't reachable is exactly what we're hunting.
- **Rank by impact, not severity** — `frequency × reachability × trust_erosion`. A papercut every
  topic hits outranks an unreachable blocker.
- **`recurrence` outranks impact.** A gap that survived a full run→judge→adopt cycle unbuilt and
  returned unchanged has now cost a Creator trust twice.
- **Scope honesty.** Deliberately-not-built is `scope_note`, not a defect. Every `resolved-verified`
  and `by-design` carries a `ceiling`.
- **`accepted-gaps.md` suppresses known issues** so they stop consuming attention.

## Concurrency

- **L1 is mass-parallel** — 20 agents, no shared resource. This is how the cast scales.
- **L2 is expensive and rate-limited by real searching** — batch by area, and prefer running the four
  hostile seats first: they produce the most findings per unit cost, and an L1-fail among them may
  make the rest of the area's L2 moot until the methodic is edited.
- **The judge is single, serial, and reads everything.** Do not shard it; the whole value is one mind
  holding twenty topics at once.

## Skill Reflection

After the run's real work, reflect twice — autonomously. Most runs produce nothing for lane 2; an
empty reflection is a valid result and a forced lesson is pollution.

Lane 1 — PROJECT learnings → `.vault/` per the repo's vault contract.
Lane 2 — METHOD learnings → append to `LESSONS.md` in this skill's directory as
`## <version-used> — <YYYY-MM-DD> — gravitone-gcloud`, with `- ` bullets. Bump `version:` ONLY when
you also edit SKILL.md to apply the improvement in the same change.
