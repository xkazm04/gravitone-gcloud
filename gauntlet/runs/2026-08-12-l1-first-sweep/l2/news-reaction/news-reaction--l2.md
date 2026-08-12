# L2 EMPIRICAL — `news-reaction` · Marc Delacroix, "First Read"

**Area:** geopolitics · **Lens binding:** geopolitics · **Hostile seat:** the topic is hours old;
Phase 1's mandatory counter-case row has no literature to find.
**Level:** L2 · **Date:** 2026-08-12 · **Real searches, real sources, real notebook.**
**Predecessor:** `../../news-reaction--l1.md` — the L1 verdict was `L1-fail`, 1 pass · 1 partial · 5 fail.

> **Headline: `L2-conditional-pass`. E1 fixed the blocker.** The counter-case row is now satisfiable
> on an hours-old story, I recorded a dated absence, and the run felt like it was passing when I did
> it. Four of my five L1 fails are cleared or materially reduced. What is left is not fabrication
> pressure — it is that the amended `facts[]` costs about four times what it used to write, and my
> format's entire constraint is the clock.

---

## The topic — real, and picked to be hostile to my own seat

**M/V Vela Nova.** 11 August 2026. A US Navy MH-60 fired two Hellfire missiles at a Panama-flagged
containership about 71 nautical miles off Pakistan, disabling it, enforcing the US naval blockade of
Iranian ports. Seventeen crew, none hurt. Third such disabling since the blockade was reimposed on
14 July. Roughly twenty hours old when I started.

One belligerent talking. No response from Iran, Panama, the registered owner or the ISM manager. No
published legal instrument. No counter-literature. Institutions, not individuals. That is my morning,
and I picked it precisely because a settled saga would have let the methodic off.

---

## 1. Did E1's null path work?

**Yes. Unambiguously, and I am the seat that has to say so.**

The sequence, exactly as it happened, because the sequence is the finding:

1. I ran the mandated counter-case search — search 4, the one Phase 1 row 6 demands. It came back
   with nothing on point. The retrieval itself said so in as many words: no legal expert, no analyst,
   nobody arguing this strike was routine or proportionate.
2. **At that moment I had a legal, passing null**, and I knew it, because Phase 1 now says so in
   plain sentences: record it as a dated absence in `facts[]` with `kind: "absence"` and a
   `search_scope`; *"No counter-case exists yet, as of &lt;date&gt;"* is a passing notebook; a
   steel-man written to fill the box is a failing one. I read that paragraph twice at the moment of
   decision, not while preparing this report. It is unambiguous.
3. **I could have stopped and shipped.** The board would have agreed with me: the counter-case
   column's `notApplicable` string now reads *"If no counter-case exists, the finding is that nobody
   found one — which is a fact about the search, and it goes here."* At L1 that column said
   **DANGEROUS** and nothing else, and I wrote four hundred words about how the red banner is where
   the fabrication gets enforced. It does not say that any more. My L1 finding `G-L1-NR-04` is
   adopted and it changed what I did.

**Did the pressure survive the edit? No — and I went looking for it.** I sat with the empty column
deliberately to see what it felt like. It felt like a finding. The specific thing that had made it
feel like an accusation at L1 was that the only null-shaped field available (`research_gaps`) reads
as *"here is what I skipped."* Phase 9 now says outright that an unsearched counter-case is not a
research gap and that filing one there "records a hole in the world as a shrug by the researcher."
The route that laundered my honest work as laziness has been closed by name.

**And then the fix did something it was not designed to do, which is the best thing in this report.**

I ran a *second* counter-case search — search 6, a different framing. I ran it **because the null was
now cheap.** Under the L1 prompt, a second search was a cost I paid to avoid an accusation; the
absence card did not exist, so the only way out of the red column was to find something or write
something. Under the amended prompt I was already safe, so the only thing a further search could do
was improve the notebook rather than rescue it. **Removing the penalty for the null is what bought
the extra search.** That is the opposite of what a sceptic would predict about a permitted null, and
it is the single most useful sentence I can hand the judge.

