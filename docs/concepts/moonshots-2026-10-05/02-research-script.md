# Moonshot cards · Research Script

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

Scout: read-only, 2026-10-05. All anchors are repo-relative `path:line` and were checked in the tree as it stands.

One finding underneath most of these cards: **the creator's own notebook stops at the research step and goes no further.** The real run (`/api/research`) writes a valid notebook, but the board, the scope maths, the gate, the matrices and the recalibrate payload all read module-scope fixture constants (`NOTEBOOK`, `CONCLUSIONS`, `CARD_DIMENSION`, `RENDERS`, `ATTRIBUTION`, `PROBES`). The cards are ordered so a dispatcher can see which seam each one opens.

---

## research-run-engine

### research-run-engine-A · The real research run becomes a server-owned durable job with a run ledger

**Context:** research-run-engine · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** media-generation/production-pipeline-phasing#long-run-as-background-job · software-engineering/durable-agent-operations#intent-mints-the-identity

**Summary.** Today the paid real run is one synchronous POST, up to 800 s long, and the only thing that can save its notebook is an async closure in the browser tab. Close or reload the tab and the server keeps working (and billing) while the notebook goes nowhere. The fix is to move ownership to the server: write an intent record, run the work detached from the request, settle it into a record on disk, and leave the client only subscribing and reconciling.

**Premise (verified).**
- `app/_phases/research/run/live.ts:209-242`: the fetch and the `saveStep(projectId, "research-notebook", …)` both run inside a client-side `void (async () => …)()`. That closure is the only writer of the paid notebook. Its own header (`live.ts:188-193`) defends it against unmount but not against reload or tab close.
- `app/api/research/route.ts:84` sets `maxDuration = 800` and `:226` does `await reason({ prompt, turn: "research", schema })` inside the request. The HTTP response is the only carrier of the result.
- `lib/text/types.ts:204-222`: `TextRequest` has no cancellation signal, and `route.ts:226` passes none. So an Abort from the client (`live.ts:268-277`, `ac.abort()`) cancels the fetch but not the engine. The CLI turn runs on to completion server-side, and `route.ts:291-296` concedes a `timeout` "may have been billed for work we then threw away".
- `lib/jobs.tsx:256-266`: after a reload, a job that was still running is rewritten as `interrupted`, and nothing can reattach to it.
- `app/_phases/research/run/useResearchRun.ts:78`, `run/live.ts:85-97` and `app/_phases/research/useFollowUps.ts:41` hold three hand-copied above-React stores (Map + subs + read/write/subscribe) for three run-shaped things. All three are session-lived, which `useFollowUps.ts:20` says out loud.

**The move.**
- New `lib/research/runStore.ts` (server only). It reuses the path-safety and `writeJsonAtomic` kernel in `lib/foundry/runStore.ts:27-75` and writes `runs/research/<runId>/{intent.json, events.jsonl, receipt.json, notebook.json | refusal.json}`.
- `POST /api/research` writes `intent.json` first (record precedes effect). The `runId` is minted from a client idempotency key plus `projectId` and a topic hash. The `reason()` call is started through Next's `after()` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`) or a detached promise, and the route returns `202 {runId}`.
- New `GET /api/research/runs/[id]` returns `running | landed | refused | cancelled`.
- New `DELETE /api/research/runs/[id]` kills the subprocess through a new `signal` on `TextRequest`, threaded down to `killTree` (`lib/claudeCli.ts:61`).
- Client: `run/live.ts` stops being the writer and becomes a subscriber that polls (`lib/usePolling.ts:34`). On mount, `useEducationalResearch` asks the server for this project's open or landed runs. It reattaches to a running one; if one landed while the tab was closed, it writes the `research-notebook` step record once, with the receipt.
- `lib/jobs.tsx` gains a "reattached" path, so a server-confirmed running job is not stamped `interrupted`.
- The three copied stores fold into one `lib/projectStore.ts` (`createProjectStore<T>()`).

**Why it is a moonshot / what it unlocks.** Money stops being able to vanish. This is the first durable LLM job in the app, so `/api/recalibrate` (`useVersions.ts:197-225` has the same client-owned fetch) and the follow-up dispatch can adopt the same ledger without anyone redesigning it. Abort becomes a real cancel. The run ledger is also the substrate the B card's streamed phase trace and receipts are written to. Who notices: anyone who closed a laptop mid-run, and the operator reading spend.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Two POSTs with the same idempotency key give one `intent.json`, the same `runId`, and exactly one `reason()` invocation (engine mocked).
2. A run completes while no client is subscribed: `notebook.json` and `receipt.json` exist, and the GET returns `landed` with the receipt's `costUsd`/`costBasis` intact.
3. Hydration after a simulated reload with a running runId resubscribes. The job stays `running`, is never written `interrupted`, and settles `done` when the server lands.
4. A landed run whose notebook was never written to stepStore: hydration writes `research-notebook` exactly once. A second mount writes nothing.
5. DELETE mid-run: the engine receives an abort, the record becomes `cancelled`, no `notebook.json` is written, and a late settle is a no-op.
6. A `NotebookError` refusal produces `refusal.json` carrying every `findings[]` entry, and the GET returns them verbatim.
7. `createProjectStore`: the snapshot stays reference-stable across reads with no write, and `reset(key)` deletes the key and notifies subscribers.

**Write set.** `app/api/research/route.ts`, new `app/api/research/runs/[id]/route.ts`, new `lib/research/runStore.ts`, `lib/text/types.ts`, `lib/text/router.ts`, `lib/claudeCli.ts`, `lib/jobs.tsx`, new `lib/projectStore.ts`, `app/_phases/research/run/live.ts`, `app/_phases/research/run/useResearchRun.ts`, `app/_phases/research/useFollowUps.ts`, `app/_phases/research/guided/useEducationalResearch.ts`, new `tests/golden-path/research-run-durable.probe.spec.ts`, `.gitignore`.

**Risks & rollback.**
- On the cloud rung (Cloud Run / managed platform) the filesystem is ephemeral and post-response CPU can be throttled. The store needs a pluggable backend, or the durable path should be local-only at first and say so in `engineStatus`.
- Idempotency keys must never collide across projects.
- Rollback: an env flag keeps the synchronous route as-is. The client falls back to today's closure when the GET route answers 404.

**First session dispatch.**
1. Read `app/_phases/research/run/live.ts`, `app/api/research/route.ts`, `lib/foundry/runStore.ts` and `lib/jobs.tsx:240-290`, then the Next `after.md` doc in `node_modules/next/dist/docs`.
2. Build `lib/research/runStore.ts` and the intent-first POST, with the engine mocked. Write acceptance cases 1, 2 and 6 as a golden-path probe first.
3. Then add the GET route and client reattach (cases 3-4), then abort (case 5).
4. Gate: `npm run typecheck`, `npm test` (the new probe under `tests/golden-path`), and `npm run verify:text` for the router signal.

_Runner-up:_ Generalise the ledger right away into one `lib/llmRuns` kernel shared by research, recalibrate and follow-up, rather than proving it on research first.

### research-run-engine-B · Researched, not reasoned: a search-capable research rung with source receipts and a real trace

