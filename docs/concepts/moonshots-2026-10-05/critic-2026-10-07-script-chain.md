# Critic pass · 2026-10-07 · C1 closure and the script chain

**Status: READ-ONLY REVIEW.** This is the second critic pass of the day over the
[moonshot backlog](README.md). The first, [critic-2026-10-07.md](critic-2026-10-07.md), left C1 out
of scope because another builder was changing the notebook seam (`critic-2026-10-07.md:13-16`).
That builder has finished. `research-scope-board-A` is on local `main` as `54c720d` (merged
`ca6ddbe`, stage 1), `8b5a956` (stage 2), `6200683`, `c86dcda`, `736c2fd` and `2dc6b45` (stage 3),
then `f2d82b8` (stage 4), with the README edit in `282e809`. This pass re-verifies the cards that
landing unblocks against `main` at `282e809`. It names what the landed work already covers and
describes only the **next stage** of each card. Nothing here changes a card, the README or any
code. The status edits it proposes are listed at the end for whoever owns the README.

**Scope.**
- **Part 1, C1 closure.** `phase-shared-B` (`03-frames-score-cut.md:257-308`). The README says to
  take its stage-4 Frames binding cases into `research-scope-board-A` (`README.md:41`). Also in
  Part 1: the six files that `tests/golden-path/notebook-source.probe.spec.ts:379-381` pins as
  still importing `NOTEBOOK` or `CONCLUSIONS`.
- **Part 2, the script chain** (milestone 2): `script-phase-A`, `script-phase-B` and
  `research-scope-board-B`, all in `02-research-script.md`.
- **Part 3.** Collisions, operator decisions, the order to build in, and catalogue edits.

**Method.** I opened every Premise anchor at `282e809` and gave it one of three verdicts: `true`
(holds, at that line or within a few), `moved` (holds, at the new `path:line` given) or `false`
(no longer holds, with the evidence and the sha that changed it). Three things executed:
- Two read-only Node scripts with no network access. One replicates the case 7 ratchet's walk
  (`notebook-source.probe.spec.ts:383-402`). The other runs the same walk with every fixture
  constant name, to find what the ratchet's regex cannot see.