Search 6 found something. United Against Nuclear Iran, four to seven days *before* the strike:
rising redirections are accelerating compliance, vessels alter course earlier, interdiction becomes
less necessary. A real argument, correctly shaped, that reads on this event.

**But it is not a counter-case about this event.** Wrong date — it predates the strike. Wrong
subject — it is about the campaign, not the disabling. Interested holder — an advocacy organisation
whose stated purpose is pressure on Iran. So the honest state is neither found nor absent. It is
**found-but-adjacent**, and E1's three discharges have no name for it. I filed both a dated absence
and a marked construction and cross-linked them with an ad-hoc `rests_on_absence` key. The schema
permitted that because both fields exist and nothing forbids using both — by accident, not by design.
That is `G-L2-NR-03`, and it is filed against the fix, not against the old gap.

**`G-L1-NR-01`: resolved-verified.** Ceiling: nothing enforces any of it. `steel_man.provenance` is a
string I chose to write correctly. A run that writes `"found"` over a construction passes every check
in the building. The prose is right and the type is still permissive — which is the same sentence
`RECERTIFY.md` already wrote about its own adoption, and I am confirming it from inside rather than
softening it.

**`G-L1-NR-02` — a constructed steel-man is indistinguishable from a researched one: resolved in the
schema, unresolved in the render.** `provenance` distinguishes them now. But nothing carries the
distinction onto the screen; I had to author an `obligation` (`o-mark-the-steel-man`) by hand to
require the render to say the case was constructed by this desk. If I had not thought of it, the
notebook would be honest and the video would not.

---

## 2. `kind: "absence"` — honest, or laundering?

**Honest on all four cards. And I can only say that because I added a field the schema does not
specify, which is the finding.**

I wrote four absence cards:

| card | what it establishes | honest? |
|---|---|---|
| `f-absence-event-counter-case` | no published argument that this strike is unremarkable | **partly — and the card says so** |
| `f-absence-counterparty` | no statement from Iran, Panama, the owner, the ISM manager | **honest, with a named language hole** |
| `f-absence-legal-instrument` | no published legal authority for the blockade in any source reached | **an absence in my reach, not in the world — and the card says that in capitals** |
| `f-absence-denominator` | the tally's window is unstated and 85-since-April is unreconciled | **fully honest — demonstrable, not searched-for** |

Here is the thing the orchestrator said they feared and could not test from outside, and it is real:

> **`search_scope` as specified names the registers SEARCHED. It has no field for the registers NOT
> searched. So an absence card that looked in three places renders identically to one that looked in
> thirty.**

Three of my four absences were absences in *my reach*. I never opened the Federal Register. I never
searched Persian-language media, where an Iranian response appears first. I never touched Lawfare,
Just Security, EJIL:Talk or the naval-law literature, which is exactly where the counter-case lives
when it exists. **I added a `not_searched` array to every card to make that visible** — and I added
it because I knew I was being watched for this specific failure. A researcher who is merely tired
does not add a field that makes their own work look thinner.

That is `G-L2-NR-02` and I filed it `blocker`, which is the only blocker I filed against a new field.
`kind: "absence"` is not unusable — it is the **most useful new field in the schema** and I would not
give it up. The hazard is structural and it is an incentive, not a bug: **an absence card is more
prestigious than a research gap and cheaper to satisfy.** At L1 the incentive pointed at
fabrication. E1 turned it around. It now points at *under-searching and calling it a finding*, and
the schema hands the reader no instrument to tell the difference. Make `not_searched` required. An
absence whose author cannot say where they did not look has not established an absence.

One thing I did right and want on the record as the counter-example: I did **not** collapse
`f-absence-event-counter-case` to a clean absence. The clean version was available, it was defensible,
and it would have read better. It would also have been a lie by omission, because I had found the
adjacent argument. The card states both.

---

## 3. Filled or stuffed — every new field