**Context:** research-run-engine · **Slot:** B experience
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 7/10 · **Gate:** policy-loosen
**Registry:** media-generation/content-research-grounding#evidence-grading-ladder · media-generation/content-research-grounding#provenance-signal-asymmetry

**Summary.** The studio's own research step cannot research. Every live notebook is the model's recollection, labelled `reasoned`, and the creator watches an elapsed-time paragraph while the trace ledger replays somebody else's 2026-08-11 run. This card adds the second capability the code already names: a retrieval rung that searches and fetches, records a receipt per source, and streams its nine phases into the existing RunTrace. "Researched" then becomes a claim derived from evidence, not a flag someone set.

**Premise (verified).**
- `app/api/research/route.ts:19-36`: "THIS ENGINE CANNOT SEARCH, on either rung… a run through here is REASONED, NOT RETRIEVED". `route.ts:47-50` names the honest upgrade as "a second capability and a second adapter".
- `lib/claudeCli.ts:241-273`: `--allowed-tools ""` and `--max-turns 1` are load-bearing (the Windows quoting history is at `:243-262`). `lib/text/types.ts:42-48`: `TextCapability = "reason"`, and a tool-using run "would be a SEPARATE SEAM".
- `app/_phases/research/run/live.ts:68-69`: `EngineReceipt.searched` is always `false`, and `route.ts:256` hard-codes it.
- `app/_phases/research/run/LiveResult.tsx:115-128`: the live running state is one paragraph plus `<Elapsed>`. `run/RunTrace.tsx:38,86` renders only the mocked `TRACE` from `run/trace.ts:23-39`, and nothing streams from the real run.
- `route.ts:199-216`: the prompt forces `researchGaps` to open with "no search was run" and marks the steel-man `constructed`. That is the content cost of the missing capability.

**The move.**
- Add `TextCapability = "reason" | "retrieve"` (`lib/text/types.ts`) and a new adapter, `lib/text/providers/claudeCliRetrieve.ts`. It spawns with an allow-list of exactly `WebSearch,WebFetch`, a bounded `--max-turns`, and `--output-format stream-json`.
- Each `tool_use`/`tool_result` pair becomes a `SourceReceipt {url, query, fetchedAt, bytes, excerptHash}` appended to the run's events.
- The cloud rung uses Google grounding, with its grounding metadata mapped to the same receipt.
- `RESEARCH-PROMPT.md` gains phase markers (`## PHASE n`) that the adapter lifts into `TraceStep` events, so `RunTrace` renders the real run row by row. The mocked trace stays the control path.
- `lib/notebook/validate.ts` adds a retrieval cross-check: a `FactSource.url` on a `high`-confidence fact that matches no receipt URL is downgraded, with a finding ("cited, not fetched").
- `searched` is derived from `receipts.length > 0`. The `reasoned`/`researched` chip in `LiveResult` reads the receipt, never a constant.
- Policy: an env/policy flag gates the capability (`engineStatus` reports `policy-forbidden` in the lib/text/errors vocabulary), and `route.ts` falls back to `reason`.

