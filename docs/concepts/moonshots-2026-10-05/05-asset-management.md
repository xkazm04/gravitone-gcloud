# Moonshot cards · Asset Management

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

Scout: read-only, 2026-10-05. Every figure below was measured on this tree on that date, and its n is given beside it.

---

## foundry-curation

### foundry-curation-A · One gate kernel: Cull, Extract and Dojo sit on the Board's source adapters

**Context:** foundry-curation · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 7/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/client-state#async-race-guards, #optimistic-write-path; media-generation/review-iteration-loops#gate-record-outlives-the-media

**Summary.** The three /foundry tabs each carry their own copy of the same verdict state machine. A second UI, /board, already writes the same verdict files through adapters that read fresh and support undo. The move is to put all of them on one `useGate` kernel built over those adapters. Then the /foundry tabs keep only what is specific to them: the matrix, the extraction bench and the A/B pair.

**Premise (verified).**
- `app/foundry/FoundryView.tsx:143-170,253-271`, `app/foundry/ExtractView.tsx:89-113,271-278` and `app/foundry/DojoView.tsx:76-93,156-163` hold three copies of `verdictsRef` + `adoptVerdicts` + `detailTicket` + a 400 ms `saveTimer` debounce. ExtractView's comment says outright that it copies the Cull ("Same discipline as the Cull tab", `ExtractView.tsx:16-19`).
- The local save writes the whole map from memory: `saveVerdicts(runId, next)` where `next = { ...verdictsRef.current }` (`FoundryView.tsx:258,268`). The live poll keeps the local map and never takes the server's copy (`loadDetail(selected, true)`, `FoundryView.tsx:240-247`).
- `/board` already has adapters for all three (`lib/board/registry.ts:28-30`). Each decide reads fresh, changes one key and writes, because "the /foundry tab may have autosaved since" (`lib/board/sources/cull.ts:3-7,119-126`).
- The Board has a bounded undo stack that replays multi-item changes (`lib/board/undo.ts:1-14`). /foundry has no undo; `U` only clears (`FoundryView.tsx:104`).
- No foundry surface flushes a pending debounced save when the page closes. `pagehide`, `beforeunload`, `sendBeacon` and `keepalive` appear nowhere in `app/foundry`. So the last verdict typed in the 400 ms before closing the tab is lost.