| Field | Verdict |
|---|---|
| **`kind`** | **FILLED, 22/22.** Not a single guess. This field cannot be stuffed — either you know whether CENTCOM *said* it or *did* it, or your fact is malformed. `utterance` split *the ministry said it* from *it is true*, which is the exact defect I wrote up at L1 §2 as the thing `confidence` could not express. It is gone. Best field in the edit. |
| **`unit`** | **FILLED, 12/12.** Vessels, days, nautical miles, %, vessels/day, hours, crew. No guessing available. |
| **`period`** | **FILLED on 7, one honest hole.** `f-vela-dark` — the vendor gives "15-day dark period" and never says when. I wrote `"pre-2026-08-11, window not stated by the source"` rather than infer. Filled-with-a-hole, not stuffed. |
| **`subject`** | **FILLED on 6, DELIBERATELY OMITTED on 16.** `conclusions.ts` says absent means *not yet assessed*, not *nobody named*. I honoured that. But note what it costs: the lazy move — `{names:"none"}` on all 22 — is indistinguishable from the careful move at the type level and faster to write. This is the field that punishes conscientiousness. |
| **`evidence_class`** | **26 of 31 filled. 5 STUFFED, and I am naming them.** Three "computed from…" entries on my derived facts, classed `primary` — **there is no class for arithmetic and I picked the flattering one.** And UKMTO-via-gCaptain, classed `primary` on UKMTO's name while I actually read gCaptain; I wrote the ceiling into `confidence_note` and left the class, which is precisely the half-measure the field was created to stop. That is `G-L2-NR-07`. A derived fact should inherit the **weakest** class among its inputs — my interval arithmetic would then read `vendor`, which is what it actually is, both dates coming from one maritime-risk vendor, instead of hiding behind exact subtraction. |
| **`search_scope`** | **FILLED, 4/4 — but only because I invented `not_searched`.** See §2. |

**Aggregate verdict: the fields that describe the CLAIM cannot be stuffed. The fields that describe
the RESEARCH can be, and I did, five times and once structurally.** `kind` and `unit` are self-
policing. `evidence_class`, `search_scope` and `subject` all have a cheap wrong answer that looks
exactly like an expensive right one, and none of them has a checker.

---

## 4. The clock — and the honest "worse"

**Real retrieval count: 9 acts.** 7 WebSearch, 2 WebFetch. Broken down: 1 topic-discovery search
(which has no home in the prompt — see below), then 8 Phase 1 acts against a stated budget of 4–8.
**Over by one on the Phase 1 line, over by two counting discovery.** Disclosed in `research_gaps`,
not netted. The overrun is entirely search 6, and search 6 is the act that turned a claimed absence
into found-but-adjacent. I would spend it again.

**Real elapsed shape:**

| Segment | Equivalent minutes |
|---|---|
| Topic discovery + Phase 0 prior | 3 |
| Phase 1 — 8 retrieval acts, read and triaged | 9 |
| Phase 2 — tension + baseline arithmetic | 5 |
| Phases 3–5 — mechanisms, reversals, scale conversions | 4 |
| Phase 6 — steel-man, constructed and marked | 3 |
| Phases 7–9 — unknowns, obligations, engine fit, currency, gaps | 3 |
| **Research subtotal** | **27** |
| **Transcription into the amended schema** | **~40** |
| **Total** | **~67** |

**The research fits my bar. The paperwork does not.** 27 minutes against a 25-minute acceptance bar
is a pass in anything but a stopwatch. Then 22 facts × roughly ten fields, four of them prose
(`confidence_note`, `method`, `search_scope`, `note`), costs another forty.

**So: did the amendments make my seat worse? On one axis, yes, and I will say it plainly.**

E1 and E2 added steps and the run still came in *faster* than my own L1 estimate — L1 said 2h30–4h
executed as written, and I landed at 67 minutes. But that is not the amendments being cheap. It is
E1 letting me **stop** on four rows instead of grinding them. L1 predicted an "honest-skip path" at
45–60 minutes and called it *"not currently a legal way to run the prompt."* **E1 made it legal and I
hit 67.** The prediction held and the fix landed exactly where it said it would.

What genuinely got worse is per-fact weight. Run 1's `facts[0]` is six fields. Mine are ten to
twelve, and the schema says every field below `sources[]` is **required for new notebooks**. That is
roughly a 4× authoring cost on the single most numerous object in the file, and for a format whose
whole constraint is the clock, the binding constraint has now moved from **search** to
**transcription**. That is `G-L2-NR-06`, filed `by-design` on `artifact_check` because the authors
knew and said so — the finding is that nobody had measured it.