- The gate run described in [Gate state of the base](#gate-state-of-the-base).
- One `npx tsx` call that counted `CONCLUSIONS` (7), `NOTEBOOK.facts` (21) and
  `NOTEBOOK.unknowns` (4).

No app, dev server, engine, GPU job or paid call ran.

---

## Verdicts at a glance

| Card | Premise | What the landed work covers | Recommendation | Next stage | Shape |
| --- | --- | --- | --- | --- | --- |
| `phase-shared-B` | 6 anchors: 2 false (`736c2fd`, `f2d82b8`), 1 false on its default (`54c720d`), 3 moved but still true | Cases 1, 2, 5 and 7 are met. Cases 3, 4 and 6 are answered differently: C1 falls back to the **replay**, not to `none`. | **Merge into research-scope-board-A** through one closing stage | The C1 closing stage (below) | Decided, apart from ask A1 for cases 3, 4 and 6 |
| `research-scope-board-A` (closure) | Six pinned importers: 3 bugs on a live notebook, 1 bug coupled to one of them, 2 legitimate. The ratchet misses another 6 consumers, 4 of them bugs. | Stages 1-4 | **Close with one stage.** The catalogue row cites `e019be8`, which is not on `main`. | The same closing stage | Decided |
| `script-phase-A` | 7 anchors: 2 false (`1099deb`), 3 moved and still true (importer count 9 → **20**), 2 true | Session 1 (`1099deb`): `draft.ts`, `impactOf`, `editPlanSchema(draft)`, derived `ledgerFor` | **Build**, split in two | s2a: draft record, `Unknown.probe`, one ledger. s2b: Step 2 reads the draft. | Decided |
| `script-phase-B` | 5 anchors: 1 false (`901198a`), 2 moved, 2 true | Stages 1-2 (`901198a`); C1 stages 1-4; AIO-A kernel `lib/turns` | **Build**, with stages 3 and 4 merged: Compose runs as a turn kind | stage 3: `compose` turn kind plus the Candidates action | Needs the operator (asks A3, A5); waits for AIO-A 4a and script-phase-A s2b |
| `research-scope-board-B` | All true. One new conflict with C1: applying a revision changes the digest, which orphans the scope. One write-set entry stale (`27cc8f4`). | Nothing yet. C1 supplies the reader (`NotebookSource`). | **Build** stage 1 now (pure); hold dispatch | stage 1: `applyRevisions`, pure | Stage 1 decided; stage 2 needs asks A4 and A6 |

---

## Gate state of the base

I ran the three gates the brief names on the untouched base (`282e809`, this worktree), plus the
derived-file checks a C1 or Script builder will meet first. **All pass.** The `kit-census` red that
the earlier pass found (`critic-2026-10-07.md:56-67`) is gone: the Strips rises were taken in
`9081d49`, and the C1 census was regenerated in `2dc6b45`.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint:ratchet` | exit 0: "1013 files, 0 errors, 12 warnings, all 3 bucket(s) at baseline" |
| `npm test` | exit 0: 1676 passed, 1 skipped (1.4 min) |
| `npm run check:kit-census` | exit 0: "536 files · 27 modules · 120 parts" |
| `npm run check:notebook` | exit 0 |
| `npm run check:gate` | exit 0 |
| `npm run check:narration` | exit 0: 5/5, 6/6 and 7/7 at budget |

I did not run `npm run verify` (`build` and `bundle`). The earlier pass recorded that Turbopack
refuses this worktree's `node_modules` junction (`critic-2026-10-07.md:60`), and that has not
changed.

---

## Part 1 · C1 closure

### phase-shared-B: premise

| Anchor (card) | Verdict | Evidence at `282e809` |
| --- | --- | --- |
| `stepStore.ts:45-84`: `research-notebook` exists; its only readers are `useEducationalResearch.ts:82` and `lib/board/sources/projects.ts:41` | **moved** | Three readers now: `research/guided/useEducationalResearch.ts:90`, `_shared/notebook/useActiveNotebook.ts:87` and `:139` (`6200683`), and `lib/board/sources/projects.ts:41` |
| `LiveResult.tsx:33-39,231`: "the board … built from the SHIPPED FIXTURE" | **false** | `736c2fd`. The header is now "WHAT THIS NOTEBOOK FEEDS" (`app/_phases/research/run/LiveResult.tsx:32-42`), and the foot line is gone. |
| `cards.ts:65` defaults to `NOTEBOOK`, `useScope.ts:39` passes none; `notebook.ts:184-227` builds the indexes at load | **false** for the default, **true** for the indexes | `buildCards(input = fixtureSource())` (`_shared/notebook/cards.ts:74`, `54c720d`); `useScope` deals `buildCards(dealt)` (`research/useScope.ts:97`). `FACT_BY_ID`, `UNKNOWN_BY_ID` and `NOTEBOOK_COUNTS` are still module constants (`_shared/notebook/notebook.ts:184`, `:187`, `:189-221`). `indexNotebook(nb)` exists beside them (`source.ts:67-72`). |
| `gate.ts:45,418`, `useVersions.ts:203`, `ScriptStep.tsx:351-356` judge and prompt against the fixture | **false** | `f2d82b8`: `runGate` reads `(opts.source ?? fixtureSource()).notebook` (`script/gate.ts:540-544`); `runInput.notebook = ctx.source.notebook` (`script/useVersions.ts:264`); ScriptStep resolves `useActiveNotebook` (`script/ScriptStep.tsx:265-268`, `:334`). |
| `useFrames.ts:43,606,640-641`: direction briefed with, and graded against, `FACTS` | **moved, still true** | `app/_phases/frames/useFrames.ts:45` (import), `:654` (`landDirection`), `:733` (`directionInput.facts`), `:874` (`facts: FACTS`) |
| `EvidenceLog.tsx:22-26`, `NotebookBody.tsx:77` render the constant | **true** | `_shared/notebook/EvidenceLog.tsx:22`, `:27`; `NotebookBody.tsx:13`, `:77`. The sections do the same: `sections/Argument.tsx:12`, `Apparatus.tsx:14`, `Shared.tsx:26`, `:55`. `SECTION_LABEL` is built from `NOTEBOOK_COUNTS` at load (`sections/H.tsx:17-38`). |

**The move, against what landed.**
- The resolver landed as `useActiveNotebook(projectId)`, with the non-hook `readActiveNotebook`
  beside it (`useActiveNotebook.ts:86-89`, `:128-148`). It is not a `NotebookProvider`. The tab
  shares one module-level record map (`:95-117`), which is what a provider would have bought.
  **Drop the provider.**
- The precedence is **different**. The card wants `reasoned` → `replay` → `none`, with a cleared
  record giving `none`. C1 resolves anything that is not a dealable live record to the replay
  (`useActiveNotebook.ts:13-22`, `:72`). This includes no record, a cleared record and a malformed
  one. That is the contract that landed, and phase-shared-B cases 3, 4 and 6 depend on it (ask A1
  below).

### phase-shared-B: acceptance against `main`

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · valid record → `reasoned`, facts equal | **met** | `tests/golden-path/active-notebook.probe.spec.ts:258`, `:276` |
| 2 · seeded Bitcoin project → `replay`, the fixture | **met** | `active-notebook.probe.spec.ts:453` (no live record deals the fixture object); the seed ships no `research-notebook` row |
| 3 · fresh project → `none`; the Frames bind list and direction `facts` are empty; no `f-*` id in the payload | **open, and answered differently** | C1 deals the replay to a fresh project (`useActiveNotebook.ts:72`). Frames does not read the source at all: `FACTS` at `useFrames.ts:733`, `:874`. |
| 4 · cleared record → `none`, not `replay` | **answered differently** | → replay, by design (`useActiveNotebook.ts:16-19`; `active-notebook.probe.spec.ts:288`) |
| 5 · `buildCards(reasonedNb)` holds no `facts.ts` id | **met** | `active-notebook.probe.spec.ts:423`; `notebook-source.probe.spec.ts:114`, `:284` |
| 6 · a record that fails `validate.ts` → `none` plus a trouble, never a silent fallback | **open** | `dealable` (`useActiveNotebook.ts:51-62`) is a shape check, and a non-dealable record silently becomes the replay (`:72`). Only a failed **read** leaves the hook un-hydrated (`:142`). |
| 7 · gate on a reasoned notebook reads its `scaleConversions` | **met** | `notebook-source.probe.spec.ts:334` (getter spy on `facts`, `scaleConversions`, `unknowns`); `gate.ts:544` |

### The Frames figure binding and the direction pass

- **Facts.** `useFrames` imports `FACTS` from `facts.ts` (`useFrames.ts:45`). That is the same
  array the fixture `NOTEBOOK.facts` holds (`notebook.ts:9`, `:34`). It reaches three places:
  - the binding list the canvas offers (`:874` → `FramesAssembly.tsx:267`, `:468-472`);
  - the direction brief (`:733`);
  - the landing that grades the answer (`:654` → `direction.ts:55-60` → `sceneSpec.ts:176` for an
    id that is not in the notebook, `:189` for a low-confidence figure).
- **Ratchet blind spot.** The ratchet regex only matches imports from a path ending in
  `/notebook` or `/conclusions`, and only the names `NOTEBOOK` and `CONCLUSIONS`
  (`notebook-source.probe.spec.ts:395-396`). So `useFrames.ts` has never been counted.
- **Server side: no change needed.**
  - `app/api/frames`: `facts` is request data. It is size-checked (`lib/turns/assemble/frames.ts:28`,
    `:91-93`) and serialised into the prompt (`:162`). The frames kind's `settle` keeps the raw
    answer and grades nothing (`lib/turns/kinds/frames.ts:85-87`). The grading is client-side, at
    landing.
  - `app/api/recalibrate`: the route (134 lines) delegates to the assembler. The change belongs in
    `lib/turns/assemble/recalibrate.ts`; see importer 6 below.
- **A residue the card did not name: dangling bindings.**
  - A figure is "bound" when `t.factId` is set (`useFrames.ts:820-823`, `frames/verdict.ts:25`).
    No check asks whether that id is in the dealt notebook.
  - Once Frames reads a reasoned notebook, a figure bound to `f-ath` on an older cut counts as
    sourced while citing a fact the project does not have.
  - The `<select>` cannot show it either. Its value is not among the options (`FramesAssembly.tsx:458`,
    `:468-472`), so it draws as "— unsourced —" while the record says bound.
- **Hydration.** `ready` gates the direction resume on the step record only
  (`useFrames.ts:676`). If Frames reads the active source, `ready` must also wait for
  `useActiveNotebook().hydrated`. Otherwise a turn that settles on mount lands against the replay's
  facts before the live record is read.

### The evidence log, the notebook modal and `FACT_BY_ID`

- **All fixture-bound.** Every component under `_shared/notebook/` that draws a notebook reads the
  constant:
  - `EvidenceLog.tsx:22`, `:27`, `:34-44`;
  - `NotebookBody.tsx:13`, `:77`;
  - `sections/*` (above);
  - `FactRow.tsx:4`, `:20`, which resolves `contests`/`qualifies` edges through `FACT_BY_ID`;
  - the rail labels, through `SECTION_LABEL` (`sections/H.tsx:17-38`).

  The ratchet exempts this directory (`notebook-source.probe.spec.ts:393`), so none of these are
  counted.
- **One host: `ResearchStep`.** It opens both modals (`ResearchStep.tsx:338-365`):
  - The title is hard-coded `"notebook · why-bitcoin-price-does-not-rise"` (`:341`).
  - The footers read `NOTEBOOK_COUNTS` (`:342`, `:358-360`).
  - The pills that open them are gated on `ready`, meaning the replay landed (`:415`), while the
    board beside them follows `dealt` (`:426`).
- **Two defects follow:**
  1. **Replay and live notebook both present.** The board deals the creator's notebook
     (`useEducationalResearch.ts:228`, `ResearchStep.tsx:189`). The pills open Bitcoin's notebook
     and evidence log, and that modal is titled with Bitcoin's slug.
  2. **Only the creator's own notebook.** There are no pills, so no way to read that notebook in
     full or its evidence log, and no Clear on the expert face (`:415`). On the guided face the
     pills render only inside the replay branches (`guided/RunStage.tsx:189-212`, `:367-374`).
- **The Clear dialog misstates its consequence.** `ClearDialog` states the fixture's counts
  (`research/_parts/ScopeGate.tsx:8`, `:103-105`). Yet Clear also wipes the live notebook
  (`ResearchStep.tsx:299`, `live.reset()`), which is the paid one. A destructive confirm that
  misstates what it destroys is exactly the exemption CLAUDE.md protects.
- **Live notebooks can be drawn.** A live notebook is a full `Notebook` shape (`parseNotebook`
  requires every top-level field, `lib/notebook/validate.ts:387`), so all of these components can
  draw one. Nothing in them is fixture-only except the import.

### The provenance chip

There are two chips:
- `StandInNote`, the replay's chip (`guided/RunStage.tsx:90-120`). It is drawn at `:204` and
  `:364`, and its Hint is suppressed when the board is not dealing the replay (`c86dcda`).
- `ReasonedNote`, the live notebook's chip (`run/LiveResult.tsx:58-72`). It is drawn once, at
  `:193`.

Neither appears outside Step 1. The Script step now gates the creator's renders against a
**reasoned** notebook (`f2d82b8`) and says nothing about which notebook that is. The only notebook
mention on its header is a link, "step 1 · notebook" (`ScriptStep.tsx:425`). Frames will do the
same once it binds to the source. phase-shared-B requires that "the provenance chip … is carried
onto every surface that shows notebook content" (`03-frames-score-cut.md:280`).

### The six pinned importers

The ratchet pins six importers (`notebook-source.probe.spec.ts:379-381`). Replicating its walk at
`282e809` gives the same six:

| # | File | What it reads | Class |
| --- | --- | --- | --- |
| 1 | `app/_phases/research/ResearchStep.tsx:55` | `NOTEBOOK`, `NOTEBOOK_COUNTS` for the two modals and their footers (`:338-365`) | **Bug on a live notebook.** The modals show the replay beside a board that deals the live notebook, and a project with only its own notebook cannot open it at all (see above). |
| 2 | `app/_phases/research/guided/RunStage.tsx:26` | `StandInNote` (`:90-120`), the replay's compact card (`:189-212`), `ArtifactPills` counts (`:59-62`) | **Legitimate replay-only read**, with one coupling. The card and the chip *are* the replay's, labelled stand-in. `ArtifactPills` prints replay counts, which is only true while the modal it opens is also the replay. It must move with importer 1. |
| 3 | `app/_phases/script/constraints.ts:23` | `UNKNOWN_BY_ID` in `handLedgerFor` (`:89-115`); `NOTEBOOK` as `ledgerFor`'s default (`:166`) | **Bug on a live notebook.** `ConstraintLedger` renders the hand ledger (`_parts/ConstraintLedger.tsx:29`) inside `HypothesisColumn` (`:158`), directly above `GatePanel`, which gates the live notebook (`:163`). The result is two verdict sources over two notebooks in one column. Owned by script-phase-A s2a (`constraints.ts:82-88`, `draft.ts:19-24`). |
| 4 | `app/_phases/script/dispatchToggles.ts:14` | `CONCLUSIONS` for toggle order, filtered by the manifest's held ids (`:30`, `:38-43`) | **Bug coupled to #6.** Today it agrees with a server that withholds the fixture's conclusions for every notebook. Once the server holds the source's conclusions, `CONCLUSIONS.filter` drops every live one. |
| 5 | `lib/notebook/validate.ts:59` | `FIXTURE_CONCLUSION_IDS` (`:704`), dropping findings owned by inherited fixture conclusions (`:706-714`) | **Legitimate (engine side).** It applies only to a notebook that declares neither field, which is the legacy `asSource` branch (`source.ts:163-168`). It goes when that branch goes. |
| 6 | `lib/turns/assemble/recalibrate.ts:44` | `conclusionsFor(scope)` returns `CONCLUSIONS` for every request (`:172-175`) | **Bug on a live notebook.** Since stage 4, the body's notebook is the creator's (`useVersions.ts:264`), but the turn is still handed the 7 Bitcoin conclusions to "rest edits on". `blindConclusions` (`:405-408`) and the size check (`:243`, which never counts conclusions) follow them. A notebook that declares its own conclusions also carries them **inside** the notebook block, because `NOTEBOOK_DROP` drops only `engineFit` and `sources` (`:115`, `:300`). That breaks "beside the notebook, never in it" (`:159-164`, `:331`). The precedent for the fix exists: `/api/script` takes `conclusions` in the body and treats absent as none (`app/api/script/route.ts:170-172`). |

**What the ratchet cannot see.** I re-ran the walk with every fixture constant name: `FACTS`,
`FACT_BY_ID`, `UNKNOWN_BY_ID`, `NOTEBOOK_COUNTS`, `CARD_DIMENSION` and the no-argument
`fixtureSource()`. It finds six more consumers that C1's live notebook reaches:

| File | Read | Class |
| --- | --- | --- |
| `app/_phases/frames/useFrames.ts:45` | `FACTS` | **Bug**: phase-shared-B stage 4 (above) |
| `app/_phases/research/_parts/ScopeGate.tsx:8` | `NOTEBOOK_COUNTS` in `ClearDialog` (`:103-105`) | **Bug**: the destructive confirm (above) |
| `app/_phases/research/followup.ts:12` | `FACT_BY_ID`, `UNKNOWN_BY_ID` for the `CANNED` plane (`:52-96`, `:143-147`, `:227`) | **Bug on a live notebook.** `resultFor` answers any question matching `/whale\|on.?chain\|cohort\|holder/` with Bitcoin's transcript (`:282-295`), whatever the board deals. The `GLOBAL_NOTEBOOK` sentence, "one static document shared by every project" (`:194-195`, rendered as a `title` at `_parts/FollowUpResult.tsx:152`), stopped being true when C1 landed. |
| `lib/board/sources/triage.ts:29` | `buildCards()`, which is the fixture | **Bug, with data loss.** `/board` deals Bitcoin's cards for every explainer project (`:29-63`). Its `decide` writes `{scope, confirmed}` **without the digest** (`:92`). A digest-less scope reads as the fixture's (`useScope.ts:34-37`), so one `/board` verdict on a live-notebook project orphans that project's whole scope on its own Research step (`useScope.ts:42-47`, `:122`). The next decision there then starts a fresh scope over it (`:132-145`). |
| `app/_phases/script/` (no import) | `stateOf(scope, id)` with the default `optIn = OPT_IN_IDS`, the fixture's (`research/scope.ts:53`, `:57`) | **Bug on a live notebook.** `c86dcda` threaded `api.optIn` through every `stateOf` in `research/`, so a live conclusion reads as not-taken by default. Step 2 was not threaded: `script/recalibrate.ts:79`, `:279`, `:415`, `scopeConflicts.ts:43`, `_matrix/MatrixSpend.tsx:122`, `_matrix/MatrixTracks.tsx:98`, `:171`. There, an undecided live conclusion reads as **in**. `rg optIn app/_phases/script` finds nothing. |
| `app/_phases/research/verdict.ts:17`, `:23-30` | `fixtureSource()` board for `scopeDiffs` | **Known open, not a C1 bug.** The verdict requires `research.researched` (`:36`), so a project with only its own notebook has no verdict, as `ResearchStep.tsx:195-199` already says. A pure verdict reading `research-notebook` is WORKSPACE-A's ratification question (`README.md:104-106`). Name it; do not fold it in. |

**One more race the landing left.** ScriptStep passes the active source into `useScope`
(`ScriptStep.tsx:265-267`), so `owns` is true (`useScope.ts:96`). Its `ready`, however, does not
wait for the active notebook to hydrate (`ScriptStep.tsx:359`). On a direct load of
`?step=script`, the scope can hydrate before the live record does. In that window the scope is
dealt the fixture, and the live scope reads as orphaned. A ScopePip decision made then is allowed
to start a fresh fixture-digest scope over the creator's (`useScope.ts:132-145`). The window is
short, because both are IndexedDB reads, but the write is real.

### The C1 closing stage: "phase-shared-B merged into research-scope-board-A"

One session, size L, one commit per part. Parts a-d close phase-shared-B. Parts e-i are C1
regressions this pass found, and they are what makes the catalogue's `landed` true. A builder
short on time ships a-d and leaves e-i as `partial`, never the other way round.

**Write set.**
- **(a) Frames binding and direction.**
  - `app/_phases/frames/useFrames.ts`:
    - `const active = useActiveNotebook(projectId)`;
    - facts = `active.source.notebook.facts` at `:654`, `:733` and `:874`;
    - `ready` (`:676`) waits for `active.hydrated`;
    - a binding whose `factId` is not in the dealt facts counts in `unboundFigures`
      (`:820-823`).
  - `app/_phases/frames/FramesAssembly.tsx`: the `<select>` (`:458-472`) carries a dangling id as
    its own option, drawn in the unsourced tone, rather than showing "— unsourced —" over a stored
    binding.
  - Not edited: `frames/verdict.ts` (it has no notebook input; see "stays open") and `app/api/frames`.
- **(b) Evidence log and modal.**
  - New `app/_phases/_shared/notebook/counts.ts`: a pure `countsOf(nb)`. `notebook.ts` keeps
    `NOTEBOOK_COUNTS = countsOf(NOTEBOOK)`. It is a new module because `source.ts` imports
    `notebook.ts` (`source.ts:30`).
  - `EvidenceLog.tsx`, `NotebookBody.tsx` and `sections/{Argument,Apparatus,Shared,H}.tsx` take the
    notebook as a prop. `SECTION_LABEL` becomes `sectionLabels(n)`.
  - `FactRow.tsx` takes the facts index (`source.byId.facts`).
  - `research/ResearchStep.tsx`: the modals render `research.source`, with the title from
    `notebook.id`. The pills follow `dealt`, not `ready` (`:415`).
  - `research/guided/RunStage.tsx`: `ArtifactPills` takes counts. The replay card draws them only
    while the replay is what is dealt.
  - `research/_parts/ScopeGate.tsx`: `ClearDialog` takes the counts of what Clear destroys, and
    names the live notebook's topic when one exists.
- **(c) Provenance chip.**
  - New `app/_phases/_shared/notebook/SourceChip.tsx`: kind plus topic, in the house chip classes
    (`components/ui/signal/Tally.tsx`), with an `sr-only` label.
  - Drawn in `script/ScriptStep.tsx` beside the "step 1 · notebook" link (`:425`), and in
    `frames/FramesAssembly.tsx` above the binding controls.
  - `StandInNote` and `ReasonedNote` stay where they are. The chip lives in `_shared/` because
    `_shared` must not import upward from `research/`.
- **(d) Recalibrate conclusions.**
  - `script/useVersions.ts`: `runInput` (`:262-271`) adds `conclusions: ctx.source.conclusions`.
  - `lib/turns/assemble/recalibrate.ts`:
    - `conclusionsFor` reads `body.conclusions`, and absent means none, as `/api/script` does;
    - `RecalibrateInput` gains `conclusions`;
    - the size check (`:243`) counts it;
    - `NOTEBOOK_DROP` (`:115`) gains `"conclusions"`;
    - the `CONCLUSIONS` import goes.
  - `script/dispatchToggles.ts` takes the source's conclusions for its order.
  - `tests/golden-path/{turn-assemble-parity,recalibrate-route-e2e}.probe.spec.ts`: their bodies
    send `conclusions: CONCLUSIONS` explicitly. Both already import it (`:38`, `:34`).
- **(e) Step 2 opt-in.** Thread `optIn` into `script/recalibrate.ts` (`ctx`), `scopeConflicts.ts`,
  `_matrix/MatrixSpend.tsx` and `_matrix/MatrixTracks.tsx`, from `useScope().optIn`.
- **(f) Board triage.** `lib/board/sources/triage.ts`:
  - per project, `readActiveNotebook(p.id)` (`useActiveNotebook.ts:86`);
  - deal `buildCards(source)` and `stateOf(…, optInIds(source))`;
  - keep `digest` on write;
  - refuse a decide over an orphaned scope with `VerdictRefused`.
- **(g) Script hydration.** `script/ScriptStep.tsx`: `ready` (`:359`) includes the active
  notebook's `hydrated`.
- **(h) Follow-ups.** `research/followup.ts`:
  - `resultFor` answers from `CANNED` only on the replay source;
  - the `GLOBAL_NOTEBOOK` sentence states what is still true: no effect has a record to land in.
  - `research/_parts/FollowUpQueue.tsx` passes the source.
- **(i) The ratchet.** `tests/golden-path/notebook-source.probe.spec.ts`:
  - `constantImporters` matches every fixture constant name from `notebook/{notebook,facts,conclusions,dimensions,unknowns}`.
    Widened on today's tree it counts **9** (the 6 above plus `useFrames`, `ScopeGate` and
    `followup`).
  - After this stage the pin is **4**: `RunStage` (legitimate), `followup.ts` (the replay plane,
    until research-scope-board-B), `constraints.ts` (until s2a) and `validate.ts` (legitimate).
- **Tests.**
  - New `tests/golden-path/frames-notebook.probe.spec.ts`.
  - Cases added to `notebook-source.probe.spec.ts`.
  - **Not** `active-notebook.probe.spec.ts` or `step-records.probe.spec.ts`, which
    production-script-probes-B stage 1 migrates (Part 3).
- **Census.** Regenerate `app/kit/census.json` (parts b, c).

**Acceptance (write failing first; fake-indexeddb, as `active-notebook.probe.spec.ts` does).**
1. **Frames on a reasoned notebook.** A `research-notebook` record for P with facts `n-1..n-3`
   gives:
   - `useFrames(P).facts` deep-equals those facts;
   - the preview and the start body's `facts` carry exactly those ids and no `facts.ts` id (fetch
     spy on `/api/turns/preview` and `/api/turns`);
   - a landed scene spec citing `f-ath` is rejected "not in this notebook" (`sceneSpec.ts:176`).
2. **Frames on the replay.** No record: `facts` is `FACTS` and the direction body is
   byte-identical to today's. These stay green unmodified: `frames-route-e2e`, `turn-frames`,
   `scene-grade-cap` and `frames-unsourced-figure`.
3. **Dangling binding.** A stored figure bound to `f-ath`, on a reasoned project:
   - it counts in `unboundFigures`;
   - nothing is written on mount (the `asRead` rule, `useFrames.ts:318`);
   - the select's value is the dangling id, not `""`.
4. **Evidence log and modal.** `EvidenceLog` and `NotebookBody`, given a reasoned source:
   - they render its facts, its open unknowns and its section counts (`sectionLabels(n)`);
   - a `contests` edge resolves against that notebook;
   - a source check finds no `NOTEBOOK` import in `EvidenceLog`, `NotebookBody`, `FactRow` or
     `sections/*`.
5. **Pills and Clear.** On a project holding both a replay and a reasoned record:
   - the modal title and footers name the reasoned notebook;
   - a reasoned-only project shows the pills on the expert face;
   - `ClearDialog` shows the counts of the notebook being destroyed and its topic.
6. **Chip.** Script and Frames each render the source chip: `reasoned` plus the topic for P,
   `stand-in` for the seed. Each has an accessible name.
7. **Recalibrate.**
   - For a reasoned notebook with one conclusion `c-x`, the assembled prompt contains `c-x` and
     none of the 7 fixture conclusion ids.
   - The notebook block has no `conclusions` key.
   - On the replay with `conclusions: CONCLUSIONS`, the prompt is byte-identical
     (`turn-assemble-parity`).
   - `dispatchToggles` lists a held `c-x`.
8. **Step 2 opt-in.** On a reasoned source with `c-x` undecided:
   - `outWord` reads `not-taken`;
   - MatrixSpend reads it descoped;
   - the recalibrate guard treats it as out, the same as `research/` does today.
9. **Board.** A `/board` triage verdict on P:
   - it keeps the stored digest;
   - the Board deals P's own cards;
   - a verdict over an orphaned scope is refused with a reason, and nothing is written.
10. **Script race.** With the `research-notebook` read held pending, ScriptStep draws its
    skeleton, and no `research-scope` save is issued (saveStep spy).
11. **Follow-ups.** On a reasoned source, `resultFor({kind:"question", prompt:"whale holders"})`
    is `undefined`. On the replay it is `CANNED["q-whales"]`.
12. **The ratchet** counts 4 after the stage, with the widened walk.
13. **Malformed record (case 6, under the landed contract).** A `research-notebook` record that
    fails `dealable`:
    - it resolves to the replay **and** sets a trouble on `ActiveNotebook`;
    - the board draws a `StaleBadge` for it;
    - it is never silent.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{frames-notebook,notebook-source,active-notebook,frames-route-e2e,turn-frames,scene-grade-cap,frames-unsourced-figure,turn-recalibrate,turn-assemble-parity,recalibrate-route-e2e,dispatch-strip,board,step-clear-completeness,live-notebook-pointer,shared-notebook-contracts,notebook-graph}.probe.spec.ts`
  (all exist except `frames-notebook`)
- `npm run check:notebook`
- `npm run check:gate`
- `npm run check:narration`
- `npm run check:kit-census`
- `npm test`
- Then, as CLAUDE.md requires for a deleted or moved sentence, `node pipeline/cx-capture.mjs`
  for `studio-research`, `studio-script` and `studio-frames`, with `CX_PROJECT` set to a project
  holding a reasoned record. Open the PNGs.

**Shape.**

| Part | Decided or operator |
| --- | --- |
| a · Frames binding, direction, dangling bindings | **decided** |
| b · evidence log and modal follow the dealt source | **decided**, with one detail to state in the commit: whether `LiveResult` also carries the pills on the guided face of a reasoned-only project |
| c · the chip on Script and Frames | **decided** as a disclosure. Whether a reasoned notebook may gate scripts and frames **at all** is ask A2 below. Stage 4 already made it so for Script. |
| d · recalibrate conclusions; absent = none | **decided**, following the `/api/script` precedent |
| e-h | **decided** (defects) |
| i · widened ratchet | **decided** |
| cases 3, 4, 6 as the card wrote them (`none`) | **needs the operator** (ask A1). Without an answer, build them under the landed replay contract, with case 13 as above. |

**Stays open after it, named.**
- `frames/verdict.ts:25` and `research/verdict.ts:36` have no notebook input. They belong to
  WORKSPACE-A's projection.
- The explainer Frames chain is still a fixture render (`candidates/adoption.ts:39-42`), so on a
  reasoned project its Bitcoin figures will **correctly** read as unbound. That is script-phase-A
  s2c, below.

---

## Part 2 · The script chain (plan milestone 2)

### What C1 and AIO-A stages 1-3 already provide

**From C1:**
- `NotebookSource` with `digest` and `byId` (`source.ts:44-63`).
- `sourceOf(nb, {conclusions})`, where unset fields are empty, never the fixture's
  (`source.ts:113-138`).
- `useActiveNotebook` and `readActiveNotebook` (`useActiveNotebook.ts:86`, `:128`).
- A digest-stamped, orphan-aware scope (`useScope.ts:34-47`).
- `runGate` and `gateChains` over a source (`gate.ts:517-544`, `:593`).

**From script-phase-B stages 1-2, built on those:**
- `cardsInScope(source, scope)` (`lib/script/validate.ts:136-146`).
- `gateDraft(renders, source, draft)` (`gate.ts:619-633`).
- `/api/script`, which builds its source from the body (`app/api/script/route.ts:190`).

**From AIO-A stages 1-3** (`lib/turns/`, `critic-2026-10-07.md:85-97`):
- `TurnSpec {prepare, settle}` (`lib/turns/runner.ts:73-87`) and `registerTurnKind` (`:94-100`).
- `/api/turns` with the kinds registered by import (`app/api/turns/route.ts:39-42`).
- The generic client door `startTurn(kind, projectId, input)` (`lib/turns/client.ts:84`).
- `resumeTurn`, plus the watch-and-land pattern `useFrames` uses (`useFrames.ts:676-705`).
- `TURN_KINDS` in the bell (`lib/jobs.tsx:501`).
- The CIP-A stand-in, with three hand-written compose cassettes already present
  (`tests/_engine/cassettes/compose-{ok,refused,and-then}.json`, `901198a`).
- AIO-B's preview strip (`lib/turns/usePreview.ts`).

A `compose` kind fits the existing `TurnSpec` unchanged. It needs no `TurnSpec.dispatch`, unlike
research (`critic-2026-10-07.md:195-197`).

### script-phase-A: premise

| Anchor | Verdict | Evidence at `282e809` |
| --- | --- | --- |
| `renders.ts:8,160`: `RENDERS` and `RENDER_BY_ID`, imported by 9 modules | **true; worse** | `app/_phases/script/renders.ts:8`, `:160`. **20** files import `RENDERS` or `RENDER_BY_ID` by name, including `frames/picture/migrate.ts:31` and `lib/board/sources/adoption.ts:19`. |
| `impact.ts:32-57,118-140`: `ATTRIBUTION` per fixture render, `IMPACT` built at load and read by `usageOf` and `coverage` | **moved; partly false** | `ATTRIBUTION` `:33`; `IMPACT` `:158-160`, now `usageMapOf` over the fixture; `usageOf` `:162` and `coverage` `:187` still read the global. `impactOf(draft)` exists (`draft.ts:97`, `1099deb`), but no product code calls it. |
| `editPlan.ts:61`: the schema's `enum` is the fixture ids | **false** | `1099deb`: `editPlanSchema(draft)` (`editPlan.ts:60`, enum `:69`). The constant `EDIT_PLAN_SCHEMA = editPlanSchema({renders: RENDERS})` (`:107`) is still the only one used, by the server (`lib/turns/assemble/recalibrate.ts:322`, `lib/turns/kinds/recalibrate.ts:105`). |
| `constraints.ts:39-58`: hand `CONSTRAINT_LEDGER`; the gate replaced it, yet both still ship | **moved, still true** | `:43`. The derived `ledgerFor` exists (`:164-200`, `1099deb`), but the panel still renders `handLedgerFor` (`_parts/ConstraintLedger.tsx:29`), now over a live notebook (Part 1, importer 3) |
| `gate.ts:492-514`: `PROBES` keyed by fixture unknowns; `Unknown` has no probe field | **moved, still true** | `PROBES` `:641`; `probesFor` resolves draft, then the fixture (`:115-126`, `1099deb`). `Unknown` has no `probe` field (`_shared/notebook/types.ts`). A live notebook therefore scores `unmeasured` on every unknown in the gate `f2d82b8` now runs. |
| `ScriptStep.tsx:270-271`: runtime mismatch against fixture durations | **moved** | `:308-309` |
| `adoption.ts:40-41`: falls back to `RENDERS[0]` | **true** | `script/candidates/adoption.ts:39-42` |

**Write-set correction.** The card puts the draft's record in `_shared/stepStore.ts`. Since
`27cc8f4`, each step declares its records in its own `records.ts` (`script/records.ts:1-60`), so
`script-draft` belongs there.

### script-phase-A next stage, s2a: the draft record, notebook-authored probes, one ledger

This is the half of session 2 that does not move a reader of `RENDERS`.

**Write set.**
- New `app/_phases/script/useScriptDraft.ts`:
  - It seeds `fixtureDraft()` (`draft.ts:84-94`) only while the active source is the replay, and
    writes nothing until something changes (Frames' `asRead` rule).
  - For a reasoned source it returns an empty draft stamped with `source.digest`.
- `app/_phases/script/records.ts`: `SCRIPT_DRAFT = defineRecord({key: "script-draft", owner: "script", version: 1, …})`.
- `_shared/notebook/types.ts`: `Unknown.probe?`. The `SerializableProbe` type moves here from
  `gate.ts:92`, and `gate.ts` re-exports it, so `_shared/` imports nothing from `script/`.
- `lib/notebook/validate.ts`: `NOTEBOOK_SCHEMA`'s unknowns gain an optional `probe`, and
  `parseNotebook` compiles every pattern.
- `pipeline/NOTEBOOK-SCHEMA.md`.
- `script/gate.ts`: `probesFor` (`:115-126`) tries `unknown.probe` first.
- `script/_parts/ConstraintLedger.tsx`: renders `ledgerFor(r, source, {draft})`, keeping its
  testids. `HypothesisColumn.tsx:158` passes the `source` it already has.
- `script/constraints.ts`: `ledgerFor`'s default becomes `fixtureSource()`, which drops it from
  the ratchet.
- `tests/golden-path/script-draft.probe.spec.ts`; the pin in `notebook-source.probe.spec.ts`.
- `app/kit/census.json`.

**Acceptance (write failing first).**
1. Card case 4: an unknown carrying `probe: {forbid:[{source:"\\$\\s?9\\d"}]}` is enforced against
   "$95", with `PROBES` empty, so `enforced` is above 0.
2. Card case 5: `parseNotebook` refuses an uncompilable pattern and names the unknown id.
3. `useScriptDraft` on the replay returns the fixture draft and issues no save on mount. On a
   reasoned source it returns `renders: []` with that source's digest.
4. A stored draft whose `notebookDigest` is not the active source's is reported `stale`, with its
   renders kept. This mirrors the scope's orphan rule; it is never re-seeded.
5. `ConstraintLedger` on a reasoned source lists that notebook's unknowns only. On the replay its
   states equal `GatePanel`'s `runGate` per unknown (card case 3).
6. The ratchet pin falls by one (`constraints.ts`).
7. These stay green: `script-draft`, `adopted-render`, `chain-break-reaches-the-reviewer`,
   `scope-conflict-resolution`, `check:gate` and `check:notebook`.

**Gates.** `npm run typecheck`; `npm run check:gate`; `npm run check:notebook`;
`npx playwright test tests/golden-path/{script-draft,adopted-render,chain-break-reaches-the-reviewer,scope-conflict-resolution,notebook-source,shared-notebook-contracts}.probe.spec.ts`;
`npm run check:kit-census`; `npm test`.

**Shape: decided.**

### script-phase-A s2b (and s2c): Step 2 reads the draft

**s2b, Step 2 and its server.**
- **Client readers:**
  - `ScriptStep.tsx` (`:57`, `:308-309`, `:320-323`);
  - `candidates/{CandidatesDuel.tsx,useAdoption.ts,adoption.ts}`;
  - `chainBase.ts`, `versions.ts`, `recalibrate.ts` and `scopeConflicts.ts`;
  - `impact.ts` (`usageOf`/`coverage` take a draft);
  - `_matrix/{MatrixSpend,shared}.tsx`, `_parts/{GatePanel,HypothesisColumn}.tsx` and
    `_notes/RecalibrateControl.tsx`;
  - `dispatchToggles.ts` and `script/verdict.ts`.
- **Server:** `lib/turns/kinds/recalibrate.ts:105` and `assemble/recalibrate.ts:322` build
  `editPlanSchema({renders})` from the request's renders, not from the constant.

**s2b acceptance.**
- Card case 6: a one-render draft gives one column, and adoption never falls back to a render the
  draft does not hold.
- Card case 7.
- `EDIT_PLAN_SCHEMA` is byte-identical for the fixture draft, so the recalibrate cassettes still
  match (`1099deb` measured this).
- The `RENDERS` importer count falls from 20 to the fixture's own modules.

**s2c, the cross-step readers.** This is a separate session because it writes other steps:
- `frames/useFrames.ts` and `candidates/adoption.ts` resolve the adopted render from
  `script-draft` (`adoption.ts:39-42`, `useFrames.ts:282`);
- `frames/picture/migrate.ts:31`;
- `lib/board/sources/adoption.ts:19`.

**Shape: decided.** It is serial after s2a and after the C1 closure, which edits
`dispatchToggles.ts` and `assemble/recalibrate.ts` too.

### script-phase-B: premise

| Anchor | Verdict | Evidence |
| --- | --- | --- |
| `renders.ts:1-4`: transcribed from a terminal run | **true** | |
| `app/api/` has only `research` and `recalibrate`; no script prompt; no script turn class | **false** | `901198a`: `app/api/script/route.ts`, `pipeline/SCRIPT-PROMPT.md`, TurnClass `compose` (`lib/text/types.ts:181`; ladder `lib/text/router.ts:95`, `:107`; ceiling `:176`) |
| `editPlan.ts:19`: `EditOp` cannot write a new render | **moved, true** | `:20` |
| `HypothesisColumn.tsx:40,124`: `engineFit` and `templateIntent` | **moved** | `:42`, `:126`, now read from `source.notebook` (`f2d82b8`) |
| `ScriptStep.tsx:270-271`: runtime mismatch | **moved** | `:308-309` |

**Three facts the stage 3 builder meets.**
1. **A creator with only their own notebook never reaches Script.**
   - The explainer half returns `UpstreamBreak` unless the `research` record says `researched`
     (`ScriptStep.tsx:283-286`, `:343`).
   - Only the replay writes `researched` (`useEducationalResearch.ts:29-31`, `:122`).
   - So `f2d82b8`'s binding reaches only projects that ran the replay **and** reasoned their own
     notebook. On those projects, the Candidates are still Bitcoin's three renders, gated against
     the creator's notebook.
   - The landed C1 therefore never meets the card's own promise: "a creator types a topic, gets a
     notebook, scopes it, and receives scripts" (`02-research-script.md:328`). The route for that
     project is a direction call (ask A3).
2. **`/api/script` is held open.** `maxDuration = 800` (`route.ts:56`), and the in-request
   `reason()` takes no signal (`:243`). The UI would lose an 800-second paid answer on a reload.
   Stage 4, the durable job, cannot come after stage 3, so they merge.
3. **Two prompt-hygiene defects in the route.**
   - A notebook that declares its own conclusions (stage 2, `8b5a956`) carries all of them inside
     `## NOTEBOOK` (`route.ts:227-228`), next to `## CONCLUSIONS NOT TAKEN`, which is meant to be
     ids only. It is the same defect as importer 6.
   - `sourceOf(notebook, {conclusions})` with an absent `body.conclusions` passes `[]`
     (`route.ts:172`, `:190`). That empty list wins over the notebook's own (`source.ts:116`), so a
     client must always send `source.conclusions`.

### script-phase-B next stage 3: Compose as a turn kind, and the Candidates action

**Preconditions.**
- script-phase-A s2b, so the duel reads a draft.
- AIO-A 4a, the assembler-extraction precedent plus `syncBody` passing findings through
  (`critic-2026-10-07.md:198`).
- The C1 closure, so the Step 2 opt-in is right.
- Answers to A3 and A5.

**Write set.**
- New `lib/turns/assemble/compose.ts`: the prompt, extracted from `app/api/script/route.ts:200-241`,
  with `conclusions` and `dimensions` dropped from the notebook block.
- New `lib/turns/kinds/compose.ts`:
  - `prepare` holds the route's guards (`:154-200`). `qualifyingEngines` failing →
    `TurnInputError(why, 400, "no-engine-fits")` before any record or spawn.
  - `settle` runs `parseDraft` → `draftOf` → `gateDraft`.
- `app/api/turns/route.ts`: one import line beside `:41-42`.
- `app/api/script/route.ts`: imports the assembler. It stays synchronous, exactly as 4a leaves
  `/api/research`.
- `lib/jobs.tsx`: `compose` joins `TURN_KINDS` (`:501`) and the done-detail table.
- `lib/turns/client.ts`: `startCompose`.
- New `app/_phases/script/useCompose.ts`, using the watch-and-land pattern of
  `useFrames.ts:676-705`.
- `script/candidates/CandidatesDuel.tsx`: the action, shown when the draft is the fixture or empty.
- `script/useScriptDraft.ts`: adopts the result as the project's draft, stamped `source.digest`.
- `script/ScriptStep.tsx`: the upstream gate, per A3.
- New `tests/golden-path/turn-compose.probe.spec.ts`, on the existing compose cassettes.
- `app/kit/census.json`.

**Acceptance (write failing first, under `withFakeEngine`).**
1. `POST /api/turns {kind:"compose"}` with `compose-ok` → 202 → `done`. `result.draft.renders`
   holds two `DraftRender`s inside the template band, each with a gate report (card cases 4 and 5).
2. `compose-and-then` → `failed` (`bad-response`), with the connector finding on the record (card
   case 2).
3. A notebook with no engine at "good" or better → 400 `no-engine-fits`, no record, and 0 spawns
   of the stand-in (card case 3, now as a turn).
4. A second compose for the same project while one runs → 409, naming the holder.
5. Unmount does not cancel. A remount lands the settled turn exactly once, as
   `turn-frames.probe.spec.ts:313` and `:338` do.
6. After landing, `editPlanSchema(draft)` names the new ids, and a recalibrate against them passes
   `parseEditPlan` (card case 6).
7. The request body carries `source.conclusions`, and the assembled notebook block has no
   `conclusions` key.
8. No raw `fetch("/api/script")` exists under `app/`. This extends AIO-A acceptance 8's regex
   (`turn-recalibrate.probe.spec.ts:344`).

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{turn-compose,script-compose,turn-ledger,imaging-auth,deployment-cells,script-draft,adopted-render}.probe.spec.ts`
- `npm run check:narration`
- `npm run check:kit-census`
- `npm test`
- `node pipeline/cx-capture.mjs studio-script`, opened by eye.

`verify:text` is not needed, because `lib/text` is untouched. The `compose` class exists already.

**Shape.**
- **Decided:** a turn kind rather than a held-open call; no new TurnClass; the refusal answered in
  `prepare`.
- **Needs the operator:** A3 (where a reasoned-only project's Script opens) and A5 (compose keeps
  running when the creator leaves, and how its spend is disclosed before the click).

### research-scope-board-B: premise

| Anchor | Verdict | Evidence |
| --- | --- | --- |
| `followup.ts:165-173` "THERE IS NO APPLY ACTION"; `:194-195` `GLOBAL_NOTEBOOK` | **true; the second sentence is now false as text** | `:165`, `:194-195`. Since C1, a project with its own notebook does not share one static document. See closure part h. |
| `followup.ts:52-96`, `:280-295`: two `CANNED` transcripts, regex `matchQuestion` | **true** | `CANNED` `:52-96`, `matchQuestion` `:282-286`, `resultFor` `:292-295`. They now answer a live board too (Part 1). |
| `FollowUpQueue.tsx:33-36,150-167`: 700 ms mock | **true** | `DISPATCH_MS` `:36`, `setTimeout` `:150` |
| `useFollowUps.ts:18-26`: session-lived | **true** | `:15-31` |
| `Effect` union `:18-23`; `revisionsOf` and `standingOf` | **true** | `:17-22`, `:143`, `:197` |

**Write-set correction.** `RevisionsStepData` belongs in `research/records.ts` as a `defineRecord`.
The scope's own def is the precedent (`research/records.ts:78-90`, `27cc8f4`), not
`_shared/stepStore.ts`.

**A conflict with C1 that the card could not have known.**
- The card makes the active notebook `applyRevisions(base, applied)` "with a new digest"
  (`02-research-script.md:206`). C1 orphans every scope whose digest is not the dealt source's
  (`useScope.ts:42-47`).
- So under the card as written, **each Apply would orphan all of the creator's scope decisions**,
  and the next decision would overwrite them (`:132-145`).
- Its acceptance case 5 ("the notebook digest returns to its previous value" after an undo) holds,
  but in between every revision empties the board's verdicts.
- The scope must be keyed to something a revision does not change: the base notebook's digest, or
  a lineage of digests. That is a contract choice for the card's stage 2 (ask A4).

### research-scope-board-B next stage 1: `applyRevisions`, pure

**Write set.**
- New `app/_phases/research/revisions.ts`: `applyRevisions(base: Notebook, revs): Notebook`, plus
  a `killed[]` history.
- New `tests/golden-path/notebook-revisions.probe.spec.ts`.
- Nothing else. No `source.ts` edit, no digest decision and no persistence.

**Acceptance.**
- Card cases 1, 2, 3 and 5. Case 5 is restated as "undo returns `sourceOf(base).digest`".
- One new case: a `CANNED` effect naming a fixture id, applied over a reasoned notebook, reports
  "no such id here" and changes nothing.

**Gates.** `npm run typecheck`;
`npx playwright test tests/golden-path/{notebook-revisions,followup-revisions,step-clear-completeness}.probe.spec.ts`;
`npm run check:notebook`.

**Shape: decided.**

Stage 2 (persistence, dealing the revised notebook, Apply/Reject/Undo) **waits for ask A4**.
Stage 3 (a real `follow-up` dispatch) waits for:
- ask A6;
- AIO-A 4a and 4b, because the follow-up rides `/api/research` and should be a turn kind like it;
- IMG-A 3b, because both edit `lib/text/types.ts` and `lib/text/router.ts`.

### Before AIO-A 4a, or after it

| Stage | Before 4a? | Why |
| --- | --- | --- |
| C1 closing stage | **yes** | It writes `lib/turns/assemble/recalibrate.ts` only. 4a writes `runner.ts`, `answer.ts`, `app/api/turns/route.ts` and new research files (`critic-2026-10-07.md:187-206`). |
| script-phase-A s2a | **yes** | No `lib/turns` file |
| script-phase-A s2b | **yes** (after the closure) | Its server edits are in the recalibrate kind and assembler, which 4a does not touch |
| research-scope-board-B stage 1 | **yes** | Pure |
| script-phase-B stage 3 (compose kind) | **no: after 4a** | Shares `app/api/turns/route.ts`, the assembler-extraction pattern and `answer.ts`'s findings passthrough. `lib/jobs.tsx` `TURN_KINDS` is also 4b's (`critic-2026-10-07.md:233`). |
| research-scope-board-B stages 2-3 | **no: after 4a, 4b and IMG-A 3b** | See above |
| production-script-probes-B stage 2 (journey) | after the closure and s2b, not tied to 4a | It reads the Frames facts and render source those stages change (`critic-2026-10-07.md:432-435`) |

---

## Part 3

### Collisions

The run in flight is **IMG-A stage 3b**: `lib/spend/`, `lib/text/`, a new text-spend probe and the
README IMG-A row (`06-imaging-music.md`, operator decision 3b in `df0936f`: count only, refuse
nothing). The open next stages are those in `critic-2026-10-07.md:548-570`.

| Stage here | IMG-A 3b (in flight) | AIO-A 4a | WORKSPACE-B 1 | foundry-forge-B 1 | foundry-forge-A 2 | production-script-probes-B 1 | probe-frame-data-B 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **C1 closing stage** | none | none (disjoint `lib/turns` files) | soft: WORKSPACE-B reads the `FramesStepData` type from `useFrames.ts` (internals change only); `census.json` merges serial | `census.json` | `census.json` | **avoid:** keep closure tests out of `active-notebook` and `step-records` probes, two of the **six** dispatcher copies psp-B migrates | none |
| **script-phase-A s2a** | none | soft: 4a's research `settle` imports `parseNotebook`, which s2a extends; land one, then rebase the other | `census.json` | `census.json` | `census.json` | soft: `useScriptDraft` is hook **39**; whichever lands second updates the coverage list | none |
| **script-phase-A s2b / s2c** | none | none | s2c edits `useFrames.ts`, which WORKSPACE-B's collector reads | `census.json` | `census.json` | the journey (psp-B stage 2) reads the render source s2b moves | none |
| **script-phase-B 3** | soft: 3b's text meter books every `compose` turn; no shared file | **hard:** `app/api/turns/route.ts`, `answer.ts`; after 4a | `census.json` | `census.json` | `census.json` | soft: write `turn-compose` on psp-B's harness if it has landed | none |
| **research-scope-board-B 1** | none | none | none | none | none | none | none |
| **research-scope-board-B 2-3** | **hard:** `lib/text/{types,router}.ts` | **hard:** `/api/research` becomes a turn in 4a/4b | none | none | none | none | none |

The README's IMG-A row is being edited by 3b. The catalogue edits proposed below touch other rows.
Apply them after 3b lands, so the README is not merged twice.

**Two counts in production-script-probes-B stage 1 have moved since the earlier pass.**
`find app -name "use*.ts*"` returns **38**, not 37, because `useActiveNotebook.ts` was added in
`6200683`. Six probes reach into `__CLIENT_INTERNALS_DO_NOT_USE`, not five, because
`active-notebook.probe.spec.ts` was added in `6200683`. Its acceptance cases 1 and 3
(`critic-2026-10-07.md:423-428`) should say so.

### Operator decisions

#### The seven in `README.md:134-141`

| Decision | Touched by the stages here? |
| --- | --- |
| `research-run-engine-B`: WebSearch/WebFetch for the research engine | **Yes, for research-scope-board-B stage 3.** A follow-up that "kills a fact" (`follow-up-that-can-kill-a-fact`) from an engine that cannot search is one recollection overruling another. The closure and Script stages respect the wave-3 decision (`TEXT_RETRIEVE` off, `README.md:103`). |
| `AUP-B` lock-instead-of-wipe | No. (Declined, `README.md:242`.) The closure's `ClearDialog` fix is the voluntary Clear, not sign-out. |
| `SLP-B` dev-only `?scenario=` door | No. Every case above seeds through `saveStep` on fake-indexeddb, as `active-notebook.probe.spec.ts` does. |
| `AUP-A` creator data on a server | **Indirectly, for script-phase-B stage 3.** A compose turn's `result` is the creator's script and sits in the local turn ledger, like recalibrate's today. The hosted ledger stays this decision (`critic-2026-10-07.md:583`). |
| `UI-SHELL-A` stage 3 | No. |
| `video-clip-pipeline-B` (Motion) | Already decided (`a9d5975`). The closure's Frames change does not touch `motion/`. |
| `library-styles-atelier-A` `LOCK_PROBLEMS` | No. |

#### New asks found by this pass (asks, not decisions)

- **A1 · What does downstream deal when a project has no usable notebook of its own?**
  - Today, after C1, it is the **replay**: no record, a cleared record and a malformed record all
    resolve to it (`useActiveNotebook.ts:13-22`, `:72`).
  - phase-shared-B wants **nothing** (`none`), so a fresh project's Frames binds no Bitcoin fact
    (its cases 3, 4 and 6).
  - Choosing `none` would change what the seeded project and four harness scripts see
    (`live.ts:23-28` per `02-research-script.md:176`).
  - The closing stage builds under the landed contract unless told otherwise.
- **A2 · Ratify that a *reasoned* (not searched) notebook gates scripts and frames.**
  phase-shared-B names this as the direction call (`03-frames-score-cut.md:301`). Stage 4
  (`f2d82b8`) already made it true for the Script gate, and no recorded decision covers it. The
  closure adds the chip that discloses it, and binds Frames to it too.
- **A3 · Where does Script open for a project whose only notebook is its own?**
  - Today it is blocked (`ScriptStep.tsx:343`).
  - Option one: open onto an empty draft with Compose, which is script-phase-B stage 3.
  - Option two: open onto the three fixture renders gated against the creator's notebook, which
    is what a project with both records already sees.
  - It also decides whether the research verdict should count `research-notebook`
    (`research/verdict.ts:36`), next to WORKSPACE-A's open contract (`README.md:104-106`).
- **A4 · Does applying a follow-up revision keep the creator's scope?** Under C1's digest rule it
  would orphan it. The alternative is to key the scope to the base notebook (or a digest lineage)
  and re-derive cards over the revision. This is a contract for research-scope-board-B stage 2.
- **A5 · Compose keeps running when the creator leaves, and says what it costs first.**
  - The lane-08 decision covers recalibrate and scene direction only (`README.md:110-111`).
  - A compose spends up to 800 s of the operator's seat on `claude-cli`
    (`app/api/script/route.ts:56`, `lib/text/router.ts:176`).
  - Research draws its spend sentence beside the button (`useEducationalResearch.ts:172-181`), and
    compose has no such surface yet.
- **A6 · Real follow-up dispatch at all, before research can search.** This is the
  research-run-engine-B decision, seen from the follow-up side (above). If the answer is "not
  before search", research-scope-board-B ends at stage 2, with `CANNED` as the replay plane only.

### Ordered recommendation

**No step 0 is needed.** The base is green on every gate this work meets
([Gate state](#gate-state-of-the-base)).

1. **The C1 closing stage.** It closes phase-shared-B, and it fixes these live-notebook defects:
   - the Board's digest strip, which loses data;
   - the Step 2 opt-in;
   - the Bitcoin conclusions sent with every recalibrate;
   - the Clear dialog's misstated consequence.

   It runs beside IMG-A 3b, AIO-A 4a and probe-frame-data-B 1. Only the `census.json` merges are
   serial.
2. **research-scope-board-B stage 1**, in parallel with step 1. It is pure, and its files are new.
3. **AIO-A stage 4a**, unchanged from `critic-2026-10-07.md:651-658`, beside steps 1-2.
4. **script-phase-A s2a**, after step 1. It shares the ratchet pin and `constraints.ts`'s default.
5. **script-phase-A s2b, then s2c.**
6. **script-phase-B stage 3 (compose as a turn kind)**, after 3, 5 and the answers to A3 and A5.
7. **production-script-probes-B stage 2 (the journey)**, after 1 and 5.
8. **research-scope-board-B stages 2-3**, after A4 and A6, AIO-A 4b and IMG-A 3b.

**Two to run in parallel next: the C1 closing stage and research-scope-board-B stage 1.**
- Their write sets are disjoint. The closure edits `followup.ts`; rsb-B stage 1 only reads it.
- Neither touches `lib/text`, `lib/spend` or `lib/turns/{runner,answer}.ts`, so neither collides
  with the run in flight or with 4a.
- Both shapes are decided.
- The closure fixes defects that are live on `main` now, wherever a creator has reasoned their own
  notebook.

---

## Proposed catalogue edits (for the README owner; not applied here)

| ID | Proposed status |
| --- | --- |
| `research-scope-board-A` | `landed f2d82b8 - stages 1-4 (54c720d via ca6ddbe, 8b5a956, 6200683+c86dcda+736c2fd+2dc6b45, f2d82b8); closing stage open (critic-2026-10-07-script-chain)`. **The row now cites `e019be8`, which is not on `main`** (`git merge-base --is-ancestor e019be8 main` fails); its on-`main` equivalent is `f2d82b8`. The earlier partial note cited `6cb3bfa`, which is also off `main`; its equivalent is `2dc6b45`. |
| `phase-shared-B` | `open - cases 1,2,5,7 met by research-scope-board-A; 3,4,6 answered by its replay fallback (ask A1); Frames binding, evidence log/modal, chip in the C1 closing stage`. After that stage: `merged into research-scope-board-A <sha>`. |
| `script-phase-A` | `partial 1099deb - session 1; next: s2a draft record + Unknown.probe + derived ledger panel; s2b Step 2 reads the draft; s2c Frames/Board resolve the adopted draft render` |
| `script-phase-B` | `partial 901198a - stages 1-2; next: stage 3 compose as a turn kind + Candidates action (stage 4 merged in), after AIO-A 4a and script-phase-A s2b; asks A3, A5` |
| `research-scope-board-B` | `open - next: stage 1 pure applyRevisions; stage 2 needs a scope-key call (A4: a new digest orphans the scope); stage 3 after AIO-A 4a/4b, IMG-A 3b and A6` |
| `production-script-probes-B` | (in the earlier pass's wording) `37 hooks` → `38`, `five dispatcher probes` → `six` (`active-notebook.probe.spec.ts`, `6200683`) |

Also:
- **The C1 row of the convergence table** (`README.md:41`) can say landed, and that the Frames
  binding moved to the C1 closing stage.
- **`README.md:57-58`.** Its sequencing note is now partly met. script-phase-A no longer waits on
  C1 stage 1. script-phase-B waits on script-phase-A s2b and on AIO-A 4a, not on C1.
- **The four write-set corrections.**
  - script-phase-A: `script/records.ts`, not `_shared/stepStore.ts`.
  - research-scope-board-B: `research/records.ts`, not `_shared/stepStore.ts`.
  - phase-shared-B stage 4: `lib/turns/assemble/recalibrate.ts`, not `app/api/recalibrate/route.ts`.
  - phase-shared-B stage 1: drop `NotebookProvider.tsx`.
