# NOTES — conflict-osint L2 run · 2026-08-12

What this run did, what it could not find, and what it had to invent. Written flat.

## The topic actually researched

Not my L1 topic verbatim. My L1 topic was the $500-drone-versus-$4M-vehicle meme; I moved to the
**air-defence cost exchange** — one-way attack drones against layered interceptors — because it is the
same question with three things my L1 topic lacked: a genuinely **primary** cost source (a published
government budget justification), a **belligerent-claimed** attrition series updated monthly, and a
**published counter-literature**. That gave me all three of my provenance classes in live material
instead of one, which is what the L2 brief needs from this seat.

The topic is a cost-exchange / attrition question in a current conflict, on open published material.
No unit is named. No individual is named. No attribution of any strike is asserted anywhere.

## Search log — 8 searches, 2 fetches

The prompt budgets 4–8 for Phase 1. I used **8 searches and 2 fetches**. Top of budget, not over it.

| # | Type | Query / URL | Domain served | Outcome |
|---|---|---|---|---|
| 1 | search | Shahed-136 unit cost estimates 2025 | the-price | The $10k–$193k spread. The best fact in the notebook and it arrived first. |
| 2 | search | PAC-3 MSE unit cost FY2026 budget justification | the-price / procurement-politics | $3.871m flyaway, and the URL of the primary document. |
| — | **fetch** | asafm.army.mil FY2026 Missile Procurement PDF | primary-source attempt | **HTTP 403.** Named the primary, could not read it. Recorded as a gap, not laundered. |
| 3 | search | Ukrainian AF monthly Shahed shoot-down claims 2026 | the-count | June figures; and the tell that the series stopped after May. |
| — | **fetch** | isis-online.org monthly Shahed analysis | the-count | The methodology disclosure. The single most valuable retrieval of the run. |
| 4 | search | Ukraine interceptor drone unit cost 2026 | the-price / the-engagement | $1,000–$3,500. This is where the thesis appeared. |
| 5 | search | critique of cost-exchange ratio as a metric | **the-counter-case (mandatory)** | CSIS + Modern War Institute. Found, not constructed. |
| 6 | search | historical air-defence cost exchange, Vietnam SAM, Iron Dome | **the-baseline (mandatory)** | Iron Dome 100:1–500:1; Vietnam belligerent disagreement. |
| 7 | search | independent verification of interception claims | the-count | The absence, with its scope. |

Two declared domains — **industrial-base** and most of **procurement-politics** — went unworked. Both
are in `research_gaps`. The steel-man rests part of its weight on magazine depth and I did not go and
check it. That is a real hole and it is recorded as one.

## What the run could not find

1. **The primary budget document.** Published, named, 403 to this tool. `f-pac3-unit` therefore sits
   at `medium` on two agreeing secondary reports. Rule 4 of the schema says a load-bearing
   quantitative fact reaches a primary source **or carries a named gap**; it carries the named gap.
   This is the rule working exactly as designed, and it is the only place in the run where a new rule
   changed my behaviour rather than merely recording it.
2. **Any independent interception count.** Not from a shortfall of searching — it does not exist.
   Filed as `f-no-independent-verification`, `kind: "absence"`, with a search scope that names what
   would count as the absence ending and what I did not search.
3. **Any visual-confirmation evidence at all.** Structural, and worth stating plainly: my discipline's
   core evidence class has no instance in this notebook, because **you cannot geolocate a negative.**
   An Oryx-style database catalogues wreckage that arrived. There is no photograph of a drone that did
   not. Every interception figure in this domain is, permanently and by the nature of the event, a
   claim by the party that made it.

## What the run had to invent

Three things, named because the brief asks for exactly this.

1. **`steel_man.provenance`.** Mandated twice by `RESEARCH-PROMPT.md` (`:51`, `:125`) and by the
   quality-bar row *"if constructed, it says so"*. Declared nowhere — not in `NOTEBOOK-SCHEMA.md:137`,
   not in the consumer table, not in `types.ts:197-202`. I wrote it anyway (`"found"`) and recorded
   the defect inside the field, because the alternative was to obey the prompt silently or disobey it
   silently.
2. **`tension.strength_note`.** Invented, because the schema and the prompt now define `strength`
   differently and I refused to pick one silently. `NOTEBOOK-SCHEMA.md:55` = "checkable, widely held,
   **and demonstrably wrong**"; `RESEARCH-PROMPT.md:79` = "how **checkable** the tension is, not how
   large it is". I graded against the prompt as the later document and said so in a field I made up.
3. **`sources[].interested` used as a load-bearing signal.** The field exists and is documented as
   *"interest is NOT unreliability"*. Nothing consumes it — it has no row in the consumer table. I
   used it 13 times across 34 sources and it changed nothing downstream. See the report.

## Self-caught defects in my own notebook, left in place

I am reporting these rather than fixing them, because they are evidence.

- **`f-category-mismatch-57k` is `load_bearing: true` and nothing rests on it.** No mechanism step, no
  reversal, no unknown, no obligation references it. It is one of five orphaned facts (the others are
  not load-bearing). Nothing in the schema, the prompt or the quality bar noticed. I found it by
  writing a five-line script over my own JSON after the fact. A wound graph that models support can
  see a fact with no dependents and does not say so — which is the mirror image of `G-CTRL`'s uncited
  spine, from the other end.
- **`f-ratio-interceptor` is `load_bearing: true` at `low` confidence.** That is the combination the
  schema calls "the single most dangerous thing in a notebook", and it is correctly flagged with a
  confidence note and bounded by `u-interceptor-pk` + `o-state-the-direction`. It is left low on
  purpose. The temptation to grade it `medium` so the notebook looks cleaner is the exact pressure
  this seat exists to report, and I felt it.

## Arithmetic — every comparison recomputed

Per L2-BRIEF hard rule 3. All computed, none estimated.

| Claim | Computation | Result |
|---|---|---|
| June interception rate | 5285 / 5749 | 91.93% — matches the stated 92% ✓ |
| June impacts | 5749 − 5285 | 464 — matches the stated 464 ✓ |
| PAC-3 vs Shahed band | 3,871,000 ÷ {193,000; 50,000; 20,000; 10,000} | 20.06 · 77.42 · 193.55 · 387.10 |
| Interceptor vs Shahed | 2,000/50,000; 3,500/10,000 | 25:1 and 2.86:1 favourable |
| Metric's own span | 387.10 × 25 | 9,677.5 → stated as "roughly 9,700x" |
| Iron Dome, recomputed | 50,000/800 ; 80,000/300 | **62.5 and 266.67 — the quoted 500:1 is unreachable** |
| Shahed share of the broad claim | 5,053 / 57,400 ; 57,400 / 5,053 | 8.80% ; 11.36x |
| Shahed cost spread | 193,000 / 10,000 | 19.3x for one airframe |

**The Iron Dome row is the one that matters.** The quality bar's new arithmetic checkbox made me
recompute a figure I had no suspicion about, and the widely-quoted 100:1–500:1 range does not
reproduce from the component prices printed beside it in the same articles: the reachable band is
62.5:1–266.7:1, and 500:1 requires a rocket priced at $160 against the dearest interceptor. I am not
alleging bad faith — a range this old accretes and its halves get updated separately. I am saying it
cannot be recomputed, so `u-500-to-1` forbids the script from quoting it.

That is the first time in two levels of this exercise that a rule in this methodic found something I
had not already found myself. It should be said as plainly as the failures.