**The move.** New `app/foundry/gate/useGate.ts`, a hook over a `GateAdapter<TDetail, TKey, TVerdict>`. The adapter is a superset of `BoardSourceExt` (`lib/board/source.ts`) that adds `loadDetail(id)`, `previewCommit` and `commit`. The kernel owns everything that is copied three times today:
- ticketed latest-wins detail loads;
- optimistic verdicts applied from a ref;
- a write queue that merges keys over a 400 ms window, then sends one read-fresh → merge → write, so it never writes a stale whole map;
- `lib/board/undo.ts` as the undo stack (Z);
- a `pagehide` flush through `fetch(..., { keepalive: true })`;
- the commit-plan dialog state (today's `useCommitPlan`, `app/foundry/ui.tsx:595`).

The adapters move to `app/foundry/gate/{cull,extract,dojo}.ts` and wrap the existing `lib/board/sources/*` decide logic, so /board and /foundry share one writer per source. FoundryView, ExtractView and DojoView each lose roughly 120 lines of state and keep only rendering and keys. Card foundry-engine-B adds a revisioned PATCH; when it lands, the adapter's write becomes that PATCH and the kernel does not change.

**Why it is a moonshot / what it unlocks.** A Board decision can no longer be erased by an open /foundry tab. Undo works in every foundry gate. Any future gate (motion takes, score takes) is one adapter, not a fourth 700-line view. The curator notices that Z works and that a closed tab keeps its last keystroke.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. /foundry loaded with run R. The Board keeps candidate c2. /foundry then keeps c1. Expected: `verdicts.json` holds both c1 and c2.
2. Keep c1, keep c2 within 400 ms. Expected: exactly one PUT, carrying both.
3. Keep c1, then Z. Expected: c1 is back to undecided and the server map matches.
4. Keep c1, then fire `pagehide` within 100 ms. Expected: a keepalive write carrying c1 was issued.
5. Load run A, switch to B before A's fetch resolves. Expected: B never receives A's verdicts (the existing ticket rule, now tested once in the kernel).
6. A committed run. Expected: the kernel exposes `readOnly` and refuses decide without any network call.

**Write set.** new: `app/foundry/gate/useGate.ts`, `app/foundry/gate/{cull,extract,dojo}.ts`, `tests/golden-path/foundry-gate-kernel.probe.spec.ts`; edit: `app/foundry/FoundryView.tsx`, `app/foundry/ExtractView.tsx`, `app/foundry/DojoView.tsx`, `app/foundry/ui.tsx`, `lib/board/sources/{cull,extract,dojo}.ts`, `lib/board/source.ts`.

**Risks & rollback.** A read before every write costs one extra GET per batch. The merge window keeps that to about 2.5 calls a second at most on a fast cull. The keyboard paths in the three views must be preserved; they are pinned by `tests/golden-path/resize-keyboard.probe.spec.ts` and the Enter rule (`CullGrid.tsx:40-62`). Rollback is per view: each tab can return to its local state machine independently, because the adapters stay additive.

**First session dispatch.**
Read `app/foundry/FoundryView.tsx:140-275`, `lib/board/source.ts`, `lib/board/sources/cull.ts` and `lib/board/undo.ts`.
Write acceptance cases 1-4 as `tests/golden-path/foundry-gate-kernel.probe.spec.ts` against the kernel with a fake adapter. They must fail first.
Build `useGate` plus the cull adapter, port the Cull tab only, and leave Extract and Dojo for session two.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/foundry-gate-kernel.probe.spec.ts tests/golden-path/board.probe.spec.ts`.

_Runner-up:_ the /foundry Cull as a Board "view": the matrix layout becomes a Board layout, and /foundry keeps only Extract and the plant header.

### foundry-curation-B · Cull by exception: the grader is calibrated against you while you cull

**Context:** foundry-curation · **Slot:** B experience
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 6/10 · **Gate:** direction
**Registry:** media-generation/generated-output-grading#two-grader-disagreement-rule; software-engineering/judgment-guardbands#score-guardband; software-engineering/eval-harness#monitor-inside-the-loop

**Summary.** Today the human decides every plate. Anything left undecided at commit is rejected blind. The question "does the grade predict the human?" is first answered after the cull, in the findings file. Turn that around: fit a model of this curator's verdicts while they cull, show how often it agrees with them, and once agreement clears a declared bar, let it pre-decide the rest. Pre-decided plates carry a "decided by model" stamp, can be undone, and never count as human evidence.

**Premise (verified).**
- Commit rejects every undecided plate wholesale by default: `undecidedAs = "reject"` (`app/api/foundry/runs/[id]/commit/route.ts:18`, `lib/foundry/store.ts:229-231`).
- Grade-versus-human appears only after the commit, as two means in `findings.md` (`lib/foundry/store.ts:165-176`).
- Measured on `pipeline/foundry/ledger.json` (87 rows, 2 runs, 2026-10-05): kept n=24 average craft 0.638 and style 0.427; rejected n=63 average craft 0.778 and style 0.345. Craft runs *backwards* against the human, and style separates them only weakly. Nothing in the cull shows the curator this while they are working.
- Each candidate has one grader (`lib/foundry/types.ts:23-33`, `grader: string`). The registry's rule is to treat disagreement between two graders as "needs a human".
- The Board deliberately hides the machine's pick until the human has decided (`lib/board/sources/cull.ts:12-13`, `app/board/ContactSheet.tsx:377-388`). Blind-first is already the house discipline, so calibration fits it.
- `VerdictRecord` has no field for who decided (`lib/foundry/types.ts:159-163`). Styles are promoted to `proven` from any keep (`lib/foundry/store.ts:269-270`).

**The move.**
- New `lib/foundry/calibrate.ts`, pure. From (this run's human verdicts + historical ledger rows) it fits a small, explainable predictor on craft, style, the text veto, the style row and the mechanism column. Logistic regression or banded rules are enough, with no service. It returns a keep-probability per candidate and a leave-one-out agreement figure with n.
- `VerdictRecord` gains `by?: "human" | "model"` (absent means human, so old files still read).
- The CullGrid gets an agreement figure on the run bar (a `<Tally>`: "agrees 41/46"), an order that walks the candidates the model is least sure of first, and a "decide the rest" action. The action appears only above a declared threshold (agreement ≥ 0.9 at n ≥ 30, one constant). It writes `by: "model"` verdicts that render as a ghost stamp, and one Z undoes the whole batch.
- The commit plan reports human and model decisions separately. Ledger rows carry `by`. `proven` promotion counts human keeps only.
- `undecidedAs: "reject"` stays available but stops being the silent default once a model is fitted.

**Why it is a moonshot / what it unlocks.** A cull of hundreds becomes a cull of the uncertain few dozen. The grader's blind spots (craft scoring backwards) show up while the run is live, not in a findings draft. The ledger becomes a dataset the grader is held to. The Dojo already gates prompt changes, so a grader change can be gated the same way.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A fixture run where the human kept every style ≥ 0.6 and rejected the rest, with n=40 decided. Expected: agreement ≥ 0.95 and "decide the rest" enabled.
2. Same fixture with n=10 decided. Expected: the action is disabled. The reason (n below the floor) is available to the accessibility channel only, never rendered as prose.
3. Model-decided keeps on two scenes of style S. Expected: S is *not* promoted to `proven`.
4. "Decide the rest" then Z. Expected: every `by: "model"` verdict from that batch is cleared, and human verdicts are untouched.
5. Ledger fixture with the measured inversion (rejected craft > kept craft). Expected: `calibrate` gives craft a negative weight and the run-bar figure reflects it.
6. Commit plan on a mixed run. Expected: `counts` splits human and model and the ledger rows carry `by`.

**Write set.** new: `lib/foundry/calibrate.ts`, `tests/golden-path/foundry-calibrate.probe.spec.ts`; edit: `lib/foundry/types.ts`, `lib/foundry/store.ts`, `lib/foundry/commitPlan.ts`, `app/foundry/FoundryView.tsx`, `app/foundry/CullGrid.tsx`, `app/foundry/RunCards.tsx`, `app/foundry/ui.tsx`, `lib/board/sources/cull.ts`.

**Risks & rollback.** A model that is confidently wrong deletes good plates, because commit unlinks rejects (`store.ts:276-287`). Mitigations: the threshold plus leave-one-out, model rejects shown as a separate count in the commit dialog, and a per-run off switch. The `by` field is additive. Rollback is to hide the action; the field stays harmless.

**First session dispatch.**
Read `lib/foundry/store.ts:134-193`, `lib/foundry/commitPlan.ts:36-137` and `pipeline/foundry/ledger.json`.
Write `lib/foundry/calibrate.ts` pure, with acceptance cases 1, 2 and 5 failing first in `tests/golden-path/foundry-calibrate.probe.spec.ts`.
Then add `by` to `VerdictRecord`, the proven-from-human-only rule, and case 3.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/foundry-calibrate.probe.spec.ts tests/golden-path/foundry-commit-indices.probe.spec.ts`. UI comes in session two.

_Runner-up:_ a second grader per candidate, with disagreement shown as a third tile state ("needs you") and treated as a first-class verdict, per two-grader-disagreement-rule.

_Checked:_ read in full: FoundryView.tsx 1-300, CullGrid.tsx 1-80 (+ grep of grade use), StylesShelf.tsx 1-80, extractClient.ts, the ExtractView drive loop 1-30 and 175-215, lib/board/sources/cull.ts, lib/board/verdicts.ts 25-80, lib/board/undo.ts header, lib/board/registry.ts. Grepped the three views for duplicated ticket/save machinery and found 3 copies. Computed grade-vs-verdict on ledger.json (n=87). Hypothesis "there is no unified gate" was false (/board exists), so the card was re-aimed at sharing it.

---

## foundry-engine

### foundry-engine-A · The catalogue gets one write path: journaled, revisioned, honoured by Python and the Dojo loop

**Context:** foundry-engine · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/concurrency-guards#cross-process-exclusion, #fence-inside-write-transaction, #idempotency-by-design

**Summary.** Five writers update `pipeline/foundry/styles.json` and its two sibling ledgers by read-modify-write, with no exclusion between them:
- the forge commit
- the extract commit
- the Dojo commit
- `acquire.py`
- `intake.py`

Two commits that overlap lose one of their writes without any error. This card **adopts the landed commit-plan token (a81ec83) and goes materially beyond it**. That token is a sha256 compared before the writes begin; nothing holds the files between the check and the write. The move is a `withCatalogue(tx)` kernel: one lock file that TypeScript and Python both honour, a catalogue revision, and an append-only journal of operations.

**Premise (verified).**
- The forge commit reads and rewrites `ledger.json` and `styles.json` with no lock (`lib/foundry/store.ts:241-257,259-272`). Its token is checked at `store.ts:219-221` and the writes follow later, so there is a time-of-check/time-of-use (TOCTOU) window.
- The extract commit does the same read-modify-write on `styles.json` (`lib/foundry/extract/store.ts:352,402`). The Dojo commit does it on `training-ledger.json` (`lib/foundry/training/store.ts:214-234`).
- The Python writer replaces the same file atomically but takes no lock (`pipeline/foundry/acquire.py:46-78`). `forge.py` reads it at the start of every run (`pipeline/foundry/forge.py:62`).
- The shared kernel provides atomic rename only, with no exclusion (`lib/foundry/runStore.ts:75-92,95`).
- The repo has already solved this twice: `withStore` uses an in-process queue plus an exclusive-create `.lock` file with a staleness bound (`lib/publish/store.ts:127-176`), and `lib/sound/store.ts:231,254` repeats it. The foundry, which has the most writers, is the one store without it.
- `training-ledger.json` is the sync channel between machines: the GPU loop stamps `reflected` (`pipeline/foundry/training-ledger.json:2`). It is a cross-process writer by design.

**The move.**
1. Extract `lib/diskTx.ts` from the two existing copies: `acquireLock(root)`, `withLockedFiles(root, files, fn)` and the tx object.
2. Re-point `lib/publish/store.ts` and `lib/sound/store.ts` at it, so the third copy never gets written.
3. New `lib/foundry/catalogue.ts`: `withCatalogue(fn: (tx) => …)` locks `pipeline/foundry/.catalogue.lock` and loads styles, ledger and training-ledger lazily. On commit it bumps `styles.json` `_rev` and appends one line per operation to `pipeline/foundry/catalogue-journal.jsonl` as `{rev, at, op, run, ids, by}`.
4. `commitRun`, `commitExtractRun` and `commitCycle` compute their plan *inside* the transaction, so the token check and the write sit behind the same fence.
5. New `pipeline/foundry/catalogue_lock.py`: the same exclusive-create protocol, used by `acquire.save_catalogue` and `intake --acquire`.
6. GET `/api/foundry/styles` returns `_rev`, so a client can tell the catalogue moved.

**Why it is a moonshot / what it unlocks.** The catalogue becomes something other systems can safely depend on. That matters for card library-view-B, which reads it, and for the Dojo loop stamping rows from another machine. The journal is an audit trail that survives the media being deleted. "What changed between rev 41 and 42" becomes a one-line read. Any future writer (a Library ratify, an agent CLI) gets a single place to write through.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Two `commitExtractRun` calls on different runs, started together. Expected: both runs' styles are in `styles.json` (today one is lost).
2. Forge commit and extract commit started together. Expected: styles from both are present and the ledger has the forge rows.
3. A `.catalogue.lock` older than the staleness bound. Expected: it is broken and the commit proceeds. A fresh lock past the wait bound gives a 503 that names the lock file.
4. Every commit appends exactly one journal line, and `_rev` increases by 1.
5. A Python `save_catalogue` holding the lock. Expected: a TS commit waits and then lands on the Python result.
6. `lib/publish/store.ts` and `lib/sound/store.ts` probes still pass on the shared `lib/diskTx.ts`.

**Write set.** new: `lib/diskTx.ts`, `lib/foundry/catalogue.ts`, `pipeline/foundry/catalogue_lock.py`, `tests/golden-path/foundry-catalogue-tx.probe.spec.ts`; edit: `lib/foundry/store.ts`, `lib/foundry/extract/store.ts`, `lib/foundry/training/store.ts`, `lib/publish/store.ts`, `lib/sound/store.ts`, `pipeline/foundry/acquire.py`, `pipeline/foundry/intake.py`, `app/api/foundry/styles/route.ts`, `.gitignore`.

**Risks & rollback.** A lock left by a crashed holder blocks commits until it goes stale (30 s in the publish precedent). The 503 names the file. Python and TS must agree on the bytes of the lock protocol, so the Python selftest (`pipeline/foundry/selftest.py`) covers it. The journal grows without bound, but at one line per commit that is negligible. Rollback: `withCatalogue` can be bypassed per call site; the journal and `_rev` are additive.

**First session dispatch.**
Read `lib/publish/store.ts:120-200`, `lib/sound/store.ts:220-280`, `lib/foundry/store.ts:205-299` and `tests/golden-path/foundry-commit-indices.probe.spec.ts`.
Write acceptance cases 1 and 2 as a failing probe that races two commits through `Promise.all`.
Extract `lib/diskTx.ts` without changing behaviour (publish and sound probes stay green), then build `withCatalogue` and move the three commits inside it.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/foundry-catalogue-tx.probe.spec.ts tests/golden-path/sound-store.probe.spec.ts tests/golden-path/foundry-commit-indices.probe.spec.ts`, then `python pipeline/foundry/selftest.py`.

_Runner-up:_ write commits as an intent file so a crash between steps resumes cleanly. A `commit.intent.json` holds the plan and a recovery pass runs on the next read, so a crash between the index write and the unlink resumes rather than relying on retry being idempotent.

### foundry-engine-B · Verdicts become keyed, revisioned patches with an append-only gate log

**Context:** foundry-engine · **Slot:** B-architecture (no UI surface)
**Size:** M · **Effort:** 5/10 · **Impact:** 7/10 · **Risk:** 4/10 · **Gate:** contract
**Registry:** software-engineering/sync-replication#conflict-detection-and-policy; media-generation/review-iteration-loops#gate-record-outlives-the-media

**Summary.** All three verdict routes replace the whole map, last writer wins. Two surfaces (/foundry and /board) plus the CLI write them. The move: `PATCH` one key at a time against a revision, a 409 when the revision is stale, and every human decision appended to `verdicts.log.jsonl`. That log, with who/where/when, survives the commit that deletes the media.

**Premise (verified).**
- Replacing the whole map is a stated choice ("Whole-map on purpose", `app/api/foundry/runs/[id]/verdicts/route.ts:1-5`). The store writes whatever it is handed (`lib/foundry/store.ts:121-132`, `lib/foundry/extract/store.ts:298-309`, `lib/foundry/training/store.ts:125-137`).
- The Board's writer works around this from the client side (`lib/board/sources/cull.ts:3-7,119-126`). /foundry writes a stale whole map (`app/foundry/FoundryView.tsx:258-268`). The race is real in today's code, not hypothetical.
- Reject reasons travel inside the free-text `note` as an encoded `reasons:` line (`lib/board/verdicts.ts:62-90`). The extract store drops `note` entirely (`lib/foundry/extract/store.ts:306`), so a Board reject reason on an extract style is lost when stored.
- A verdict records only `{verdict, at, note}`. Who decided, and from which surface, is not recorded (`lib/foundry/types.ts:159-163`). The Dojo stores a bare string (`lib/foundry/training/types.ts:72`).
- A commit deletes the media (`lib/foundry/store.ts:276-287`; training commit `lib/foundry/training/store.ts:236-253`). What remains is the ledger's aggregate row, not the sequence of decisions.

**The move.**
- One shared `lib/foundry/verdictLog.ts` for all three stores: `patchVerdicts(root, id, { set, clear, baseRev, by, surface })`.
- The patch runs under the run directory's lock (using `lib/diskTx.ts` if A has landed, otherwise a per-run lock file). It refuses with 409 when `baseRev` is not the current one, appends one JSONL line per key changed, and rewrites `verdicts.json` with `_rev` (old files read as rev 0).
- The routes gain `PATCH`. `PUT` stays for one release as a deprecated whole-map write that also logs.
- GET returns `rev`. `reasons: string[]` becomes a first-class field (decoding the note stays as the read fallback).
- The client side (`saveVerdicts`, the Board adapters) switches to PATCH. foundry-curation-A's kernel is the single caller.

**Why it is a moonshot / what it unlocks.** Concurrent gates become safe. A reviewer's history ("rejected, then kept 2 minutes later from the Board") becomes data a calibrator can learn from (foundry-curation-B). The CLI and agents can decide without loading the map. The record outlives the media, as review-iteration-loops asks.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. PATCH `{set:{c1:keep}, baseRev:0}`, then PATCH `{set:{c2:reject}, baseRev:0}`. Expected: the second returns 409 with the current rev and the log holds 1 line.
2. Two PATCHes with the correct revs in sequence. Expected: both keys are in the map and the log has 2 lines with `by` and `surface`.
3. An extract PATCH with `reasons:["style"]`. Expected: reasons are kept in the map and in the log.
4. PATCH on a committed run. Expected: 409, matching today's PUT.
5. A legacy `verdicts.json` without `_rev`. Expected: it reads as rev 0, and the first PATCH writes rev 1.
6. A Dojo PATCH clearing a key with `null`. Expected: the key is cleared and logged as `clear`.

**Write set.** new: `lib/foundry/verdictLog.ts`, `tests/golden-path/foundry-verdict-patch.probe.spec.ts`; edit: `lib/foundry/store.ts`, `lib/foundry/extract/store.ts`, `lib/foundry/training/store.ts`, `lib/foundry/types.ts`, `lib/foundry/extract/types.ts`, `lib/foundry/training/types.ts`, `app/api/foundry/runs/[id]/verdicts/route.ts`, `app/api/foundry/extract/[id]/verdicts/route.ts`, `app/api/foundry/training/[id]/verdicts/route.ts`, `app/foundry/foundryClient.ts`, `lib/board/sources/{cull,extract,dojo}.ts`.

**Risks & rollback.** A 409 storm on a fast cull if the client does not rebase. The kernel (curation-A) retries once with a fresh rev, because the merge is per key. The deprecated PUT path keeps old clients working. `tests/golden-path/foundry-routes.probe.spec.ts` must be extended, not loosened.

**First session dispatch.**
Read the three `putVerdicts` functions, `app/api/foundry/runs/[id]/verdicts/route.ts` and `tests/golden-path/foundry-routes.probe.spec.ts`.
Write acceptance cases 1, 2 and 5 failing against `lib/foundry/verdictLog.ts` on a temp directory (FOUNDRY_DIR or OUT_ROOT override, as `foundry-store-disk.probe.spec.ts` does).
Wire the forge route first; extract and dojo follow.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/foundry-verdict-patch.probe.spec.ts tests/golden-path/foundry-routes.probe.spec.ts tests/golden-path/board.probe.spec.ts`.

_Runner-up:_ record spend on extract runs. `liveIO` throws away `provenance.costUsd` on every recognize, generate and reason (`lib/foundry/extract/store.ts:210-221`) and `ExtractManifest` has no cost field. Add a spend total and a per-run ceiling, so the cull can show cost per kept style (generative-provider-routing#cost-per-usable-economics).

_Checked:_ read in full: lib/foundry/{types,runStore,store,commitPlan}.ts, extract/store.ts, training/{store,types}.ts, the runs verdicts route and the styles route; the engine.ts header 1-80; acquire.py:40-90; publish/store.ts:120-210. Grepped every writer of styles.json across TS and Python (5). Confirmed the two banned items (runStore kernel, commit plan) are landed (86320ef, a81ec83), and that the landed token is sha256 checked outside any lock.

---

## library-assets-audio

### library-assets-audio-A · One sound vocabulary: the Terms spine and "the team's hand" move into lib/sound

**Context:** library-assets-audio · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 7/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** media-generation/music-prompt-composition#sonic-style-vocabulary; software-engineering/client-state#persistence-and-migration

**Summary.** Round 4 moved the takes to the server. The two things that make the Library's audio module a *recipe book* stayed in the browser:
- **The vocabulary.** The Library recomputes term statistics a different way from the server's strengths map.
- **The hand.** The team's prefer/avoid stance and preferred phrasing per term sits in one browser's localStorage.

The move is to put both into the sound store, so the Library, the Sound lab, hunts and the agent CLI all compose from one grammar.

**Premise (verified).**
- `lib/sound/insights.ts:1-6` says the route, the CLI and the knowledge generator all call one function "so Triage's heat table and knowledge/audio/PATTERNS.md cannot count the same verdicts two ways".
- The Library counts them a second way anyway: `vocabulary()` and `sortTerms()` with Laplace smoothing over Asset rows (`app/library/audio/book.ts:321-370`), per take rather than per provider × facet.
- The team's hand (stance and phrasing per term) plus every draft sent out is stored under `localStorage` key `gravitone.audio-book.${uid}` (`app/library/audio/bookStore.ts:1-15,26,48`). It is per browser, although its own header calls it "the team's".
- `compose()` turns the hand into the vendor prompt (`book.ts:400-440`). The server's `hunt.ts` composes from ledger lessons (`lib/sound/hunt.ts:97-120`) and never sees the hand. An agent on `pipeline/sound.mts` cannot honour an "avoid" the team set in the Library.
- Precedent: `app/library/audio/soundMigration.ts:1-30` is a one-time, idempotent move from IndexedDB to the server that preserves ids. The same pattern applies to the book.

**The move.**
- Add `hands` to the sound ledger (`pipeline/sound/ledger.json` gets `{ verdicts, lessons, hands }`, written through `withStore` in `lib/sound/store.ts`), with a route at `app/api/sound/hands/route.ts` (GET, PATCH per term).
- Drafts move onto the store as a first-class `drafts.json` kind, so a returned file can attach from any machine.
- New `lib/sound/vocabulary.ts`, the one derivation: it consumes `computeInsights` cells and lays the hand over them. It is exposed through `/api/sound/insights` and read by `Terms.tsx`/`VocabSpine.tsx`, replacing `book.ts#vocabulary`.
- `compose()` moves to `lib/sound/compose.ts` (pure) so `generate.ts`, `hunt.ts` and the CLI apply the same phrase and avoid rules.
- `bookStore.ts` becomes a one-time migration shim modelled on `soundMigration.ts`: an id-idempotent push, then a per-account mark.

**Why it is a moonshot / what it unlocks.** Taste becomes shared. A term the team marks "avoid" stops showing up in agent-generated takes. `knowledge/audio/PATTERNS.md` can quote the team's stance beside the evidence. A second machine opens the same book. The Library and Triage stop disagreeing about whether "rhodes" works.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The same ledger fixture through `lib/sound/vocabulary.ts` and through Triage's cells. Expected: identical n, kept and keepRate per term.
2. PATCH hand `{genre:lo-fi → avoid}`, then `compose()` on the server for a seed containing lo-fi. Expected: the term is excluded and appears in the negative/"Exclude".
3. A browser with a localStorage book and no mark. Expected: after load, the server holds its hands and drafts, the mark is set, and a second load pushes nothing.
4. Two accounts on one machine. Expected: each account's book migrates to its own entries, and `identityEviction` still clears the local key.
5. A draft created in browser A, file returned in browser B. Expected: B attaches it to the draft and the take records `draft_id`.

**Write set.** new: `lib/sound/vocabulary.ts`, `lib/sound/compose.ts`, `app/api/sound/hands/route.ts`, `app/library/audio/bookMigration.ts`, `tests/golden-path/sound-vocabulary.probe.spec.ts`; edit: `lib/sound/store.ts`, `lib/sound/types.ts`, `lib/sound/ledger.ts`, `lib/sound/hunt.ts`, `lib/sound/client.ts`, `app/library/audio/book.ts`, `app/library/audio/bookStore.ts`, `app/library/audio/Terms.tsx`, `app/library/audio/AudioWorkbench.tsx`.

**Risks & rollback.** The ledger is git-tracked, so hands become visible in diffs. That is the point (the team's taste is versioned), but it needs a note in the ledger's `_purpose`. The Laplace sort is a reading rule, not a counting rule, so it moves to the reader and stays. Rollback: the localStorage book is not deleted by the migration (same rule as soundMigration), so reverting the reader restores it.

**First session dispatch.**
Read `lib/sound/insights.ts`, `app/library/audio/book.ts:255-450`, `app/library/audio/bookStore.ts` and `app/library/audio/soundMigration.ts`.
Write acceptance case 1 failing, then build `lib/sound/vocabulary.ts` and point `Terms.tsx` at it.
Hands and drafts on the store come in session two.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/sound-vocabulary.probe.spec.ts tests/golden-path/library-audio.probe.spec.ts tests/golden-path/sound-triage.probe.spec.ts`.

_Runner-up:_ the image shelf gets a trash with undo. `useShelf` bulk delete and move are final and nothing in `app/library/assets` implements undo (grep 2026-10-05), per undo-history#checkpoint-restore.

### library-assets-audio-B · Compose renders in place: an ElevenLabs draft becomes a take without a round trip

**Context:** library-assets-audio · **Slot:** B experience
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** media-generation/music-prompt-composition#section-plan-as-the-brief; media-generation/generative-provider-routing#cost-per-usable-economics

**Summary.** Today the Library composer copies text to the clipboard. The user pastes it into a vendor site, downloads the file, comes back and attaches it to the draft: five steps across two sites. The studio server already renders ElevenLabs takes through the metered chokepoint. A draft aimed at ElevenLabs should be one key that renders and files the take as unjudged, with its draft, parent and seed attached. Suno stays copy-paste, because there is no Suno API here.

**Premise (verified).**
- `copyDraft` does `compose()` → `newDraft` → `copyText`, then a toast "copied … awaiting return" (`app/library/audio/AudioWorkbench.tsx:316-336`). `attach()` takes the returned file (`AudioWorkbench.tsx:338-345`). That is the round trip.
- `lib/sound/generate.ts:1-26` already renders ElevenLabs compose, plan, section-edit and sfx through `lib/music/elevenlabs.ts`'s spend ceiling, and files the bytes as a take.
- `GenerateRequest` takes `terms`, `tempoBpm`, `key` and `negative` (`lib/sound/types.ts:182-206`). The Library's `Seed` is `{genres, moods, instruments, bpm, key, avoid}` (`book.ts:367-383`), so it maps 1:1.
- `origin` only allows `agent | lab | hunt` (`lib/sound/generate.ts:37,60-61`; `types.ts:197`). The Library is the one surface that composes but cannot render.
- The variations engine already proposes one-axis variants per take (`book.ts:446-460`), but each one has to be copied out and back by hand. Batch auditions are the measured practice for this step (memory: audio practices for Step 4+).

**The move.**
- `origin` gains `"library"`. A new `lib/sound/fromSeed.ts` (pure) maps `Seed` + target + hands to `GenerateRequest`, sharing `compose` with A if that has landed.
- In the Inspector composer and on each Variations row, the ElevenLabs target gets "render" beside "copy". It calls `/api/sound/generate` (pricing via `/api/imaging/pricing`'s sibling for music, if declared, otherwise "price not declared"; never $0).
- The result lands in the ledger as an unjudged take with `draft_id` and `parent_id` set, flashed and selected.
- "Render all variations" sends N one-axis renders as a batch with an N× pre-click quote. The ledger groups them by parent, so a verdict says which axis mattered.

**Why it is a moonshot / what it unlocks.** The recipe book becomes a working instrument instead of a notebook. Variation → render → judge becomes a loop that takes minutes, and the one-axis design finally gets data at the rate it needs. Cost per kept take becomes measurable on the Library, not only in the lab.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `fromSeed({genres:["lo-fi"], moods:["warm"], instruments:["rhodes"], bpm:84, key:"A minor", avoid:["vocals"]}, "elevenlabs")`. Expected: a valid `GenerateRequest` with `negative` containing "vocals" and `origin:"library"`.
2. Render from a take's variation. Expected: the new take has `parent_id` = that take and `draft_id` = the recorded draft.
3. A spend ceiling refusal from `lib/music`. Expected: the vendor's sentence is shown and no take is created.
4. Suno target. Expected: no render control and copy works as before.
5. "Render all" with 4 variations. Expected: one quote showing 4×, 4 takes grouped under the parent, each unjudged.

**Write set.** new: `lib/sound/fromSeed.ts`, `tests/golden-path/library-render-in-place.probe.spec.ts`; edit: `lib/sound/generate.ts`, `lib/sound/types.ts`, `lib/sound/client.ts`, `app/library/audio/AudioWorkbench.tsx`, `app/library/audio/Inspector.tsx`, `app/library/audio/useAudioShelf.ts`, `app/library/audio/book.ts`.

**Risks & rollback.** This is a money route reachable from a keyboard surface, so the render key must not be the same key as copy. The quote is required, and a batch is confirmed once. The chokepoint's ceiling is the backstop. Rollback: remove "library" from `ORIGINS`; copy-paste is untouched.

**First session dispatch.**
Read `lib/sound/generate.ts:1-120`, `lib/sound/types.ts:150-206` and `app/library/audio/AudioWorkbench.tsx:300-350`.
Write acceptance case 1 failing against `lib/sound/fromSeed.ts`, then add `origin:"library"` and case 2 through `lib/sound/client.ts` with the store pointed at a temp `SOUND_STORE_DIR`.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/library-render-in-place.probe.spec.ts tests/golden-path/sound-store.probe.spec.ts tests/golden-path/library-audio.probe.spec.ts`.

_Runner-up:_ reference-anchored composing. `References.tsx` already measures tempo and key from an uploaded reference (`book.ts:705-750 conceptFor/nearestTerms`). Render a take from that reference's concept in one press.

_Checked:_ read: AudioWorkbench.tsx 1-120 and 300-345, useAudioShelf.ts 1-70, bookStore.ts 1-50, book.ts 255-450 (+ export list), soundMigration.ts header, lib/sound/{store header,generate header,insights header,knowledge header}, the GenerateRequest type, useShelf.ts 1-60. Grepped keep-rate derivations (3: book.ts, playground/triage/model.ts, lib/sound/insights.ts) and undo in app/library (none).

---

## library-styles-atelier

### library-styles-atelier-A · Proofs carry their lineage, and the lock gate reads coverage, not a count

**Context:** library-styles-atelier · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 6/10 · **Gate:** contract
**Registry:** media-generation/visual-style-locking#approved-reference-sheet, #draft-proofing-locked-ratchet, #consistency-control-arm

**Summary.** A style locks once it has one approved proof and nothing pending. A proof does not record which trial it answered or which version of the block produced it. As a result:
- a style can be ratified on one picture of one problem;
- approvals rendered under a block the user has since rewritten keep counting;
- those approvals keep being sent as references.

The move is to make lineage part of the `Proof` contract (`trialId`, `blockDigest`) and derive a coverage matrix from it, so the lock gate, the references window and the sheet all read the same derivation.

**Premise (verified).**
- `canLock` is `approvedProofs(t).length > 0 && every proof decided` (`lib/themes.ts:236-239`).
- `Proof` carries model, provider, cost and time but no `trialId` or block fingerprint (`lib/themes.ts:51-66`). The atelier labels a proof by cutting the subject string (`app/library/LibraryAtelier.tsx:135-142`).
- The ratchet freezes `block` only *after* lock (`lib/themes.ts:287-297`). Before lock, editing the block leaves every earlier approval standing. The registry's rule is that editing in place voids approvals (draft-proofing-locked-ratchet, "editing it in place voids every approval on its sheet").
- `styleRefs` sends the earliest and newest approved proofs whatever block produced them (`lib/themes.ts:202-212`), so approvals from an older block condition new renders.
- The trial set was designed so that "NO STYLE CAN PASS ALL FIVE BY BEING GOOD AT ONE THING" (`app/library/trials.ts:6`), and approved-reference-sheet asks for "varied subjects" plus "coverage of the element vocabulary". `Preset.elements` declares that vocabulary (`app/library/presets.ts:46-47`). Neither one reaches the gate.

**The move.**
- `Proof` gains `trialId?: string` (absent means a free subject) and `blockDigest?: string`, a stable hash of `compilePrompt`'s style half at render time from `lib/stylePrompt.ts`.
- New pure derivation `lib/themes/coverage.ts`:

  `sheetCoverage(theme) → { byProblem: Record<problem, {approved, rejected}>, stale: Proof[] /* approved under another blockDigest */, unknownLineage: Proof[] }`

- `canLock` and `lockBlocker` read it. Lock requires approvals under the *current* block that cover ≥ `LOCK_PROBLEMS` distinct trial problems, one declared constant (proposed: 3 of 5, decided in the gate).
- `styleRefs` drops stale approvals. Proofs from before lineage existed show as absence, never as a guess.
- Themes that are already locked are never re-gated (the ratchet holds). The sheet draws coverage as a `PipRow` per problem from `components/ui/signal`.

**Why it is a moonshot / what it unlocks.** "Locked" starts to mean what the trial set was built to prove. Approvals that no longer describe the style stop conditioning frames. The matrix is the data that atelier-B's one-press slate and any future comparison of styles stand on. `pipeline/style-ref-stability.mts` (`npm run check:style-refs`) gets a lineage to check against.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A theme with 1 approved proof on `peak-and-fall`. Expected: `canLock` false and `lockBlocker` names the missing problems.
2. Approved on 3 distinct problems under the current digest, nothing pending. Expected: `canLock` true.
3. Approve 3, edit `block.technique`. Expected: the 3 are `stale`, `canLock` false, and `styleRefs` returns [].
4. A legacy proof without a digest. Expected: listed in `unknownLineage`, still sent as a reference (no silent loss), and counted for lock only under a declared grandfather rule.
5. A locked theme from before the change. Expected: still locked, and `ratchetBlocker` unchanged (`tests/golden-path/theme-ratchet.probe.spec.ts` stays green).
6. Keep a render made from the "the flywheel" chip. Expected: the proof has `trialId:"flywheel"`.

**Write set.** new: `lib/themes/coverage.ts` (or `lib/themeCoverage.ts`), `tests/golden-path/theme-coverage.probe.spec.ts`; edit: `lib/themes.ts`, `lib/stylePrompt.ts`, `app/library/LibraryAtelier.tsx`, `app/library/Playground.tsx`, `app/library/parts.tsx`, `app/library/SpecEditor.tsx`, `lib/board/sources/proof.ts`, `pipeline/style-ref-stability.mts`.

**Risks & rollback.** Draft styles that could lock today will no longer be able to. That is the intended direction, and it needs an operator decision on `LOCK_PROBLEMS`. The digest must exclude the subject slot, or every trial would read as a new block. Rollback: set `LOCK_PROBLEMS` to 1 and treat stale as advisory. The fields are additive and IndexedDB records need no migration.

**First session dispatch.**
Read `lib/themes.ts:45-300`, `app/library/LibraryAtelier.tsx:120-160`, `app/library/trials.ts` and the two registry techniques named above.
Write acceptance cases 1-3 failing in `tests/golden-path/theme-coverage.probe.spec.ts`, then build `coverage.ts` and the digest and thread `trialId` from the Playground chip.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/theme-coverage.probe.spec.ts tests/golden-path/theme-ratchet.probe.spec.ts tests/golden-path/library-atelier-states.probe.spec.ts`, then `npm run check:style-refs`.

_Runner-up:_ "duplicate into a new draft" as a real verb. The ratchet's refusal tells the user to duplicate (`lib/themes.ts:291-295`), but no duplicate action exists to press.

### library-styles-atelier-B · The trial matrix is the wall: compare six presets on five problems, then run yours as one slate

**Context:** library-styles-atelier · **Slot:** B experience
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** media-generation/visual-style-locking#consistency-control-arm; media-generation/generated-output-grading#trial-matrix-design

**Summary.** The repo already holds a graded 6-preset × 5-trial matrix, rendered on two providers with vision readbacks (`hasText`, `drewWhatWasAsked`, `clutter`). The Library never shows it, so presets are chosen from a five-second clip. Proofing your own style means five single renders, one subject at a time. The move:
- the showcase becomes the matrix, read by row (one preset across all five problems) and by column (one problem across all presets);
- "Run the trial" renders all five beats for your style in one quoted press, as a slate judged in place with K/X.

**Premise (verified).**
- `public/trials/index.json` holds 60 entries (6 styles × 5 trials × the `google`/`leonardo` providers), each with `grade.{hasText, drewWhatWasAsked, clutter, description}` and `gradedBy` (read 2026-10-05). It is written by `pipeline/build-style-trials.mts:1-19` as "the durable artifact".
- `trialSrc` is declared (`app/library/trials.ts:90`) and has **no consumer** anywhere in `app/` or `lib/` (grep 2026-10-05).
- `PresetShowcase` plays only the clip (`app/library/PresetShowcase.tsx:21,33-34`). `PresetRail` reads `PRESETS` and thumbs only (`app/library/PresetRail.tsx:29`).
- The Playground renders one image per press (`IMAGES_PER_RUN = 1`, `app/library/Playground.tsx:30`). The five trial chips only set the subject field (`Playground.tsx:257-260`).
- The pre-click price seam already exists (`/api/imaging/pricing`, `Playground.tsx:59-81`), so a 5× quote reads the same declaration.

**The move.**
- New `app/library/TrialMatrix.tsx` reads `public/trials/index.json` through a typed `app/library/trialIndex.ts`. It replaces the showcase body: rows are presets, columns are the five problems, and each cell is the plate with its readback flags drawn as signal glyphs (a text-veto mark, "drew what was asked", a `Tally` for clutter). Prose is not used.
- A provider switch reads the two lanes. The selected preset's row lifts, and the clip stays as the row's first cell.
- On the user's style, "run the trial" calls `generateImage` five times (bounded concurrency, the style's `styleRefs`, each subject from `TRIALS`) after one 5× quote. The results fill the same five-column row under the presets, judged in place with K/X/U; `components/kit/VerdictKeys.tsx` already exists for this.
- Kept renders become proofs with `trialId` (requires atelier-A). An optional control-arm toggle renders the same five unconditioned, per consistency-control-arm, so the user can see what the sheet actually contributes.

**Why it is a moonshot / what it unlocks.** Choosing a preset becomes an evidence comparison instead of a mood choice. Proofing drops from five round trips to one press. The user's style is read on the same five problems as the six presets, so "is mine better than Blueprint at flow?" can be answered by looking. A future "compare two of my styles" is the same component with two rows.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The matrix renders 6 rows × 5 columns for provider `google`. Each cell's `src` equals the index's `file`.
2. A cell whose grade has `hasText:true` carries the text-veto glyph with an accessible name. No rendered sentence is added (`npm run check:narration` stays green).
3. "Run the trial" on a draft style. Expected: exactly one quote showing 5× the per-image price, and five `generateImage` calls each carrying `styleRefs(theme)`.
4. K on the 3rd slate cell. Expected: a proof is added with `trialId` = TRIALS[2].id and state approved.
5. One of five renders fails. Expected: four cells fill, the failed one shows the vendor's sentence and a per-cell retry, and the spend total counts only priced renders.
6. Control-arm on. Expected: 10 renders quoted up front, and control renders are never added as proofs.

**Write set.** new: `app/library/TrialMatrix.tsx`, `app/library/trialIndex.ts`, `app/library/useTrialSlate.ts`, `tests/golden-path/library-trial-matrix.probe.spec.ts`; edit: `app/library/LibraryAtelier.tsx`, `app/library/PresetShowcase.tsx`, `app/library/Playground.tsx`, `app/library/parts.tsx`, `app/library/trials.ts`.

**Risks & rollback.** Five parallel renders are real money, so the quote is mandatory and the concurrency is bounded (2). The matrix is 60 JPEGs, so it must lazy-load (the IntersectionObserver pattern from `app/foundry/StylesShelf.tsx`). Photograph the wall at 1920 and at phone width (`pipeline/cx-capture.mjs library-*`) before calling it done. Rollback: the showcase returns to the clip and the slate falls back to a single render.

**First session dispatch.**
Read `public/trials/index.json` (structure), `app/library/PresetShowcase.tsx`, `app/library/Playground.tsx:200-300` and `components/ui/signal/README.md`.
Write acceptance cases 1-2 failing, then build `trialIndex.ts` and `TrialMatrix.tsx` as read-only.
The slate (cases 3-5) is session two, after atelier-A's `trialId`.
Gate: `npm run typecheck`, `npm run check:narration`, then `npx playwright test tests/golden-path/library-trial-matrix.probe.spec.ts tests/golden-path/library-atelier-states.probe.spec.ts`, then a `cx-capture` photograph opened and looked at.

_Runner-up:_ the matrix as a /board source. A matrix cell judged by a human writes back to `public/trials/index.json` as a human grade beside the vision readback, which calibrates the readback.

_Checked:_ read in full: presets.ts, trials.ts, LibraryAtelier.tsx, LibraryView.tsx, page.tsx, Playground.tsx 1-140 (+ grep of run/subject), lib/themes.ts 25-432. Grepped consumers of PRESETS/trialSrc/origin kinds. Inspected public/trials/index.json (60 entries) and the build-style-trials.mts header. Read the registry techniques draft-proofing-locked-ratchet and approved-reference-sheet.

---

## library-view

### library-view-A · The studio's Outputs shelf is a fixture: derive it from the project's real step records

**Context:** library-view · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/demo-data-plane#fake-surface-honesty-contract, #one-interface-many-planes

**Summary.** Every project's Outputs panel (the studio's "glance sideways") renders the same mocked library: "Glass Harbor", agent run r-042. It does not receive the project id at all. Real outputs (adopted script, frames and alternatives, score, cut, music-video exports) already sit in per-project step records, and `lib/board`'s adapters already know how to read them. The move is an `outputsOf(projectId)` registry built on the same lazy adapter pattern, so the shelf shows what this project actually produced, with lineage.

**Premise (verified).**
- `app/studio/[projectId]/StudioView.tsx:464` renders `<LibraryShelves />` with no props when Outputs is open.
- `app/_library/LibraryShelves.tsx:20,35,46,58` read the static `ASSETS`/`COLLECTIONS`. `app/_studio/assets.ts:1-7` calls itself "The one import surface for the mocked library". The fixture is "what agent run r-042 filed" (`app/_studio/assetsGenerated.ts:1-2`).
- The shelf's own type already models real lineage (`provenance` with `runId`, `stepId` and `parentIds`, `app/_studio/types.ts:19-37`).
- Per-project step records exist and are typed: research notebook, scope, beat picks, script adoption, trailer cut, cut, score and music-video source (`app/_phases/_shared/stepStore.ts:39-233`), plus frames (`app/_phases/frames/useFrames.ts:116`).
- `lib/board/registry.ts:1-40` already has lazy, per-source, count-first adapters that read those records by `projectId` (`lib/board/sources/adoption.ts:41`, `alternative.ts:53`). The pattern exists; only the "approved output" projection is missing.
- The file's header records that a fake dock was removed because "it may not draw what the product cannot do" (`LibraryShelves.tsx:6-15`). A mocked shelf shown on every real project is the same kind of defect.

**The move.**
- New `lib/outputs/` with `registry.ts` (lazy loaders, as in `lib/board/registry.ts`) and one adapter per step under `lib/outputs/sources/{script,frames,score,cut,musicVideo,publish}.ts`. Each returns `Asset[]` in the existing `app/_studio/types.ts` shape for one `projectId`: the adopted render, approved plates and alternatives, the chosen score take (via `lib/sound/client`), cut and export files (via `lib/publish/exports`), with `provenance.stepId` and `parentIds`.
- Each adapter reports `loading | loaded | empty | unavailable(reason)`, the same state union as `SourceState`.
- `LibraryShelves` takes `projectId`, reads `useOutputs(projectId)` and keeps its kind, collection and search rail.
- The fixture plane stays available only behind an explicit demo dispatch (one interface, many planes). It is never the default for a real project.
- Collections are derived (step × run) instead of being taken from the fixture.

**Why it is a moonshot / what it unlocks.** The Outputs panel becomes a true index of a project's artifacts, which the next steps (motion, cut) can pick from instead of re-deriving. Lineage (`parentIds`) can be walked from a cut back to the frame and the research card. "Promote an output to the cross-project Library" becomes possible, because the output finally exists as a record.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A project whose script adoption record names render R. Expected: `outputsOf(id)` contains one `script` asset with `provenance.stepId` = the script phase and `id` derived from R.
2. A project with no step records. Expected: every source returns `empty`, and the shelf shows the Ghost empty state, not the fixture.
3. A project with frames approved on 3 of 5 frames. Expected: exactly 3 image assets, each with its frame id in `parentIds`.
4. Sound store unreachable. Expected: the score source is `unavailable` with the real message and the other sources still render.
5. `LibraryShelves` mounted for project A, then project B. Expected: no asset from A appears.
6. Demo plane flag on. Expected: the fixture renders, marked as demo.

**Write set.** new: `lib/outputs/registry.ts`, `lib/outputs/types.ts`, `lib/outputs/sources/{script,frames,score,cut,publish}.ts`, `lib/outputs/useOutputs.ts`, `tests/golden-path/project-outputs.probe.spec.ts`; edit: `app/_library/LibraryShelves.tsx`, `app/studio/[projectId]/StudioView.tsx`, `app/_studio/assets.ts`.

**Risks & rollback.** Reading every step record when the panel opens could be slow, so the registry follows the Board's count-first, load-on-demand rule. Some steps have no "approved" notion yet; their adapters return `empty` rather than guessing. Rollback: `LibraryShelves` can fall back to the fixture behind the demo flag, so the switch is one line.

**First session dispatch.**
Read `app/_library/LibraryShelves.tsx`, `lib/board/registry.ts`, `lib/board/sources/adoption.ts`, `lib/board/sources/alternative.ts` and `app/_phases/_shared/stepStore.ts:1-240`.
Write acceptance cases 1, 2 and 5 failing, then build the registry with the script and frames sources only and thread `projectId` from StudioView.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/project-outputs.probe.spec.ts tests/golden-path/projects-shelf.probe.spec.ts`, then a `cx-capture` of `studio-*` with Outputs open.

_Runner-up:_ the Library leaves the browser. Themes, proofs and the plate shelf move to a server store following `soundMigration.ts`'s one-time, id-idempotent copy, so agents and the pipeline can render in a project's locked style. Proof base64 currently sits in IndexedDB, at "a megabyte" per sheet (`lib/themes.ts:372-377`).

### library-view-B · The Foundry's catalogue reaches projects: start a Library style from a proven Foundry style

**Context:** library-view · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** media-generation/visual-style-locking#style-onboarding-from-sample
**App Master decision (2026-10-07):** the PresetRail Foundry lane is declined (T6); the card is merged into foundry-forge-B. See critic-2026-10-07-m1-tails.md.

**Summary.** The Foundry's catalogue (27 styles, 4 of them human-proven across scenes) and the Library (the only place a project gets its style) never meet. The Library starts styles from six hand-written presets or from a plate. The Foundry's catalogue is a read-only shelf with no route out. The move is a "From the Foundry" lane on the preset rail:
- pick a style;
- a reasoning turn projects its recipe and observables into the four-slot block as a hypothesis;
- the human edits it;
- the style is then proofed and locked like any other.

Source frames from the extract gallery never become references.

**Premise (verified).**
- `pipeline/foundry/styles.json` holds 27 styles: 4 `proven`, 18 `extracted` (read 2026-10-05). It is served by `GET /api/foundry/styles` (`app/api/foundry/styles/route.ts:1-12`).
- `app/foundry/StylesShelf.tsx` is read-only (catalogue, recipe, exemplars; no export action), and `app/foundry` never imports `lib/themes`. The FoundryView header puts the Library downstream: "the Library holds RATIFIED things … the foundry is upstream of ratification" (`app/foundry/FoundryView.tsx:18-20`). The path downstream is missing.
- The Library's starting points are `PRESETS` (`app/library/presets.ts:63-178`) via `startFrom` (`app/library/LibraryAtelier.tsx:120-133`) and a plate (`app/library/assets/useShelf.ts:318`). `ThemeOrigin` declares `"screenshot"` (`lib/themes.ts:85`) and nothing produces it.
- The two shapes differ: `StyleDef` = observables + prose recipe + negative + exemplars (`lib/foundry/types.ts:94-108`), while `StyleBlock` = technique, subject, a 3-colour palette with roles, and finish (`lib/themes.ts:37-43`). The projection is a reasoning step, not a field copy.
- An exemplar's `role` separates `source` (someone else's gallery frame) from `replica`/`transfer` (generated) (`lib/foundry/types.ts:81`). style-onboarding-from-sample says the sample "never becomes a production reference". So only generated exemplars may seed anything, and only as pending proofs.

**The move.**
- New `POST /api/foundry/styles/[id]/block` (server, through `lib/text/router` `reason` with a new `TurnClass` `"style-block-from-recipe"` and a schema matching `StyleBlock`). It returns a draft block plus the observables it read from, as provenance.
- `PresetRail` gains a second lane, "Foundry", fed by `fetchCatalogue()`: proven first, family-grouped, hero image via `app/foundry/styleArt.ts#heroOf`.
- Picking one shows the draft block in SpecEditor for the human edit, which is the load-bearing step. Accepting creates a Theme with a new origin `"foundry"` and `presetId` → `foundryStyleId`.
- Optionally, its `replica`/`transfer` exemplars are copied in as **pending** proofs (never `source`), so the sheet starts with evidence the user must still judge.
- `StylesShelf`'s document gets one "open in Library" action that lands on that lane, the same handoff as `LibraryView`'s `focusStyle`.

**Why it is a moonshot / what it unlocks.** The Foundry stops being a closed loop. Hours of forge and extract work produce styles a project can actually be built on, with the Foundry's evidence attached. The `screenshot` origin gets its real implementation, because the same `/block` turn works on a single dropped image through the extract engine's readback. Later, the Library's locked styles could flow back as forge targets.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `/block` on a fixture StyleDef. Expected: a schema-valid `StyleBlock` with exactly 3 palette entries, one per role.
2. Accept the draft. Expected: a Theme with `origin:"foundry"`, `presetId` = the style id, status `draft`.
3. Seeding from exemplars `[source, replica, transfer]`. Expected: exactly 2 pending proofs, and the `source` file is never fetched.
4. The reasoning turn fails. Expected: the vendor's sentence is shown and no Theme is created (no fallback block invented).
5. Rail with discipline filter "educational". Expected: Foundry styles (untagged) still show, per `styleFits` (`lib/themes.ts:137-139`).
6. "Open in Library" from the StylesShelf document. Expected: `/library` opens on Styles with that Foundry style considered.

**Write set.** new: `app/api/foundry/styles/[id]/block/route.ts`, `lib/foundry/styleBlock.ts`, `app/library/FoundryLane.tsx`, `tests/golden-path/library-from-foundry.probe.spec.ts`; edit: `lib/text/types.ts`, `lib/themes.ts`, `app/library/PresetRail.tsx`, `app/library/LibraryAtelier.tsx`, `app/library/SpecEditor.tsx`, `app/library/LibraryView.tsx`, `app/foundry/StylesShelf.tsx`, `app/foundry/foundryClient.ts`.

**Risks & rollback.** The catalogue's styles are cinematic or photoreal while the presets are explainer-flat, so many will not suit an explainer. The discipline tag on the created Theme must be left unset or chosen by the human, never guessed. Exemplar bytes have to cross from server disk into IndexedDB, roughly 250 KB each; bound it to 4. Rollback: hide the lane. Themes already created keep working, because `origin:"foundry"` is an ordinary Theme.

**First session dispatch.**
Read `lib/foundry/types.ts:72-108`, `lib/themes.ts:37-160`, `app/library/LibraryAtelier.tsx:100-140`, `app/library/PresetRail.tsx`, `lib/text/router.ts` and `lib/text/types.ts`, and the registry technique style-onboarding-from-sample.
Write acceptance cases 1 and 3 failing, then build `lib/foundry/styleBlock.ts` with the route and the exemplar filter.
The rail lane is session two.
Gate: `npm run typecheck`, then `npx playwright test tests/golden-path/library-from-foundry.probe.spec.ts tests/golden-path/foundry-routes.probe.spec.ts tests/golden-path/library-atelier-states.probe.spec.ts`, then `npm run verify:text`.

_Runner-up:_ a "where used" lens. A style's dependents are counted only when the user moves to delete it (`LibraryAtelier.tsx` `askDelete` → `listProjects`). Show the projects and plates resting on each style as a Tally on its pill.

_Checked:_ read: LibraryView.tsx, LibraryAtelier.tsx, the LibraryShelves.tsx header and fixture use, app/_studio/assets.ts and assetsGenerated.ts head, StudioView.tsx:440-470, stepStore.ts type list, lib/board/registry.ts, the adoption/triage/publish source headers. Grepped LibraryShelves mounts (1, no props), ThemeOrigin producers (preset, plate only) and app/foundry→lib/themes imports (none). Read the styles.json status breakdown and the styles route.