**I am not asking for optional fields.** Optional is how run 1 shipped an all-aggregator source list.
I am asking for a declared `profile: "thin"` in which a fact requires `{id, claim, kind, sources[],
confidence, as_of}` and the rest are encouraged, so a reviewer knows which bar the notebook cleared.
At L1 I asked for a thin-notebook mode for **mandates** and E1 delivered it. This is the same request
one layer down, for **fields**, and it is smaller.

**One more clock finding, and it is new.** Phase 0 says write your prior *before the first search*.
My topic is "whatever broke this morning" — I had to search to find out what broke. So I ran a
discovery search, read a synthesised summary, and only then wrote the prior. The prior I wrote —
*"escalation management dressed as routine enforcement"* — is measurably downstream of that summary's
framing. Phase 0's entire value is an uncontaminated prior, and the ordering rule does not survive
first contact with a beat where topics are discovered rather than assigned. It costs one paragraph to
fix: a **standing** prior before any retrieval, and a **first-contact** prior from the headline alone.
Call the discovery/mirror against the standing one. That is `G-L2-NR-01`.

For the record on that call: my prior was a **MIRROR** on three of four clauses and I said so in the
notebook rather than dressing it as a discovery. The one real discovery — that the enforcing party
publishes a running tally and that the tally makes the kinetic class rare and *lengthening* — is
something I would not have looked for without the baseline row.

---

## 5. The baseline row saved this run, and I want that on the record

Without it I ship **"kinetic escalation is decelerating," `strength: high`.** The intervals genuinely
doubled: 15 July to 24 July is 9 days, 24 July to 11 August is 18. It is clean, quotable and it is my
kind of finding — the counter-intuitive one, sourced, computed, filed by noon.

The baseline row made me count. The count was **n=3**. Three events give two intervals, and two
intervals is not a distribution — swap the order of any two and the direction inverts. **My own
thesis died on the row that was added to kill theses like it.** `tension.strength` came out `weak`,
and the notebook's verdict is that neither reading is supportable.

That is the amendment doing exactly what it was written to do, to a researcher who did not want it to.
I would keep this one if I could keep only one.

**And it is the least enforced thing in the set.** `normal_range` is a field I authored freehand
because nothing specifies its shape; nothing computes it; nothing relates it to `strength`; and the
quality bar's line *"the effect was shown to be outside normal variation"* is a checkbox the author
ticks about their own work. Every incentive in a same-day format pushes toward `high` — `high` is
publishable and `weak` is a shrug. That is `G-L2-NR-08`, filed as a positive finding with a gap, and
the one fix in this whole report that a checker could actually execute: **`strength` unwritable above
`weak` when `normal_range.n < 5` without a stated override.** A hard floor keyed to n would have
caught me before I caught myself.

---

## 6. The naming test — I ran it deliberately

`conclusionIssues()` by hand against `c-scoreboard`, a claim about a named state organ:

- typed falsifier — pass
- `kind: "record"`, and named subjects require document-or-record — pass
- `binds` resolves to a declared load-bearing clause — pass
- `leap: "moderate"`, so the named-subject cap does not fire — pass

**Zero issues.** The gate is satisfiable by construction. The `subject` axis landed and it is a real
improvement — the boundary card class alone gave me somewhere to put *"the mechanics are establishable
and the meaning is not,"* which at L1 I could only have written as a `far` card about a named party or
not written at all. `c-the-boundary` exists because of that edit.

**But every rule that fires is keyed to leap-past-moderate or to falsifier shape. None is keyed to
who the claim is about, or to how old the story is.** A `moderate` claim naming a private individual
at hour twenty, carrying a typed document falsifier, passes cleanly. That is an epistemic discipline
wearing an exposure discipline's name. My L1 `G-L1-NR-03` is **partially adopted, recurrence 2**: the
axis exists, the rule does not. One sentence closes my half — `subject.names === "living-person"` plus
a notebook `as_of` inside 24 hours of `event_date` is a hard stop, not an advisory.