Staged plan:
- (1) Capability, adapter and an argv probe.
- (2) Receipts plus the validator cross-check.
- (3) The streamed phase trace (it composes with the A card's `events.jsonl`, but stage 1-2 stand alone).
- (4) Chip derivation and copy.

**Why it is a moonshot / what it unlocks.** This is the product's core promise, made true for the creator's own topic. Sources become clickable and checkable; B-005 already wants `url` rendered as an anchor. Confidence becomes a function of what was fetched. The two-minute wait turns into watching the work. A creator can trust a notebook enough to make a video from it, which is the reason Step 1 exists. It also feeds the triage board real per-fact evidence classes (`cards.ts:23-31` already carries `sources`).

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The retrieve adapter's argv (shell and non-shell) contains `--allowed-tools` with exactly `WebSearch,WebFetch` and a numeric `--max-turns`. It never contains `Bash`, `Read`, `Edit` or `Write` (probe in the style of the existing CLI-argv probe).
2. A mocked stream with 3 `WebFetch` results gives `receipt.sources.length === 3` and `engine.searched === true`.
3. A `high`-confidence fact citing a URL absent from the receipts is downgraded to `medium`, and the findings include "cited, not fetched".
4. A run with zero tool calls on the retrieve rung gives `searched === false`, the chip reads `reasoned`, and the validator still requires `researchGaps[0]` to name the missing search.
5. A stream chunk containing `## PHASE 2` emits a `TraceStep{phase:"tension"}` event before the run lands.
6. Policy flag off: `GET /api/research` reports the retrieve candidate with a `policy-forbidden` detail, and the POST serves on `reason` with `searched: false`.

**Write set.**
- Stage 1: `lib/text/types.ts`, `lib/text/router.ts`, `lib/claudeCli.ts`, new `lib/text/providers/claudeCliRetrieve.ts`, new `tests/golden-path/research-retrieve-argv.probe.spec.ts`.
- Stage 2: `lib/notebook/validate.ts`, `app/api/research/route.ts`, `app/_phases/research/run/live.ts`.
- Stage 3: `pipeline/RESEARCH-PROMPT.md`, `app/_phases/research/run/RunTrace.tsx`, `run/types.ts`.
- Stage 4: `app/_phases/research/run/LiveResult.tsx`.

**Risks & rollback.**
- Prompt injection through fetched pages is the main new risk. Mitigate it with the tool allow-list, one structured final answer still validated by `parseNotebook`, and no workspace tools.
- Multi-turn cost growth: cap turns and record `costUsd` per run.
- Windows argv quoting has already bitten this exact flag once (`claudeCli.ts:243-262`).
- Rollback: drop `retrieve` from the router `PLAN` and every run is `reason` again, byte for byte.

**First session dispatch.**
1. Read `app/api/research/route.ts` (header), `lib/claudeCli.ts:236-280`, `lib/text/types.ts:20-110` and `lib/text/router.ts:88-210`, then the registry `content-research-grounding` golden path.
2. Build stage 1 only: the `retrieve` capability, the adapter argv and the argv probe (case 1), plus a stream-json parser over a recorded fixture stream (case 2).
3. Gate: `npm run typecheck`, `npm test` (the new probe), and `npm run verify:text`. Do not run a live paid call.

_Runner-up:_ Notebook history and compare: keep every run's notebook, diff two runs (facts added, killed or downgraded), and carry scope decisions across by id (`live.ts:32` names "comparing two notebooks" as undesigned).

_Checked:_ Read in full: `run/types.ts`, `run/trace.ts`, `run/useResearchRun.ts`, `run/live.ts`, `guided/useEducationalResearch.ts`, `app/api/research/route.ts`. Read in part: `run/LiveResult.tsx` (header and states), `run/RunTrace.tsx`/`run/controls.tsx` (symbols), `lib/claudeCli.ts:236-280`, `lib/text/types.ts` (TextRequest, TurnClass, capability), `lib/text/router.ts` (plan), `lib/jobs.tsx` (header, interrupted path), `lib/foundry/runStore.ts`, `_shared/stepStore.ts:1-140`. Hypotheses traced: client-only save (confirmed), no engine cancellation (confirmed: no signal on TextRequest), the "resumes from the cached spine" copy (`trace.ts:55`) describes the mock only. `route.ts:43` cites `run/provenance.ts`, which does not exist: a stale reference.

---

## research-scope-board

### research-scope-board-A · The board deals any notebook: a per-project NotebookSource replaces the fixture constant

**Context:** research-scope-board · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 10/10 · **Risk:** 7/10 · **Gate:** contract
**Registry:** software-engineering/demo-data-plane#one-interface-many-planes · media-generation/content-research-grounding#pre-linked-causal-mechanisms

**Summary.** The scope board, the scope arithmetic and every Step 2 consumer read one static Bitcoin notebook through module constants. A creator's real notebook is therefore a dead end: it cannot be triaged, scoped or scripted. This card makes "the project's active notebook" one resolved, versioned object (a replay fixture or a reasoned/researched run) that every card, wound and gate reads. Conclusions and dimension tags move from hand tables into data carried by the notebook.

**Premise (verified).**
- `app/_phases/research/useScope.ts:39`: `const cards = useMemo(() => buildCards(), [])`. There is no notebook argument and no project dependency, so the board is always the fixture.
- `app/_phases/_shared/notebook/cards.ts:65,107`: `buildCards(nb = NOTEBOOK)` appends the fixture `CONCLUSIONS` unconditionally to whatever notebook it is handed. `lib/notebook/validate.ts:584-601` measured the cost (a fresh notebook got 26 findings, 25 of them inherited conclusion cards) and says "the honest fix is a `conclusions` argument on `buildCards`".
- `app/_phases/_shared/notebook/dimensions.ts:167-189`: `CARD_DIMENSION` is a hand-authored id-to-column table "for the Bitcoin run; a real run would have the researcher tag them at write time". `lib/notebook/validate.ts:570-575` has to suppress `untagged` for every real run as a result.
- `app/_phases/research/scope.ts:46`: `OPT_IN_IDS = new Set(CONCLUSIONS.map(...))`, a module-load constant that defines scope semantics.
- `app/_phases/research/run/LiveResult.tsx:33-40` ("It does not unlock the triage board… dealing them under a creator's own topic would put Bitcoin cards behind their heading") and `guided/useEducationalResearch.ts:29-33` (`ready` is deliberately blind to `live`).
- Step 2 reads the same constant: `script/gate.ts:303,418` (`NOTEBOOK.scaleConversions`, `NOTEBOOK.facts`), `script/useVersions.ts:203` (`notebook: NOTEBOOK` sent to `/api/recalibrate`), `script/_parts/HypothesisColumn.tsx:40` (`NOTEBOOK.engineFit`), `script/constraints.ts` and `research/followup.ts:12` (`UNKNOWN_BY_ID`/`FACT_BY_ID`).

**The move.**
- New `app/_phases/_shared/notebook/source.ts`: `type NotebookSource = { kind: "replay" | "reasoned" | "researched"; notebook: Notebook; conclusions: Conclusion[]; dimensions: Dimension[]; tagOf(id): DimensionId; receipt?: EngineReceipt; digest: string }`.
- New `useActiveNotebook(projectId)` resolves it from stepStore. The live record (`research-notebook`) wins over the replay when present and not cleared; the replay fixture is a `NotebookSource` built from today's constants.
- `buildCards(source)`, `untaggedIds`, `notebookIssues`, `OPT_IN_IDS` (becomes `optInIds(source)`), `scopeSummary` (its `DIMENSIONS` becomes `source.dimensions`), `FACT_BY_ID`/`UNKNOWN_BY_ID` (become `source.byId`), `runGate(…, {facts, unknowns})` and the recalibrate payload all take the source rather than importing constants.
- Contract additions, made additive and versioned through NOTEBOOK_SCHEMA/`lib/notebook/validate.ts`: optional `dimensions[]` with `Fact/Mechanism/Reversal.dimension`, and optional `conclusions[]`. The fixture keeps its tables as its own source's data.
- The scope record (`ScopeStepData`) is stamped with `source.digest`. A scope written against a different notebook is reported as orphaned and is never applied to the wrong cards.
- The ESLint/probe ratchet bans importing `NOTEBOOK`/`CONCLUSIONS` outside `_shared/notebook/`.

Staged plan:
- (1) `NotebookSource` and the fixture adapter. All consumers take it, with behaviour identical on the fixture (proven by the existing probes).
- (2) Schema `dimensions`/`conclusions`, plus the validator dropping its fixture-coupled filters.
- (3) `useActiveNotebook` picks a live notebook, and the board deals it.
- (4) Step 2 consumers (gate, recalibrate payload, HypothesisColumn) read the source. The renders are still fixtures, which is the script-phase-A card.

**Why it is a moonshot / what it unlocks.** This is the hinge of the whole studio. Today `/api/research` produces a notebook that nothing downstream can use. After this card, a creator's own topic flows topic → notebook → triage → wounds → gate, with no Bitcoin anywhere. It also removes three standing workarounds (validator filters, the `untagged` column alarm, the `GLOBAL_NOTEBOOK` caveats in `followup.ts:194`), and it is the prerequisite for the follow-up (B) and compose (script-phase-B) cards.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `buildCards(fixtureSource)` deep-equals today's `buildCards()` output: 39 cards, same ids, same dimensions and dependsOn.
2. `buildCards(sourceOf(minimalNotebook))` has zero `conclusion` cards and zero `untagged` when the notebook tags every card. `notebookIssues` reports no dangling refs owned by fixture conclusions.
3. `optInIds(source)` equals the source's conclusion ids. A live notebook with no conclusions gives an empty set, and `scopeSummary(...).notTaken === 0`.
4. `useActiveNotebook` for a project with a non-null `research-notebook` record returns `kind: "reasoned"`. After `resetLive` (cleared record) it returns the replay or none, never the cleared notebook.
5. A scope saved with digest X, loaded against a source with digest Y, is reported as `orphaned` and applies no verdicts.
6. `runGate(chain, {source})` over a live source never reads `NOTEBOOK.facts`. A spy or module mock proves it.
7. A ratchet probe: no file outside `_shared/notebook/` imports `NOTEBOOK` or `CONCLUSIONS`, and the count may only fall.

**Write set.**
- Stage 1: new `_shared/notebook/source.ts`, `_shared/notebook/cards.ts`, `_shared/notebook/dimensions.ts`, `research/scope.ts`, `research/useScope.ts`.
- Stage 2: `lib/notebook/validate.ts`, `_shared/notebook/types.ts`, `pipeline/NOTEBOOK-SCHEMA.md`.
- Stage 3: new `_shared/notebook/useActiveNotebook.ts`, `research/ResearchStep.tsx`, `research/guided/useEducationalResearch.ts`, `research/run/LiveResult.tsx`.
- Stage 4: `script/gate.ts`, `script/useVersions.ts`, `script/_parts/HypothesisColumn.tsx`, new `tests/golden-path/notebook-source.probe.spec.ts`.

**Risks & rollback.**
- Four harness scripts and the UAT lane drive the replay path (`live.ts:23-28`). Stage 1 must be a pure refactor proven by the existing probes before any live notebook is dealt.
- A live notebook dealt with no dimension tags lands entirely in `untagged`, so stage 3 should wait for stage 2.
- Rollback: `useActiveNotebook` can be pinned to the replay source by a flag, which restores today's behaviour exactly.

**First session dispatch.**
1. Read `_shared/notebook/cards.ts`, `_shared/notebook/dimensions.ts`, `research/scope.ts`, `research/useScope.ts` and `lib/notebook/validate.ts:560-610`.
2. Build stage 1: `NotebookSource` plus `fixtureSource`, threaded through `buildCards`/`scopeSummary`/`optInIds`, with acceptance case 1 as a probe written first.
3. Do not touch the live path in this session.
4. Gate: `npm run typecheck`, `npm run check:notebook`, and `npm test` (`scope-decisions`, `scope-consequences-copy`, `cards-carry-evidence-class` probes must stay green).

_Runner-up:_ A live beat board. Wire `pipeline/BEATS-PROMPT.md` (its header says "Not read by code yet") to a route so `slotsFor` deals the project's own logline instead of `GLASS_HARBOR_SLOTS` (`beats/beats.ts:47-49`). This adopts the fixture half of C-002.

### research-scope-board-B · Follow-ups that land: a per-project revision ledger the creator applies, rejects and undoes

**Context:** research-scope-board · **Slot:** B experience
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** media-generation/review-iteration-loops#follow-up-that-can-kill-a-fact · software-engineering/undo-history#checkpoint-restore

**Summary.** The follow-up queue is a status surface with no verb. It has two canned answers matched by regex, effects labelled "not applied" because the notebook is a global static module, and results that vanish on reload while the bell still says "done". This card turns it into the place the notebook grows: a real dispatch returns typed `Effect`s, each one lands as a revision over the project's base notebook with Apply/Reject, a revision can be undone, and the board, wounds and gate re-derive over the revised notebook.

**Premise (verified).**
- `app/_phases/research/followup.ts:165-173`: "THERE IS NO APPLY ACTION… the notebook here is a single static module shared by every project — there is nowhere per-project to write one". `followup.ts:194-195` repeats this into the UI as `GLOBAL_NOTEBOOK`.
- `followup.ts:52-96` and `:280-295`: the only answers are two `CANNED` transcripts, and `matchQuestion` is a regex on `/whale|on.?chain|cohort|holder/`. Every other request ends `unanswered`.
- `app/_phases/research/_parts/FollowUpQueue.tsx:33-36,150-167`: the dispatch is a 700 ms `setTimeout` mock. A real dispatch "replaces this timeout and nothing else in this file changes".
- `app/_phases/research/useFollowUps.ts:18-26`: the record is session-lived and nothing is written to disk. After a reload the bell carries "done · Results are staged" over an empty queue.
- The `Effect` union is already typed for exactly this ledger (`followup.ts:18-23`: confirms/downgrades/kills/resolves-unknown/adds-fact), and `revisionsOf`/`standingOf` already derive standing against the live card set.

**The move.**
- New `app/_phases/research/revisions.ts`: `NotebookRevision {id, requestId, effects: Effect[], decided: Record<effectIdx, "applied" | "rejected">, at}` and a pure `applyRevisions(base: Notebook, revs): Notebook`. It covers adds-fact (inserts a `Fact` with `sources`), kills (removes the fact and records the tombstone in a `killed[]` history, so wounds name it), downgrades (sets `confidence` and `confidenceNote`) and resolves-unknown (sets `resolvedBy`).
- These are persisted under a new stepStore key, `research-revisions`, and `useFollowUps` persists its requests beside them.
- The active notebook (research-scope-board-A's `NotebookSource`) becomes `applyRevisions(base, applied)` with a new digest. Cards, wounds, the constraint ledger and the gate all follow automatically.
- `FollowUpQueue` gains per-effect Apply/Reject and an "undo revision" control. Undo is a checkpoint restore, which drops the revision and re-derives the notebook.
- The real dispatch is a `follow-up` turn class on `/api/research` (same `reason()` chokepoint, an `EFFECTS_SCHEMA` that `parseEffects` validates against the current notebook's ids). The `CANNED` transcripts stay as the replay plane.
- `standingOf` loses its `GLOBAL_NOTEBOOK` branches and reads `applied | rejected | pending`.

**Why it is a moonshot / what it unlocks.** The iteration loop the registry technique demands, where a follow-up can kill a fact and the fact base does not only grow, becomes something a creator actually does instead of something the UI apologises for. Deepen stops being a dead-end flag (`scope.ts:13`: "Routes BACKWARD, to a next run"). Every downstream surface updates because it reads the revised notebook. Who notices: the expert reviewer persona (Priyanka/Dani in `docs/BACKLOG.md`), who wants evidence that changes the script.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `applyRevisions(base, [kills f-x])`: `f-x` is absent from `facts`, present in `killed`, and `woundsOf` reports the cards that depended on it as missing `f-x`.
2. `applyRevisions(base, [adds-fact f-new])` gives a card `f-new` with its `source`/`confidence`. Applying the same revision twice is idempotent.
3. A `downgrades` effect on an id absent from the base is reported `no such id here`, and `applyRevisions` leaves the notebook unchanged.
4. Reject one effect of a three-effect revision: only the other two land, and the decision survives a reload (stepStore round-trip).
5. Undo the newest revision: the notebook digest returns to its previous value and the board's card count returns to its previous value.
6. A reload after a returned dispatch: the queue shows the returned request and its effects, and the bell and queue agree.
7. `parseEffects` refuses a model answer naming an unknown target id, with the finding listed, and nothing is applied.

**Write set.** New `app/_phases/research/revisions.ts`, `research/followup.ts`, `research/useFollowUps.ts`, `research/_parts/FollowUpQueue.tsx`, `research/_parts/FollowUpResult.tsx`, `_shared/stepStore.ts` (new `RevisionsStepData`), `app/api/research/route.ts` (or new `app/api/research/follow-up/route.ts`), `lib/text/types.ts` (TurnClass `follow-up`), `lib/text/router.ts`, `research/ResearchStep.tsx` (Clear resets revisions, per the `step-clear-completeness` probe), new `tests/golden-path/notebook-revisions.probe.spec.ts`.

**Risks & rollback.**
- Kills cascade into Step 2 (renders speaking a killed fact). That is the point, but it must surface through B-001's "still spoken" Coverage marking, not silently.
- Depends on research-scope-board-A, stage 1. Without it the revised notebook has no reader.
- Rollback: an empty revisions record equals today's behaviour.

**First session dispatch.**
1. Read `research/followup.ts`, `research/useFollowUps.ts`, `research/_parts/FollowUpQueue.tsx` and the registry technique `follow-up-that-can-kill-a-fact`.
2. Build `revisions.ts` (a pure `applyRevisions`) with acceptance cases 1-3 and 5 as unit probes first, over the `CANNED` effects against the fixture.
3. Then add persistence (cases 4 and 6).
4. Gate: `npm run typecheck`, `npm test` (the new probe plus `step-clear-completeness`), and `npm run check:notebook`.

_Runner-up:_ Liked-signal learning. Aggregate `liked` across projects into the TONE profile the scope header promises (`scope.ts:11-12`), with a visible "your taste" panel.

_Checked:_ Read in full: `scope.ts`, `useScope.ts`, `followup.ts`, `useFollowUps.ts`, `beats/beats.ts`. Read in part: `ResearchStep.tsx` (branching and `doClear`), `ResearchTriageBoard.tsx` (header), `_parts/FollowUpQueue.tsx` (header and dispatch), `useMusicVideoSource.ts` (header), `_shared/notebook/cards.ts:1-160`, `_shared/notebook/dimensions.ts:150-189`, `_shared/notebook/types.ts` (Notebook, Unknown), `lib/notebook/validate.ts:560-640`. Hypotheses traced: the board is fixture-bound (confirmed at `useScope.ts:39`, not merely by default), and Step 2 shares the constant (confirmed at 5 call sites). The beat board (`beats.ts:47`) is equally fixture-bound, but C-002 owns its seam. This context has no row in `.ai/registry-map.json`.

---

## script-phase

### script-phase-A · ScriptDraft: renders become per-project data, and the hand tables become derivations

**Context:** script-phase · **Slot:** A architecture
**Size:** L · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 7/10 · **Gate:** contract
**Registry:** software-engineering/demo-data-plane#runtime-dispatch-not-build-flag · media-generation/review-iteration-loops#edit-plan-over-regeneration

**Summary.** Step 2 is built on five module-scope tables keyed by three fixture render ids: `RENDERS`, `ATTRIBUTION`, `IMPACT` (computed once at import), `CONSTRAINT_LEDGER` (hand-typed verdicts) and `PROBES`. Even the model's edit-plan schema enumerates the fixture ids. This card introduces a versioned `ScriptDraft` record per project that carries renders with embedded attribution, cut facts and probes. Every matrix, gate, ledger and the edit-plan schema then read the draft, and the hand tables survive only as the fixture draft's data.

**Premise (verified).**
- `app/_phases/script/renders.ts:8,160`: `RENDERS` and `RENDER_BY_ID` are the three transcribed Bitcoin renders, imported by 9 modules (`chainBase.ts:9`, `recalibrate.ts:32`, `editPlan.ts:14`, `scopeConflicts.ts:10`, `ScriptStep.tsx:58`, `candidates/adoption.ts:28`, …).
- `app/_phases/script/impact.ts:32-57,118-140`: `ATTRIBUTION` is a hand-authored beat-mark-to-card-ids table per fixture render, and `IMPACT` is built once at module load from it. `usageOf`/`coverage` read that global.
- `app/_phases/script/editPlan.ts:61`: the model contract hard-codes `renderId: { enum: RENDERS.map((r) => r.id) }`, so a model cannot even name a render that is not a fixture.
- `app/_phases/script/constraints.ts:39-58`: `CONSTRAINT_LEDGER` holds hand-typed `honoured/at-risk` states. `gate.ts:1-22` itself says the hand ledger is "a well-designed noun with no verb" and the gate replaced it, yet both still ship.
- `app/_phases/script/gate.ts:492-514`: `PROBES` is keyed by fixture unknown ids. A notebook whose unknowns are not those four scores `enforced: 0` (`gate.ts:28-33`). `Unknown` (`_shared/notebook/types.ts:262-292`) has no probe field, and `lib/notebook/validate.ts` never mentions probes.
- `app/_phases/script/ScriptStep.tsx:270-271`: the runtime mismatch is computed against fixture durations. `candidates/adoption.ts:40-41` falls back to `RENDERS[0]`.

**The move.**
- New `app/_phases/script/draft.ts`: `ScriptDraft { schema: 1; projectId; notebookDigest; renders: DraftRender[] }`, where `DraftRender = ScriptRender & { attribution: Record<mark, cardId[]>; probes?: Record<unknownId, SerializableProbe> }`. `SerializableProbe` is `Probe` with `{source, flags}` patterns instead of `RegExp`, so it can travel through JSON and a model.
- `fixtureDraft()` builds today's draft from `RENDERS`/`ATTRIBUTION`/`PROBES` verbatim.
- `impactOf(draft)` replaces the global `IMPACT`. `usageIn`, `coverage`, `orphanedCuts`, `rendersInScope` and `scopeConflicts` all take `draft`.
- `editPlanSchema(draft)` replaces the `EDIT_PLAN_SCHEMA` constant, so its `enum` comes from the draft.
- The constraint ledger is DERIVED. `ledgerFor(render, notebook)` maps each unknown's gate verdict to `honoured | at-risk | not-engaged | unmeasured`, and the hand `how` strings become optional annotations on the fixture draft. This removes a second, contradictory verdict source.
- Gate probes resolve as `unknown.probe ?? draft.probes?.[id] ?? fixture PROBES[id]`. `Unknown.probe?: SerializableProbe` is added to NOTEBOOK_SCHEMA/validate (validated by compiling every pattern), so the research run can author its own probes.
- `useScriptDraft(projectId)` persists under stepStore `script-draft`, and seeds `fixtureDraft()` only for the replay notebook.
- The version model (`Version.impact`, `beats`, `attribution`) is unchanged, because it already carries per-render data.

**Why it is a moonshot / what it unlocks.** Step 2 stops being a viewer of three canned scripts and becomes an engine that can hold any script. This is the precondition for composing a first draft from a creator's notebook (script-phase-B), for the gate measuring a live notebook (`enforced` above 0), and for the model naming renders it wrote. It also collapses the two verdict sources (hand ledger vs. gate) into one, which the gate's own header asked for.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `impactOf(fixtureDraft())` deep-equals today's `IMPACT` for all three renders (seconds, beats and `cut` reasons).
2. `editPlanSchema(draftWith(["r-a","r-b"])).…renderId.enum` equals `["r-a","r-b"]`, and `parseEditPlan` refuses `reversal-chain` against that draft.
3. `ledgerFor("reversal-chain", NOTEBOOK)` reports `u-yield-causality` as `at-risk`, derived from the gate's violation rather than read from the table, and agrees with `runGate` on every row.
4. A notebook unknown carrying `probe: {forbid:[{source:"\\$\\s?9\\d"}]}` is enforced by `runGate` against a render containing "$95". `enforced` is above 0 with an empty `PROBES` table.
5. `validate.ts` refuses a notebook whose probe pattern fails to compile, naming the unknown id.
6. A draft with one render: `ScriptStep` renders Candidates/Coverage/Spend/Tracks with one column, and `adoption.ts` no longer falls back to a fixture render that is not in the draft.
7. The existing probes `adopted-render`, `chain-break-reaches-the-reviewer`, `scope-conflict-resolution` and `gate-regression` stay green on `fixtureDraft()`.

**Write set.** New `app/_phases/script/draft.ts`, new `app/_phases/script/useScriptDraft.ts`, `script/impact.ts`, `script/editPlan.ts`, `script/constraints.ts`, `script/gate.ts`, `script/chainBase.ts`, `script/recalibrate.ts`, `script/scopeConflicts.ts`, `script/ScriptStep.tsx`, `script/candidates/adoption.ts`, `_shared/notebook/types.ts`, `lib/notebook/validate.ts`, `_shared/stepStore.ts`, new `tests/golden-path/script-draft.probe.spec.ts`.

**Risks & rollback.**
- The Frames step reads the adopted render (`adoption.ts:36` comment: "the same fixture Frames has always opened on"). The adoption fallback must keep Frames working on the replay project.
- `pipeline/gate-regression.mts` and `drive-script-step.mjs` assume the constants. Keep `RENDERS` exported as `fixtureDraft().renders` for one release.
- Rollback: `useScriptDraft` pinned to `fixtureDraft()`.

**First session dispatch.**
1. Read `script/impact.ts`, `script/constraints.ts`, `script/gate.ts:59-130,405-514`, `script/editPlan.ts:40-120`, `script/chainBase.ts` and `script/renders.ts:1-10,155-170`.
2. Build `draft.ts` with `fixtureDraft()` and `impactOf(draft)`, with acceptance cases 1 and 3 written first, then thread `draft` through `editPlan.ts` (case 2).
3. Leave persistence and the UI for session 2.
4. Gate: `npm run typecheck`, `npx tsx pipeline/gate-regression.mts`, and `npm test` (the existing script probes).

_Runner-up:_ The gate as a versioned rule registry. Every `check*` declares an id, version and citation; the gate report stamps the rule set's version on accepted versions, so a re-gate after a rule change is diffable.

### script-phase-B · Compose: the creator's own notebook in, three gated candidate renders out

**Context:** script-phase · **Slot:** B experience
**Size:** XL · **Effort:** 9/10 · **Impact:** 10/10 · **Risk:** 7/10 · **Gate:** direction
**Registry:** media-generation/narrative-engine-selection#engine-arbitration-order · media-generation/narrative-engine-selection#no-engine-means-no-video

**Summary.** Step 2 can recalibrate the three scripts transcribed from one 2026-08-11 terminal run, but nothing in the app writes a script. After research-scope-board-A and script-phase-A land, the missing step is a `/api/script` turn. It reads the active notebook, the confirmed scope and the notebook's own `engineFit`, and composes the top-fit engines into candidate renders with beat-level attribution. Each candidate is gated before display, and the existing Candidates duel, matrices and adoption run over the result unchanged.

**Premise (verified).**
- `app/_phases/script/renders.ts:1-4`: the renders are "Transcribed from pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/script--*.md". The scripts were written in a terminal, outside the app.
- `app/api/`: the only text routes are `research` and `recalibrate`, and `pipeline/` has `RESEARCH-PROMPT.md` and `RECALIBRATE-PROMPT.md` but no script-composition prompt. `lib/text/types.ts:114-121` has no script turn class.
- `app/_phases/script/editPlan.ts:19`: the model's only verbs are `retime | rewrite | cut | insert` over existing renders (`EditOp`), so it can never produce a new render.
- `app/_phases/script/_parts/HypothesisColumn.tsx:40,124`: the notebook already carries `engineFit[]` keyed to `renderId` and a `templateIntent`. The research phase (`run/trace.ts` t14: "5 engines assessed… reversal-chain excellent · adjudication good…") already makes the engine decision this step would act on.
- `app/_phases/script/ScriptStep.tsx:270-271`: the project's `targetS` is compared to fixture durations and reported as a mismatch, because no render is written to the project's clock.

**The move.**
- New `pipeline/SCRIPT-PROMPT.md`, assembled from `knowledge/ENGINES.md`, `CRAFT-BASELINE.md` and the template's `steps/01-script/PATTERNS.md`/`params.json`.
- New `app/api/script/route.ts`. It follows the `/api/recalibrate` shape (guard, prompt from disk, `reason({turn:"compose"})`, the same three-branch catch) and takes `{notebook, scope, targetS, template, engines}`.
- It returns `DraftRender[]` (script-phase-A's contract) with beats, `attribution` per beat mark and `cutFacts`, plus `checks` left `unmeasured`, because a self-check is not a verdict (`gate.ts:15-22`).
- New `lib/script/validate.ts` (`parseDraft`) enforces:
  - every attributed id is a kept card in the sent scope;
  - the BUT/THEREFORE law on connectors;
  - durations within the template band for `targetS`;
  - every render having one engine from the notebook's `engineFit` with fit at least "good". When none qualify, the response is a valid refusal: "no engine fits this notebook" (`no-engine-means-no-video`).
- The route runs `runGate` on each candidate server-side and returns the reports.
- UI: a Compose action on the Candidates tab when the project's draft is the fixture or empty. It runs as a durable job (research-run-engine-A's ledger, once it exists), and the result becomes a new `ScriptDraft` whose renders enter the duel. Recalibrate then works on them, because `editPlanSchema(draft)` names them.

Staged plan:
- (1) Prompt, route and `parseDraft` with a recorded fixture answer.
- (2) The server-side gate and refusal path.
- (3) The UI action and draft adoption.
- (4) A durable-job wrapper.

**Why it is a moonshot / what it unlocks.** It closes the product loop. A creator types a topic, gets a notebook, scopes it, and receives scripts written for their own subject, their clock and their template, already gated against their own unknowns. That turns the studio from a demonstration of one Bitcoin video into a tool. Every downstream step (frames, motion, cut) starts receiving novel inputs.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `parseDraft` over a recorded answer attributing a descoped card id refuses it, and the finding names the render, beat mark and card.
2. A recorded answer with an `AND THEN` connector between two movement beats yields a finding (shared with the gate's connector law), not a silent pass.
3. A notebook whose `engineFit` has no engine at "good" or better returns an HTTP 200 refusal body `{refused:"no-engine-fits"}`, and no draft is written.
4. A valid recorded answer produces two `DraftRender`s whose `durationS` falls within the template band for `targetS`. `ScriptStep`'s runtime mismatch is false for them.
5. Each returned render carries a `GateReport`, and an `enforced` figure is shown per candidate.
6. After compose, `editPlanSchema(draft)` enumerates the new render ids, and a recalibrate against them is accepted by `parseEditPlan`.

**Write set.**
- Stage 1: new `pipeline/SCRIPT-PROMPT.md`, new `app/api/script/route.ts`, new `lib/script/validate.ts`, `lib/text/types.ts` (TurnClass `compose`), `lib/text/router.ts`.
- Stage 2: `script/gate.ts` (exported server-safe entry).
- Stage 3: `script/candidates/CandidatesDuel.tsx`, `script/useScriptDraft.ts`, `script/ScriptStep.tsx`.
- Stage 4: the durable-job adapter.
- New `tests/golden-path/script-compose.probe.spec.ts` and a `pipeline/compose-regression.mts` selftest over recorded answers.

**Risks & rollback.**
- Depends on research-scope-board-A, stages 1-3, and on script-phase-A. Dispatching it first means building on fixtures again.
- Long-form output can exceed schema enforcement on the cloud rung (the recalibrate route has prior art for argument limits at `app/api/recalibrate/route.ts:304`).
- Rollback: the Compose action is hidden when `engineStatus("compose")` has no candidate. Fixture drafts remain.

**First session dispatch.**
1. Read `app/api/recalibrate/route.ts`, `script/editPlan.ts` (the schema and the parse/validate pattern), `knowledge/ENGINES.md` and `_parts/HypothesisColumn.tsx`.
2. Write `pipeline/SCRIPT-PROMPT.md` and `lib/script/validate.ts`, with acceptance cases 1-4 written first over hand-recorded answers.
3. Make no live paid call.
4. Gate: `npm run typecheck`, `npx tsx pipeline/compose-regression.mts` (new), and `npm test`.

_Runner-up:_ A cross-render argument diff on the Candidates tab: which reversals, steel-man and conclusions each render argues, aligned by card id, so "which version to adopt" is decided on argument coverage rather than prose.

_Checked:_ Read in full: `script/types.ts`, `script/impact.ts` (1-60, 100-184), `script/constraints.ts`. Read in part: `script/versions.ts:1-120`, `script/gate.ts:1-135, 405-514`, `script/renders.ts:1-60`, `script/useVersions.ts:185-225`. I also grepped every consumer of `RENDERS`/`IMPACT`/`ledgerFor` across `script/`, `editPlan.ts` exports/schema enum, `HypothesisColumn.tsx` (engineFit), `app/api/` route list and `pipeline/` prompt list. Hypotheses traced: the edit-plan schema is fixture-bound (confirmed at `editPlan.ts:61`); the gate can measure a live notebook (refuted: no probe field anywhere in the contract). Excluded per brief: chainBase stacking and scope-conflict bulk resolve.

---

## trailer-script

### trailer-script-A · The trailer cut as an edit log: spine + ordered ops, so edits survive recompose and undo is free

**Context:** trailer-script · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/undo-history#execution-emitted-inverse · media-generation/review-iteration-loops#partial-regeneration-seams

**Summary.** The trailer cut is stored as one mutable snapshot. Every beat edit replaces it (`setCut(withBeat(...))`), there is no undo, and taking a newer spine from Step 1 throws away every edit made in Step 2. The fix is to store the cut as its composed origin plus an ordered log of typed ops, and derive the snapshot from that. Undo/redo then comes for nothing, a recompose can replay the edits whose beats survived, and the record finally says what the creator changed versus what the board dealt.

**Premise (verified).**
- `app/_phases/script/trailer/useTrailerCut.ts:142-153`: `setBeat`/`setPayer`/`addPromise`/`setAllowance` each replace state with a new snapshot, and nothing records the inverse. Nothing under `app/_phases/script` implements undo; the only "undo" string is adoption, at `_parts/HypothesisColumn.tsx:191`.
- `useTrailerCut.ts:125-135`: "Take the board's current spine: rebuild the cut from it. Beat edits made on the old cut are discarded". `TrailerScript.tsx:158-184` warns "discards your edits here" before the click.
- `_shared/stepStore.ts:145-165`: `TrailerCutStepData` stores `cut` plus `spine` (the composed picks) but not the edits, so what the creator did cannot be told apart from what the variant carried.
- `app/_phases/script/trailer/cut.ts:73-149`: the mutations already exist as pure, typed updaters (`BeatPatch`, `withPromisePayer`, `addPromise` with stable derived ids, `withAllowance`). That is an op vocabulary waiting for a log.
- `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts:1-17`: the lifecycle probe exists precisely because recompose "would silently discard every edit made in Step 2".

**The move.**
- New `app/_phases/script/trailer/ops.ts`: `type CutOp = {kind:"patch-beat"; beatId; patch: BeatPatch; prev: BeatPatch} | {kind:"set-payer"; …; prev} | {kind:"add-promise"; beatId; promiseId; sentence} | {kind:"set-allowance"; assetId; allowance; trade?; prev}`. Each op is emitted by an updater together with its inverse (execution-emitted inverse).
- `replay(origin: TrailerCut, ops: CutOp[]): {cut; skipped: CutOp[]}`. An op whose `beatId` no longer exists is skipped and reported, never dropped silently.
- `TrailerCutStepData` gains `origin` (the composed cut), `ops[]` and `head`. `cut` is kept as a derived cache for Step 3 readers, which keeps the contract additive.
- `useTrailerCut` exposes `undo`, `redo`, `canUndo` and `edited(beatId)`.
- `recompose` becomes a rebase: compose the new origin from the new spine, then replay the ops. Ops on beats whose slot pick did not change land; ops on beats whose variant changed are returned as `skipped` and shown as "N edits did not carry: their beat was replaced".
- `BeatEditor` shows an `edited` marker per beat (a `signal/` glyph with an sr-only label) and a reset-to-dealt action, which removes that beat's ops.
- Typing coalesces into one op per field per focus (gesture coalescing).

**Why it is a moonshot / what it unlocks.**
- The creator can iterate on the spine in Step 1 without losing their Step 2 work. This removes the single worst trade-off on the trailer path, and a known UAT complaint (`useTrailerCut.ts:56-58`: four Characters).
- Undo/redo arrives with no extra design.
- A model edit plan (the B card) can be applied as just more ops and reviewed or reverted per op.
- Step 3 can ask which beats are authored and which are dealt.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `replay(origin, [])` equals `origin`. `replay(origin, ops)` equals the result of applying the same updaters in sequence (property over the Glass Harbor fixture).
2. undo after `patch-beat` restores the prior `text`/`connector` exactly, and redo reapplies them. A new edit after an undo truncates the redo tail.
3. Recompose with one slot's pick changed: edits on the other slots' beats survive, and edits on the changed slot are in `skipped` with their beat ids.
4. Hydrating a legacy record with `cut` and no `origin`/`ops` treats `cut` as the origin with empty ops (no data loss), and the save writes the new shape.
5. Twenty keystrokes in one focus of a beat's text yield one `patch-beat` op.
6. The `trailer-cut-lifecycle` probe's seed-once and nothing-written-for-an-empty-spine cases stay green.

**Write set.** New `app/_phases/script/trailer/ops.ts`, `script/trailer/cut.ts`, `script/trailer/useTrailerCut.ts`, `script/trailer/BeatEditor.tsx`, `script/trailer/MovementSection.tsx`, `script/trailer/TrailerScript.tsx`, `_shared/stepStore.ts` (`TrailerCutStepData`), `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts`, new `tests/golden-path/trailer-cut-ops.probe.spec.ts`.

**Risks & rollback.**
- Step 3 and the shot lane read `cut` (`TrailerCutStepData.cut`). Keeping it as a derived cache written on every save keeps them working.
- The ops log grows without bound, so cap or compact on save (fold ops older than N into the origin).
- Rollback: readers ignore `ops`/`origin` and the cached `cut` is today's record.

**First session dispatch.**
1. Read `script/trailer/cut.ts`, `script/trailer/useTrailerCut.ts`, `_shared/stepStore.ts:145-165` and `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts`.
2. Build `ops.ts` (op types, inverse-emitting updaters, `replay` with `skipped`), with acceptance cases 1-3 written first as a probe over the Glass Harbor fixture. Wire undo into the hook last.
3. Gate: `npm run typecheck`, `npm run check:trailer-structure`, and `npm test` (the lifecycle probe plus the new ops probe).

_Runner-up:_ Inject a real `magnitudeOf` from `TrailerBeat.raises` and declared rung order (the field `frames/shots.ts:654-664` names). Then the product's magnitude rules stop being permanently `unmeasured`: `useTrailerCut.ts:138` never passes a resolver, and only the regression and probe do.

### trailer-script-B · Notes and a model edit plan for the trailer: bring the stack-and-recalibrate loop to the cut, structure-checked before accept

**Context:** trailer-script · **Slot:** B experience
**Size:** L · **Effort:** 8/10 · **Impact:** 8/10 · **Risk:** 6/10 · **Gate:** direction
**Registry:** media-generation/review-iteration-loops#critique-carries-its-fix · media-generation/trailer-structure#promise-ledger

**Summary.** The explainer half of Script has notes, a one-at-a-time recalibration through a real model and a candidate-vs-baseline accept. The trailer half has none of it. A creator reads eleven structural findings, each with a located beat and a doctrine citation, then fixes every one by hand, and no model can help. This card lets the creator stack notes against beats, and lets findings auto-propose notes ("critique carries its fix"). One `/api/recalibrate` turn in trailer form returns an edit plan as cut ops, and the candidate cut is re-checked by `runStructureCheck` beside the current one before the creator accepts it.

**Premise (verified).**
- Notes are explainer-only. `NotesContext`/`StickyNotebook`/`NoteComposer` are imported by `script/ScriptStep.tsx`, `useVersions.ts` and `_matrix/*`, but not by anything under `script/trailer/`, and `TrailerScript.tsx:14-26` imports no note or version module.
- `app/api/recalibrate/route.ts` has no trailer branch (grep finds no `trailer`/`form` handling), and `script/editPlan.ts:61` restricts the plan to the explainer fixture render ids.
- `app/_phases/script/trailer/structure.ts:99-112`: every `StructureFinding` already carries `beatId`, `at`, `detail` and `cites`. The connector rule's detail already names the repair ("Repair is merge, reorder, or find the missing rung", `structure.ts:391-396`), so the fix is known and simply has no verb attached.
- `structure.ts:1253-1295`: `runStructureCheck` is pure and cheap, which makes a candidate-vs-current re-check before accept affordable on every render.
- `script/trailer/cut.ts:73-149`: there is a typed mutation vocabulary (`BeatPatch`: label/text/connector/raises/promises/spends) a model plan can target without inventing a new contract.

**The move.**
- New `script/trailer/notes.ts`: `TrailerNote {id, beatId | movementId, kind: "fix-connector" | "collapse-raises" | "name-payer" | "hold-asset" | "custom", text?, fromFinding?: rule}`. `notesFromFindings(report)` turns each `violation` into a suggested note the creator can take or dismiss, so the critique carries its fix.
- The trailer surface reuses `_notes/StickyNotebook`/`NoteComposer` with a trailer preset list.
- `/api/recalibrate` accepts `form: "trailer"` with `{cut, budget, notes, report}`. It uses `RECALIBRATE-PROMPT.md` plus a new trailer section read from `knowledge/templates/trailer/steps/01-script/PATTERNS.md`.
- A new `TRAILER_EDIT_PLAN_SCHEMA` enumerates the cut's actual beat ids and returns `CutOp[]`, which is trailer-script-A's vocabulary. Without the A card, it returns `BeatPatch` per beat.
- `parseTrailerPlan` refuses ops on unknown beats and any op that changes `movement` or `kind` (the spine stays the creator's).
- `useTrailerVersions` reuses the one-per-project serialised `recalibrate` job kind (`lib/jobs.tsx:18-21`). The candidate cut is `replay(cut, plan.ops)`.
- The surface shows current vs candidate structure reports side by side as `Tally` deltas (violations closed, violations opened, enforced%), with Accept and Discard. A candidate that opens a new violation says so beside Accept, and the gate never blocks (`structure.ts:20-35`: "never the gate").

**Why it is a moonshot / what it unlocks.**
- Today the checker can only list findings; after this card it fixes them. The trailer path gets the same reviewed-iteration loop the explainer already has, so the two Script halves stop being different products.
- A creator with no craft vocabulary can take suggested notes and one model turn, and watch AND THEN go to BUT/THEREFORE and unpaid promises gain payers, with the report proving it.
- It sets up the shared notes/version kernel both forms will use.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `notesFromFindings(report)` over a cut with one `AND THEN` gives one suggested `fix-connector` note on that beat id, and a clean report gives none.
2. `parseTrailerPlan` refuses an op whose `beatId` is not in the cut, and refuses a patch that changes `kind` or `movement`, with the findings listed.
3. A recorded plan that sets the offending connector to `BUT`: the candidate report has `violations` one lower on the `connector` rule, and the delta shows "1 closed, 0 opened".
4. A recorded plan that opens a new violation (a rung raising three variables): the delta shows "1 opened", and Accept still works and records the override in the version's receipt.
5. A second recalibrate while one is running for the project is refused by the jobs serialisation (cross-tab rule unchanged).
6. Discard leaves the saved cut byte-identical. Accept persists the new cut, and with trailer-script-A, the ops land in the log and are undoable.

**Write set.** New `script/trailer/notes.ts`, new `script/trailer/useTrailerVersions.ts`, new `script/trailer/CandidateDelta.tsx`, `script/trailer/TrailerScript.tsx`, `script/trailer/StructurePanel.tsx`, `script/_notes/PresetSelect.tsx`, `script/_notes/NotesContext.tsx`, `app/api/recalibrate/route.ts`, `pipeline/RECALIBRATE-PROMPT.md`, new `script/trailer/plan.ts` (schema and parse), `_shared/stepStore.ts`, new `tests/golden-path/trailer-recalibrate.probe.spec.ts`.

**Risks & rollback.**
- A model rewriting trailer beat text can conflict with the withholding budget by spending a held asset. `parseTrailerPlan` must refuse `spends` additions on `hold` assets, and `checkWithholding` re-runs on the candidate.
- The explainer's notes UI copy must not leak into the trailer (the narration law).
- Rollback: the route ignores `form: "trailer"` (400), and the trailer surface hides the notes rail.

**First session dispatch.**
1. Read `script/trailer/structure.ts:84-112,367-430,1193-1296`, `script/trailer/cut.ts`, `app/api/recalibrate/route.ts`, `script/editPlan.ts` and `script/_notes/NotesContext.tsx`.
2. Build `notes.ts` (`notesFromFindings`) and `plan.ts` (schema plus `parseTrailerPlan`), with acceptance cases 1-3 written first over recorded plans. Leave the route and UI for session 2.
3. Gate: `npm run typecheck`, `npm run check:trailer-structure`, and `npm test`.

_Runner-up:_ A promise-ledger stranger pass: a separate model turn that watches the cut "from ignorance" (only beat text, no structure) and extracts the promises it hears. Diffing that against the declared promises would fill the `unmeasured` extraction step that `structure.ts:42-47` names.

_Checked:_ Read in full: `trailer/cut.ts:1-150`, `trailer/useTrailerCut.ts`. Read in part: `trailer/structure.ts:1-200, 367-434, 1193-1296`, `trailer/types.ts:300-445`, `trailer/TrailerScript.tsx:1-120` (plus recompose grep), `_shared/stepStore.ts:140-165`, `frames/shots.ts:630-664`, `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts` (header). Hypotheses traced: notes are wired into the trailer (refuted: zero imports); `magnitudeOf` is supplied in product (refuted: only the regression and probe pass it); recompose preserves edits (refuted at `useTrailerCut.ts:125-135`). Rung/lane hard-coding (`cut.ts:61-62`) belongs to C-002 and is not re-proposed.
