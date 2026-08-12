# Run 1 — process notes

**Topic:** "Why Bitcoin price does not rise" · **Date:** 2026-08-11 · **Cost:** 6 web searches, one
session · **Output:** 1 notebook, 3 renders.

The actual deliverable of this run is not the scripts — it is what we learned about the process.

---

## What worked

**1. The notebook/render split is real, and it is the whole design.**
`script--reversal-chain.md` and `script--adjudication.md` were built from the identical notebook with
**zero re-research**, and they are genuinely different videos — different spines, different pacing,
different places the thesis lands. This is the property that makes the artifact worth building: research
is expensive, rendering is cheap, and a creator can try three shapes for the price of one investigation.

**2. Tension-finding is the whole job, and it is separable.**
The research produced a lot of facts. Exactly one thing made it a video: *Bitcoin got everything it
asked for, and that is why it stopped going up.* Every fact then sorted itself into evidence for or
against that. **Finding the tension took one of the six searches; the other five were evidence
gathering.** That ratio is the argument for splitting research from writing.

**3. Pre-authoring mechanisms as BUT/THEREFORE chains made scripting almost mechanical.**
`mechanisms[].chain` in the notebook *is* the beat chain. Writing the script became sequencing and
prose, not construction. The but/therefore validation passed on the first attempt for both renders,
which has not happened when I have written scripts without a notebook.

**4. `unknowns[].impact` earned its place immediately.**
Sources quoted Bitcoin at $60k, $62k and $65k in the same week. The notebook's impact line —
*"say 'around $60,000' or 'roughly half its high', never a precise figure"* — went straight into both
scripts and into the `currency` advice. The script is now correct for months rather than days. **This
field converts a research annoyance into a craft improvement.**

**5. The steel-man requirement changed the verdict.**
Forced to write the strongest counter-case, the run surfaced that Strategy is *not* a forced seller
(2.5 years of coverage) and that long-term holders *added* 380k BTC after the crash. Without that, both
scripts would have been a bear case pretending to be an explainer. The honest verdict — *the mechanism
changed, the asset didn't break* — is better and is only reachable via Phase 6.

---

## What did not work

**1. The tension was found by luck, not by procedure.**
Phase 2 of `RESEARCH-PROMPT.md` now lists five tension shapes — but those were written *after* the fact,
by noticing what I had done. On the next run the shapes should be applied *prospectively* and the run
should report which one fired. Until that has worked twice, `q3` (how a writer gets from topic to
tension) is not answered, only illustrated.

**2. No primary sources.** Every on-chain figure came through an aggregator or a secondary article.
Two on-chain claims in the notebook may contradict each other (3.67m distributed vs 380k accumulated)
and I could not resolve it — it is recorded as an `unknown` and used as *competing readings*, which is
honest but weaker than resolving it. **A real run needs Glassnode/CryptoQuant directly.**

**3. One low-confidence figure nearly got laundered.** The "93% of variance / 7.6x amplification"
liquidity statistic is vendor research, single-sourced, methodology unreviewed. It is *very* quotable
and I wanted to use it. The confidence field caught it and it was **cut from both scripts**. Without the
schema forcing a confidence rating, it would have been in the final render stated as fact.

**4. No humour anywhere.** All three renders are dry. The knowledge library says a joke may not occupy
a beat of its own, so humour has to ride inside information — and the notebook has no field that
collects candidate moments for that. Both Fireship and Economics Explained would have found several
here (the reserve nobody can count; thirty-two coins). **This is a schema gap.**

**5. The mid-length turn cadence was violated and I had to declare it.** Turns 3 and 4 in the Reversal
Chain render sit 15 seconds apart, against a 60–90s guideline, because turn 3 sets up turn 4. Either
the guideline needs a "stacked turns" exception or the render needs restructuring. Recorded rather than
hidden, but it needs resolving.

---

## Changes to make before run 2