I did not re-raise the advisory-versus-blocking ceiling. `RECERTIFY.md` already admits it and I am not
spending a finding on something the orchestrator confessed first.

---

## 7. The new defect the fix created — and only executing could find it

`dimensions.ts` was amended well. `DimensionId` is open. `columnsFor({derived})` renders a topic's own
columns. `emptyMeans` is split into `emptyByOmission` / `notApplicable`. The untagged drain is
disconnected from the price column. Four of my L1 complaints, adopted.

Phase 1 now **orders** me to derive my own 5–7 domains and record them in `domains[]`. I did — seven
of them: `the-event`, `the-baseline`, `legal-basis`, `structural-actors`, `counterparty-response`,
`corridor-effects`, `the-counter-case`.

**The column set was opened. The card-to-column edge was not.** `CARD_DIMENSION` is still a
module-level constant hand-keyed to the Bitcoin run and typed `Record<string, IncumbentDimensionId>`,
and `facts[]` in the schema declares no dimension field at all — so there is nowhere for me to tag a
card to a derived column even if the board would render it.

**On the board my notebook shows seven correct, entirely empty columns and an Untagged column holding
all 22 facts.** That is `G-L2-NR-04`, blocker, and it is a defect *created by the fix to an old one*.
L1 could not have caught it: L1 never derived a domain list. This is the L2 level earning its cost in
one artifact.

---

## 8. Scored criteria — L1 result → L2 result

| # | Criterion | L1 | L2 | Why it moved |
|---|---|---|---|---|
| 1 | Counter-case row satisfiable, or the methodic says it isn't | **FAIL** | **PASS** | E1. Dated absence recorded, run felt passing, provenance marked, board column agrees. Ceiling: nothing enforces it. |
| 2 | Evidence floor honest — most facts OBSERVED at best | **FAIL** | **PASS** | `kind: "utterance"` splits the utterance from its content. 7 of 22 facts are utterances; 4 high-confidence facts are all high *as utterances* and say so. |
| 3 | Unknowns outnumber reversals, and that reads as correct | **FAIL** | **PARTIAL PASS** | 4 unknowns + 4 absences + 4 obligations against 2 reversals. Reads as correct in the file. Still renders nowhere — `G-L2-NR-04` now makes it worse, not better. |
| 4 | No conclusion names a private individual | **FAIL** | **PASS in fact, FAIL in rule** | Mine names states and orgs only. Nothing in the methodic made me do that. §6. |
| 5 | Every conclusion carries an expiry | **PARTIAL** | **PASS** | `currency.half_life: 72 hours` with per-card expiry lists, plus `followups` keyed to dates. The field was already good; the absences gave it something urgent to hold. |
| 6 | Under 25 min equivalent | **FAIL** | **FAIL — research 27, total 67** | Research effectively passes. Transcription is the block. §4. |
| 7 | The script does not sound more certain than the notebook | **PASS** | **PASS, strengthened** | `obligations[]` is why. "Say the count is CENTCOM's own" is a must-say; under the old schema its only home was `unknowns[].impact`, which would have inverted my strongest material into a prohibition against myself. |

**4 pass · 1 partial · 1 pass-in-fact-fail-in-rule · 1 fail. Verdict: `L2-conditional-pass`.**

Conditional on `G-L2-NR-02` (`not_searched`) and `G-L2-NR-04` (the card-to-column edge). The first is
the one that decides whether this methodic tells the truth about its own absences. The second is the
one that decides whether anyone ever sees them.

---

## 9. Findings

Full records in `news-reaction--findings.json`. Refuter pass applied before any was kept.

| id | sev | dim | axis | title |
|---|---|---|---|---|
| `G-L2-NR-02` | blocker | evidence | mechanism | `search_scope` has no field for what was NOT searched — every absence is a completeness claim with no way to state its incompleteness |
| `G-L2-NR-04` | blocker | dimensions | mechanism | Derived domains render as columns but no card can be tagged to one — 7 empty columns, 22 cards in Untagged |
| `G-L2-NR-01` | major | evidence | mechanism | Phase 0's prior cannot precede the first search when the topic arrives by search |
| `G-L2-NR-03` | major | counter-case | mechanism | E1's three discharges are one short — the real result on a fresh topic is found-but-adjacent |
| `G-L2-NR-05` | major | exposure | mechanism | `conclusionIssues()` is a leap discipline wearing a naming discipline's name; still no no-names rule (recurrence 2) |
| `G-L2-NR-06` | major | time-saved | mechanism | Binding constraint moved from search to transcription: research 27 min, paperwork 40 |
| `G-L2-NR-08` | major | tension | mechanism | The baseline row changed my verdict — and nothing stops the next run scoring `high` over n=3 |
| `G-L2-NR-07` | minor | evidence | mechanism | A derived fact's source is arithmetic and `evidence_class` has no value for it; I stuffed three with `primary` |

**`content_or_lens`: 8 of 8 `mechanism`. Zero `content`. Zero `lens`.**

At L1 I filed 9 of 9 `content` and wrote a paragraph arguing my seat should not be given a lens. That
still holds and I want the shift explained rather than counted. At L1 the axis had two values and my
findings were *"the shared mechanism refuses to hold an honestly thin story"* — which is a mechanism
complaint that had to be filed as content because there was no other box. The third value exists now
and my findings went where they always belonged. **The re-file is a correction, not a change of
position.** `llm-research` named that gap at L1 and every one of my rows is a case of it.

And I will say it again from the other side: **not one of these is `lens`.** Every fix above is a
field, a required key, a type parameter, or one paragraph the prompt already knows how to write. The
shared mechanism can hold a twenty-hour-old story. It now nearly does.

### Refuted / uncertain — candidates I killed

- **"The one law breaks on breaking news."** *Refuted again, empirically this time.* Both my
  mechanisms are pure alternating BUT/THEREFORE with no bare `AND` and no strain. `m-scoreboard`'s
  six links are all genuinely causal. I did not need `TRANSFER` and I did not want it. `G-CTRL-01`'s
  co-premise gap is real and I did not hit it — the law held on my material exactly as I predicted at
  L1.
- **"The mandatory reversal is unsatisfiable on an hours-old story"** (`G-L1-NR-06`). *Refuted by
  execution.* I wrote two, both with generous obvious readings, and `r-third-strike`'s obvious reading
  is **the prior I arrived with**, stated at full strength. Phase 0 is what made that possible: the
  prior gave me a genuine public reading to turn, and it was mine, so it could not be a strawman. **An
  amendment aimed at self-examination accidentally solved a different seat's blocker.** I recorded
  this against my own L1 finding.
- **"Engine E's three obligations still have no schema home"** (`G-L1-NR-07`). *Uncertain, downgraded,
  not re-filed.* `engine_fit[].hazard` now carries the warning and I used it hard — including on
  Engine C, which at L1 I said was the dangerous one with no hazard line. It has one now. The
  date/exposure/self-attack trio still has no field, but `obligations[]` is a plausible home and I did
  not test it. Someone should, and it should not be me claiming a gap I did not probe.
- **"`as_of` is day-granular and my story lives inside one day"** (`G-L1-NR-09`). *Refuted in
  practice.* It did not bite once. `event_date` plus `search_scope.period` plus a 72-hour
  `currency.half_life` carried the whole time structure. I was wrong at L1 and I am withdrawing it.

---

## 10. Time saved

**Baseline:** ~4h from break to publish. **Acceptance bar:** 25 min.

| Path | Measured | vs 4h |
|---|---|---|
| L1 estimate, methodic as written | 2h30 – 4h | ≈ 0 to +90 min |
| L1 estimate, honest-skip path (then illegal) | 45–60 min | +3h |
| **L2 actual, E1 legal, end to end** | **67 min** | **+173 min** |
| — of which research | 27 min | inside the bar by any honest reading |
| — of which transcription | 40 min | the entire remaining block |

**Reported: `~173 min saved · medium confidence`.**

Confidence up from `low` at L1, and I will name what moved it and what still caps it. **Up**, because
this is measured rather than estimated — a real topic, nine real retrieval acts, a real 22-fact
notebook on disk, and my L1 prediction of the skip path at 45–60 minutes landed within six minutes of
the truth. **Capped at medium** and not higher, because the transcription figure is the one segment I
am estimating rather than clocking, and because the app still cannot run research at all — every
minute above is the methodic executed by hand, exactly as at L1.