| # | Change | Where |
|---|---|---|
| 1 | Add a **`humour_candidates[]`** field — moments where a joke could carry information | `NOTEBOOK-SCHEMA.md` |
| 2 | Phase 2 must **name which tension shape fired**, prospectively | `RESEARCH-PROMPT.md` |
| 3 | Require **primary sources for load-bearing quantitative claims**, or an explicit gap entry | `RESEARCH-PROMPT.md` quality bar |
| 4 | Add a **stacked-turns exception** to the mid-length cadence rule, or reject it | `mid-educational-video/PATTERNS.md` §2 |
| 5 | Add **`visual_candidates[]`** — the Frames step will need what to show, and this run threw away obvious material (the mNAV chart, the price line, the reserve that isn't there) | `NOTEBOOK-SCHEMA.md` |

## Open question this run raised

**Should the notebook contain the question stack, or should the render?** Currently the notebook holds
`candidate_questions[]` and each render picks. That worked — but the Adjudication render needed
*candidates*, not questions, and had to derive them. Possibly the notebook should hold a neutral
`movements[]` structure that each engine reshapes. Undecided; needs run 2 to test.

## Not yet tested

- Whether these scripts are any **good** to a viewer. Nothing has been produced or voiced.
- Whether the tone layer (`knowledge/TONE.md`) can be applied to a render without disturbing its beat
  chain. **This is the next thing to try in the terminal**, and it is cheap: take
  `script--reversal-chain.md` and re-render it in two different voices from the same beat list.
- Whether a second researcher (or a second session) produces the same tension from the same topic.
  If not, the process is not yet a process.


---

# Addendum — browser verification (2026-08-11)

Playwright installed (`@playwright/test` + chromium). `pipeline/drive-script-step.mjs` drives the
Script step: **29/29 passing**, captures in `captures/`.

## What only a real browser could find

**1. The scroll lock was locking the wrong element — a real bug, now fixed.**
`Modal.tsx` set `document.body.style.overflow = "hidden"`, but on this page the scroll container is
`documentElement` (`html` overflowY `visible`, body height-auto inside it). Measured: **the page
scrolled 1465px behind an open dialog on one wheel gesture** — so you close the notebook and you are
somewhere else. Now locks both `html` and `body`, and pads for the vanished scrollbar so the layout
behind cannot jump. Verified: 0px of background travel.

**2. The modal itself was fine.** `.scroll-y` body, `overflow-y: auto`, 6546px of notebook in a 616px
box, scrolls internally. Focus trap holds through 25 tabs; Escape closes; 768px shows 0px of
horizontal overflow. The prototype agent's design was correct — only the lock was wrong.

## Three false failures I caused, worth writing down

Every one produced a red result that was **my instrumentation, not the app**:

1. **A selector that matched the wrong thing.** `getByRole("button", {name: /notebook/i}).first()`
   matched the outcome pill *"returns a notebook"* before the real opener. Fixed by adding
   `data-testid="open-notebook"` to the three openers. *A name regex plus `.first()` is a silent
   mis-target.*
2. **`npm run build | grep … | head -3` killed the build.** `head` closed the pipe partway, leaving a
   half-written `.next`, and the server then served it. This is the exact hazard `ship-loop`'s
   evidence rule names — never pipe a build through `head`; redirect and check `$?`.
3. **A stale server answered convincingly.** `kill $(cat pidfile)` did not kill the node process, the
   new server failed with EADDRINUSE, and three test runs then hit the OLD build without saying so.
   This is `/uat`'s "never reuse an app instance across builds" rule, learned again. **Kill by the PID
   holding the port, and assert the new server printed `Ready` before driving.**

The assertion itself was also wrong once: *"the page must not scroll while the modal is open"* — the
page behind a modal is legitimately long. The requirement is that a **wheel gesture cannot move it**,
which is what the test now checks.

## The load control

`load saved run` added to the shared `OutcomePicker`, so it appears in all three variants. Jumps
straight to the finished notebook: **57–69ms against ~5100ms** for the simulated run. It carries
`LOAD_NOTE` and, once used, a visible `saved research · not re-run` marker — a surface that fakes a
completed run has to say so.


---

# Addendum — the step split (2026-08-11)

**Assay bench is the Script baseline.** Wire desk, Foundry and the old Manuscript switcher are
deleted. The shared module moved `script/_script/` → `_phases/_shared/`, because it is no longer
script-only.

**Step 1 (Research) split out of Step 2 (Script).** The reason is not layout: *a notebook is what the
research found; a scope is what the creator decided*, and collapsing them meant every disagreement
with the research cost a re-run. Separating them also makes preference-learning possible from
decisions rather than only from finished scripts (`knowledge/TONE.md` §4).

## The three signals, deliberately unequal

| signal | changes | routes |
|---|---|---|
| **descope** | this script | forward, consequentially |
| **like** | nothing now | into the tone profile, for future scripts |
| **deepen** | nothing now | *backward*, to the next research run |

Rendering them identically would teach the creator they are interchangeable. They are not, and the UI
says so on each control.

## What makes this more than a card sorter

The notebook is a **graph** — the fixture already had it: `reversals[].evidence[]` cites fact ids and a
`mechanismId`. So `scope.ts` computes **wounds**: descope a fact and every turn standing on it is
marked *weakened*; remove all its supports and it is *broken* — "a reversal with no surviving evidence
is an assertion". Verified live: cutting `f-mnav` weakens r2; cutting its three facts **and its
mechanism** breaks it; restoring heals it.

**The steel-man cannot be descoped at all** — `NOTEBOOK-SCHEMA §steel_man` makes it mandatory, so the
control is disabled with the reason, and the confirm gate blocks if it were ever removed.

## The three variants

- **Triage board** — sorting. All 27 cards in the six domains `RESEARCH-PROMPT` Phase 1 defines, so the
  review columns are the research brief's own checklist. An empty column states what its emptiness
  *means* rather than showing "nothing here".
- **Review queue** — adjudication, one card at a time, keyboard-driven (`d`/`l`/`r`/`→`). Exists so the
  27th card gets the attention the 1st did.
- **Load map** — structure. Cards ordered by how much weight they carry; selecting one lights what it
  holds up and what holds it up. The other two tell you a turn broke *after* you cut; this one tells
  you before.

## Verification

`pipeline/drive-research-step.mjs` — **18/18**, captures in `captures/`. The assertions that matter are
behavioural, not visual: wound propagation, the steel-man lock, and that **like/deepen do not move the
scope count** (27 → 27).

**One more test-not-app failure**, the fourth today: I wrote the r2 dependency list as three facts and
it correctly reported "weakened" rather than "broken" — because a reversal also stands on its
*mechanism*, four supports not three. The app was right. Recorded because the pattern is now
consistent enough to be a rule: **when a driven assertion fails, suspect the assertion first.**


---

# Addendum — the gated studio, driven (2026-08-12)

**73 driven assertions across three scripts, all green:** `drive-signed-in.mjs` (35),
`drive-persistence.mjs` (7), `drive-research-step.mjs` (18), `drive-followup.mjs` (16 — pre-split).

## The dev auth bypass

`lib/devAuth.ts`, authorised by the owner. Gated on `NODE_ENV !== "production"` **and**
`NEXT_PUBLIC_DEV_AUTH=1`. Verified in the emitted production bundle: `DEV_AUTH` exports as the literal
`!1`. The bypass cannot activate in production.

**Correction to what was claimed while building it:** it does NOT "compile out entirely". The fixture
object still ships as dead data (`{uid:"dev-automation-user",…}`) because the minifier keeps exported
consts. Behaviour is gated; strings are present. Nothing sensitive, but the original claim was wrong.

`next.config.ts` gained `distDir: process.env.NEXT_DIST_DIR || ".next"` — a second `next dev` refuses
to start while another holds the build lock, which is right for humans and wrong for automation.

## Three real bugs the browser found

1. **Conclusions were unreachable.** The triage board treated "nothing kept in this column" as "column
   is empty" and hid the cards. Conclusions start *out* of scope by design, so the column rendered as
   empty and **no conclusion could ever be opted in** — the feature did not work at all. Fixed: cards
   always render; the warning sits above them.
2. **Job persistence wrote empty arrays over the stored record.** The hydration guard was a `useRef`
   set synchronously inside the rehydrate effect — so the persist effect, running immediately
   afterwards on the same mount while state was still `[]`, saw `hydrated === true` and clobbered
   localStorage. Nothing survived a reload. Fixed by making it state, so persistence cannot run before
   the rehydrated values land. **A ref is not a barrier between two effects on the same mount.**
3. **The scroll lock locked the wrong element** (recorded in the previous addendum).

Bugs 1 and 2 were both invisible to `tsc` and to `npm run build`, and both were found in the first
minute of driving the surface. That is now three sessions running where the type system and the build
were green over a broken feature.

## Interrupted jobs

Jobs persist to `localStorage` across reloads. A job that was RUNNING when the page died is marked
**interrupted** — not resurrected as live, not quietly called done. The bell shows it in amber with
"the page reloaded while it was running — start it again". A real local CLI process might genuinely
still be going; reattaching to one is a backend problem this prototype does not have, and pretending
otherwise would be the dishonest option.

## Conclusions, and the hottest take

Seven conclusions on the Bitcoin project, each carrying a **leap**, a **precedent**, and — required —
**what would falsify it**. Off by default; facts are in-scope until cut, conclusions are out until
taken. That asymmetry is the safeguard against an unsourced synthesis laundering itself next to
sourced facts.

The seventh is the 😈 **hottest take** (`c-reserve-was-the-product`): *the Strategic Bitcoin Reserve
was never meant to be built — announcing it was the product.* Leap tier `unhinged`, labelled
"speculation about motive — not reporting", and **still carrying a falsifier** (a funded, audited
reserve with a published coin count). A spicy claim that cannot be wrong is just an accusation, so
the hottest take is held to a higher bar than the others, not a lower one.

## UI adjustments

Descoped cards are signalled by an **amber border, never by fading the text** — muting is
self-defeating on a surface whose job is deciding what stays, since the card you most need to re-read
is the one you just cut. Section titles are 13px unmuted white; Conclusions takes the app's teal
accent instead of wrapping the whole column in a coloured border.

---

## 2026-08-12 · step-folder refactor, and the crash it was hiding

### The crash

`ScriptStep.tsx:363` — `Cannot read properties of undefined (reading 'impact')`.

`CONSTRAINT_LEDGER` addressed notebook unknowns **by array index**. Follow-up
round 1 resolved one unknown; the array shrank from four to three; every stored
index pointed one slot to the left and `unknown: 3` pointed at nothing. My
regression, introduced when I applied the follow-up results.

Fixed structurally, not with a guard clause:

1. `Unknown` gained an `id`. Ledger rows name an unknown by id, so deleting a
   neighbour cannot re-aim them (`app/_phases/script/constraints.ts`).
2. Resolved unknowns are **kept** and flagged `resolvedBy`, never deleted. The
   two that round 1 settled are back in the notebook, marked resolved.
3. A ledger row that still cannot resolve is **reported** (`ledger-dangling`),
   not skipped — a ledger silently rendering three rows where it has four is the
   same defect wearing a guard clause.
4. New state `superseded`: the render honours a constraint that has since been
   lifted. Derived from data, not hand-written. Both mid-length renders are
   over-hedged on the cohort question — they still refuse to name the seller,
   which round 1 established they may.

### A second bug found on the way

`CARD_DIMENSION` still mapped the dead `f-liquidity` and had **no entry for any
of the three facts round 1 added**. They hit `?? "the-number"` and were filed in
the price column — a reviewer reading the demand story would never have found
them. Fixed, and `untaggedIds()` now exposes the condition instead of letting the
fallback swallow it.

### The refactor

One folder per step; `_shared/` reduced to what genuinely crosses steps.

- `_shared/notebook/` — the contract Research writes and Script reads
  (types, facts, unknowns, the fixture, and the modal that renders it)
- `_shared/run/` — the local-process engine (trace, hook, controls, log)
- `_shared/ui/` — `Notice`, the one banner both steps use
- `research/` — scope, dimensions, conclusions, follow-up, board, `_parts/`
- `script/` — renders, constraints, types, `_parts/`

Every file under `app/_phases/` is now **under 200 LOC** (was: 6 files over).
Untouched and still over: `lib/jobs.tsx` 244, `lib/projects.ts` 208,
`app/_projects/ProjectsMatrix.tsx` 202, `ProjectDialog.tsx` 202 — outside the
step scope of this pass.

### Two drive scripts were dead and reporting nothing

`drive-research-step.mjs` and `drive-script-step.mjs` both drove the **landing
page** and clicked prototype variant tabs (`Wire desk`/`Assay bench`/`Foundry`,
`variant-board`/`queue`/`map`) that were deleted when the baselines were picked,
on a route that has since moved behind auth. Both had been failing at their first
click since before this session. Rewritten against the gated studio:

- `drive-script-step.mjs` (22) — the ledger regression gate: all three renders
  draw, every unknown scored, no dangling rows, supersession is per-unknown.
- `drive-research-step.mjs` (18) — column integrity, reading placement off the
  DOM rather than off the table that produced it.

### Gates

`tsc` clean · `next build` clean · **82/82 driven assertions**
(script 22 · signed-in 35 · research 18 · persistence 7).

`tsc` and `next build` were green through the entire lifetime of the crash. That
is now four consecutive sessions where the compiler passed a broken feature and
only a click found it.

### Open

`context-map.json` is stale after this: 12 mapped paths no longer exist, 38 new
files are unmapped. It is a **Personas export** — rescan from the Personas app's
Context Ledger; do not hand-edit.

---

## 2026-08-12 (later) · Step 2 stripped back, and the impact matrix prototyped

### Step 2 no longer runs research

Removed the topic field, the outcome picker, the nine-phase run rack, the run log
and the failure/no-tension notices — all vestigial from when this was Step 1. Two
steps could each start a research run and disagree about whether one had
happened. Step 2 now READS `loadStep(projectId, "research")` and renders an
honest empty state for a project Step 1 has not researched (Glass Harbor does
exactly this). `AssayRack.tsx` and `PhaseLamp.tsx` deleted; `_shared/run/` moved
to `research/run/` now that only Research uses it.

### The evidence log moved to Step 1 — and became a different document

It was opening the same `<NotebookBody>` as the notebook button, under a
different title. Two buttons rendering identical content is a defect, so the
Evidence log is now the claim-level audit it always claimed to be: the counts,
the open constraints, every claim dated/sourced/rated, the half-life, the
sources. The notebook stays the argument. Different question, different artifact.

### Scope became one shared, persisted record

`useScope()` was per-mount React state. A scope control in Step 2 would have been
writing to a document nobody else could see. It now takes `projectId` and
persists under its own `research-scope` phase key, hydrate-guarded the same way
`lib/jobs.tsx` had to be. A descope in the matrix reaches the triage board and
back — driven both directions.

### impact.ts — what each render spent on each card

Beat-level attribution, hand-authored against the actual script files (a card is
attributed only where the render's TEXT states it). **Seconds are computed from
the beat marks**, never typed, so the numbers follow the script if a beat moves.
Three states: `spoken` (with the beats as receipt), `cut` (with the render's own
reason), absent.

Two findings the matrix surfaces that nothing else did:
- **All 7 conclusions are in no render.** They were reasoned after these scripts
  were written. That is a gap in the scripts, not the research.
- **Both mid-length renders cut `f-liquidity`, which no longer exists.** The
  decision was real; the row has nowhere to sit. Reported via `orphanedCuts()`
  rather than dropped — same discipline as the dangling constraint rows.

### Round 1 · three variants (awaiting the pick)

- **A · Ledger** — the spreadsheet. 28px rows, sticky dimension rules, unused
  cells as hairline dots. Read ACROSS. Scope pip is the first column, so a
  descope sweep down the left edge is the fastest pass of the three.
- **B · Spend bar** — the matrix as a budget. No columns; one stacked bar per
  card, sorted by spend, all bars on one scale. Unspent cards collapse to chips
  instead of 15 empty rows. Read HOW MUCH.
- **C · Tracks** — three edit tracks in running order. Never draws an empty cell
  (13 / 12 / 5 items instead of 108 cells); everything unused drops into one
  shared gutter. Read WHERE IN THE VIDEO.

### Gates

`tsc` clean · `next build` clean · **72/72 on my drives**
(matrix 25 · script 22 · research 18 · persistence 7).

`drive-signed-in.mjs` is 41/42 — the one failure is `muted text unmutes on
hover`, which belongs to a **concurrent session's in-flight work** in
`research/_parts/CardTile.tsx` (card-as-scope-toggle + hover-unmute). That file
was left untouched on purpose, including its 230 LOC. I did update three drive
selectors that session's change invalidated (`descope-<id>` → the card itself).

---

## 2026-08-12 (evening) · four tabs, and the recalibration loop

### The three matrix variants became four standalone tabs

Nothing was consolidated — all three earned a place and answer different
questions, so the nested "Impact matrix → pick a variant" switcher is gone and
Step 2 is now **Candidates · Coverage · Spend bar · Tracks**. Variant A renamed
**Coverage**. Tracks is explicitly re-scoped as the bridge into Step 3 (Frames):
it answers WHERE a card lands, not how much it weighs, and its header comment
says so before anyone adds a weight feature to it.

### Titles, and the rows that were being hidden

Coverage and the Spend bar now put the **full untruncated title on a second
line** under the id + bars. Truncation was trading the one thing you are judging
for the shape of the table. Both also render **every card**, including the ones
no render used — a row of zeros is a finding, and it is now something you can put
a note on like any other row. The Spend bar's chip-cloud for idle cards is gone.

### Versioning — feedback aggregates, one recalibration answers all of it

- `versions.ts` — the note model, the aggregation, and a **mocked** recalibration
  labelled as such everywhere. It re-weights research; it does NOT rewrite beat
  text, which is exactly why Candidates and Tracks stay on the baseline.
- A `custom` free-text note **moves no bar**, and says so. Inventing a delta from
  text nothing here can read would be the dishonest option.
- Runtime is fixed, so a recalibration that over-commits a render reports an
  **overrun** rather than silently rescaling everyone's seconds to fit. A plan
  that does not fit is a finding.
- `useVersions.ts` — one recalibration per project (`lib/jobs.tsx` gained a
  `recalibrate` kind and a generalised `SERIALISED` set). **While it runs, notes
  are locked**: a note added mid-flight would not be in the run you are about to
  compare.
- A candidate is **staged, never auto-accepted**. Accepting is what makes it the
  baseline, and it clears the notes that produced it.

### /prototype — the sticky notebook, 3 placements (awaiting the pick)

Click any track id in any tab to stack bullets against it.
- **A · Dock** — a rail beside the grid; the whole pad visible at once.
- **B · Margin** — notes under their own row, inline in the matrix.
- **C · Pad** — a fixed corner sticky; the only one keeping Recalibrate always in
  reach.

### A dead test retired rather than left to rot

`drive-impact-matrix.mjs` broke when the tabs were promoted (`view-matrix` no
longer exists). Rather than leave it failing — the exact rot that had killed the
old research/script drives — it was narrowed to what only it checks (footnotes,
usage attributes, the scope round-trip) and the tab/notes/version behaviour moved
to the new `drive-recalibration.mjs`.

### Scope is now one shared record

`useScope` was per-mount state. A scope control in Step 2 would have written to a
document nobody else could see. It takes `projectId`, persists under its own
`research-scope` key, and is hydrate-guarded like `lib/jobs.tsx` had to be.

### Gates

`tsc` clean · `next build` clean · **146/146 driven**
(recalibration 34 · signed-in 42 · matrix 23 · script 22 · research 18 ·
persistence 7). `drive-signed-in` is back to 42/42 — the concurrent session's
hover-unmute work landed. `CardTile.tsx` (230 LOC) is still theirs and still
untouched.