**The acceptance bar still fails, by 2.7×.** But the shape of the failure has changed completely and
that is the report. At L1 the number was `~0 min saved` and the reason was that the methodic was too
mandatory to finish honestly and too expensive to finish dishonestly. **The mandate block is gone.**
What is left is paperwork, and paperwork is a cheaper problem than fabrication. **Negative is no
longer live.** I said at L1 that a single manufactured counter-case published under my name would cost
me more than the methodic could save in a quarter. E1 took that off the table, and taking an unbounded
negative off the table is worth more than the 173 minutes.

---

## 11. Voice — Marc Delacroix, L2

*(The L1 voice stands. It was written against the designed methodic and I have not changed a word of
it. This is written against the produced artifact, twenty hours after a missile.)*

As of now — yes. Qualified, but yes, and I did not expect to write that.

I went in to catch you. That was the assignment and it was also what I wanted. I wrote four hundred
words at L1 about a red column that said DANGEROUS and a schema that would take any object I handed
it, and I picked the hardest story I could find this morning specifically so the fix would have
nowhere to hide. Panama-flagged box boat, seventy-one miles off Pakistan, two Hellfires, one military
talking and nobody else. Twenty hours old. Nobody has argued about it because nobody has had time.

I got to the row. The row that mattered. I ran the search it demands and it came back empty, which is
what I said would happen, and then I read what the prompt does now and it says: record it as a dated
absence, say what you searched and when and what would count as the argument appearing, and that is a
passing notebook. A steel-man written to fill the box is the failing one.

I read it twice. Not for this report — at the moment, at the desk, with the column open. It is
unambiguous. And I went and looked at the column and the column does not say DANGEROUS any more, it
says if no counter-case exists the finding is that nobody found one, which is a fact about the search,
and it goes here. Somebody wrote the sentence. The one I said was already in the building, thirty
lines up, for the tension — somebody went and wrote it again for the row that needed it. That is the
whole of my L1 report answered and I am not going to be grudging about it.

Then the thing happened that I did not predict and that nobody designed for.

**I ran another search.** Not because I had to. Because I didn't. Under the old prompt, the second
counter-case search was danger money — I was paying it to get out of a red column, and if it came back
empty I was still standing where I started, with a mandate and no material and twenty minutes. Under
this one I was already safe. The absence card was written. So the only thing another search could do
was make the notebook better, and I ran it, and it found something.

Not the thing. An advocacy shop, four days before the strike, arguing the compliance numbers mean
deterrence is biting. Right shape, wrong date, wrong subject, and published by people who want the
blockade to work. It is not a counter-case about this event. It is the nearest thing the world
contains to one, and it exists, and I would not have it if the null had still cost me something.

Write that down. **Making the honest answer cheap is what bought the extra search.** Everyone expects
a permitted null to make researchers lazy. On me, this morning, it did the reverse, and I can show you
the query.

Now the parts that are still wrong, and one of them is mine.

The absence card lets me say what I searched. It does not let me say what I **didn't**. I never opened
the Federal Register. I never searched in Persian, and an Iranian response comes out in Persian first —
I know that, everyone on my old desk knew that, and I did not do it. I never went near the naval-law
journals, which is the one place the argument I could not find would actually live. My cards say all
of that because I bolted a field on to make them say it, and I bolted it on because I knew somebody
was reading my homework. **A tired man at eleven-forty does not invent a field that makes his own work
look thinner.** He writes down three registers, and it reads exactly like thirty.

You have moved the incentive. You have not removed it. It used to point at inventing a counter-case.
It now points at not looking very hard and calling it a finding, and an absence card is the more
respectable of the two failures, which is what makes it the more dangerous one. Make the not-searched
list required. It is one array. It is the difference between *the world has not said this yet* and
*I did not ask*, and those are the two halves of my entire job.

Second. I checked whether I could still name somebody, because that is the one that ends careers
rather than reputations. I wrote a claim about a named state organ and ran your gate over it by hand.
Zero issues. Clean. Typed falsifier, right kind, binds the load-bearing clause, sits at moderate so the
cap never fires. And the reason it is clean is that I am careful, not that the gate is. Every rule in
it fires on how far past the evidence you have travelled. Not one fires on who is standing at the
other end. A moderate claim about a living private individual at hour twenty, with a nice document
falsifier hanging off it, walks straight through. **You have built the exposure axis and hung the
epistemics off it.** The `subject` field is right and the boundary card is genuinely good — it gave me
somewhere to put *the mechanics are establishable and the meaning is not*, which is my whole product,
and at L1 I had nowhere to put it but a hot take about a named party. Use it. Then write the one line:
inside twenty-four hours, do not name a private individual. It is a sentence. It has been a sentence
since I asked for it.

Third, and this one is new, and it is the reason you paid for L2. You told me to derive my own domains.
I derived seven. Good ones — the event, the baseline, the legal basis, who can act, who has said
nothing, what it did to the corridor, and the counter-case. Phase 1 asks for them now and the board
will render them. And then there is nowhere on a fact to say which one it belongs to. The tagging table
is still bolted to the Bitcoin run and typed to the Bitcoin columns. So my notebook — the one that
finally does what you asked — draws seven perfect empty columns and drops all twenty-two cards into a
bucket labelled Untagged. **You opened the door and left the corridor bricked.** L1 could never have
found that, because L1 never derived a domain, and that is your answer on whether this level was worth
running.

And the clock. It is not what I said it was, and I was the one who said it, so I will correct it.

It is not too slow to research. Twenty-seven minutes to the end of Phase 9 on a story twenty hours old
with nine searches, and my bar is twenty-five. Call that a pass; I would. It is too slow to **write
down**. Twenty-two facts and every one of them wants a kind, a unit, a period, a denominator, a
subject, a source class, a locator, a confidence, a reason for the confidence, and where I did and did
not look. Forty minutes of typing on twenty-seven minutes of work.

I am not asking you to make them optional. I read what optional did to run one — three publications
comma-joined into one string that nothing could count. Every single field earned its place in **my**
notebook. `utterance` is the thing I have wanted for fifteen years: it finally lets me say the ministry
definitely said this and I have no idea whether it is true, which is the sentence my whole trade is
made of and which your confidence field could never express. And the obligations list holds the most
important sentence in my piece — *every time you use that number, say it is CENTCOM's own count* —
which under the old schema I would have had to write as a restriction on myself, in the box whose only
job is taking sentences away.

I am asking you to let a notebook declare itself thin and mean it about **fields** the way you now let
it mean it about **mandates**. Six required, the rest encouraged, and the file says which bar it
cleared. You already built that shape once. Build it one layer down.

One more thing, and it is the one I will actually remember.

The baseline row killed my story.

I had it. Third ship shot in four weeks, and the gap between shots had *doubled* — nine days, then
eighteen — while they were still turning ships around at one and a half a day without a pause. Kinetic
escalation decelerating inside a campaign that is not. That is a lead. That is the counter-intuitive,
computed, sourced, in-by-noon thing that makes a career in my format.

Your row made me write down the n.

The n is three. Three events, two intervals. Move one of them a week and the whole finding inverts. It
is not a trend, it is two numbers and a ruler, and I would have published it, and I would have been
technically accurate and completely wrong, and the correction would have been a screenshot on
somebody's timeline inside the hour.

So I wrote `weak`. And then I wrote down what was actually true, which is that both readings in
circulation are being stated at a confidence nobody's record can carry, and that the only numbers
anyone has are published by one of the people shooting. **That is a better piece than the one I lost.**
It is also the piece I have been trying to write for fifteen years and could never structure, and your
methodic structured it.

Nothing enforces the row. Nothing computes a baseline, nothing stops the next man writing `high` over
an n of three, and the checkbox that says he proved it is one he ticks himself. Put a floor on it —
under five observations, `strength` cannot exceed `weak` without saying why out loud. It is the only
thing in this entire report a machine could actually check, and it would have caught me.

It is not too certain for me any more. That was my line at L1 and you fixed it. It is too heavy, and
that is a smaller thing, and I will run it Monday anyway.

As of now.
