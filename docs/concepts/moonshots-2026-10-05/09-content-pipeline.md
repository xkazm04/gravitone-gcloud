# Moonshot cards · Content Pipeline

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

Contexts in order: text-engine, foundry-forge, foundry-dojo, probe-frame-data, pipeline-scripts, data-asset-probes.

Numbers I measured this session, not taken from the code:
- `pipeline/foundry/ledger.json`, 87 rows. The craft grade ranks kept vs rejected plates with AUC 0.29, which is inverted. style_score has AUC 0.58. `has_text` is false on 87 of 87 rows.
- `pipeline/foundry/training-ledger.json`, 17 rows. The chokepoint judge's pick rate separates the human's approve from reject with AUC ≈ 0.69. 13 rows read `reflected:false`, and 9 of those are rejects.
- `context-map.json` lists 14 probe-frame-data manifests. None of them exists on this checkout, because `.gitignore` drops them.

---

## text-engine

### text-engine-A · Durable turns: reason() becomes submit/settle over a server-side turn ledger

**Context:** text-engine · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** software-engineering/durable-agent-operations#intent-mints-the-identity; media-generation/production-pipeline-phasing#long-run-as-background-job

**Summary.** Each reasoning turn is one HTTP request held open for up to 800 s. The paid answer exists only in that response, and the job record exists only in a browser tab. The move makes a turn a durable server record (intent, then settle) addressed by a turn id. A minutes-long billed answer then survives a closed tab, a reload or a second tab, and consumers reattach to it instead of paying again.

**Premise (verified).**
- `lib/text/router.ts:204`: `reason()` is the only entry point and it is request/response. Nothing is persisted except a stdout line and the LightTrack event (`router.ts:234-235`).
- `app/api/research/route.ts:84`, `app/api/recalibrate/route.ts:63`, `app/api/frames/route.ts:44`: each sets `maxDuration = 800`. The validated result is returned in `Response.json` and kept nowhere server-side.
- `lib/jobs.tsx:252-268`: on reload a running job is rewritten as `interrupted` ("cannot reattach"). `:258` says "reattaching to one is a backend problem this prototype does not have". `:344-345` says both cross-tab windows "would be closed by moving the record server-side, which is where this seam is going anyway."
- `app/api/research/route.ts:294-295`: on a `timeout` "a local run may have been billed for work we then threw away".
- `app/_phases/research/run/LiveResult.tsx:127` tells the creator "leaving the step does not cancel it". That is only true while the tab is alive.
- `lib/text/log.ts:19-26`: the prompt is never persisted. A durable record has to key on a digest.

**The move.** New `lib/text/turns/`:
- `types.ts` defines `TurnRecord`: `{id, turn, owner, idemKey, promptDigest (sha256), promptChars, status: intent|running|settled|failed|abandoned, provenance, result, findings?, errorKind?, leaseUntil, createdAt, settledAt}`. The prompt text itself is never stored.
- `store.ts` is a disk store (`TEXT_TURN_DIR`) using the same atomic write-then-rename shape as `lib/sound/store.ts`.
- `submit.ts` provides `submitTurn(req, {idemKey, settle})`. It commits the intent, then runs `reason()` detached from the request (verify the Next 16 `after()` / background semantics in `node_modules/next/dist/docs` first). It settles atomically with the result and the receipt.
- `sweep.ts`: on boot, a `running` record whose lease has expired becomes `abandoned`. It is never re-dispatched (background-jobs#startup-sweeps).

`reason()` stays the inner chokepoint, so providers do not change. The route-specific door (`parseNotebook`, `parseEditPlan`, stray/blind checks) moves into a per-route `settle` hook, so the record holds the validated artifact or its findings. Routes answer `202 {turnId}`. A new `GET /api/turns/[id]` reads the record. `lib/jobs.tsx` `Job` gains `turnId`, and its reload branch polls the server (`usePolling` exists) instead of writing `interrupted`. The idempotency key is route + project + payload digest. That makes the one-per-project serialisation rules server-enforced: two tabs get the same turnId and the provider is called once.

**Why it is a moonshot / what it unlocks.** It closes both windows `jobs.tsx` names. No billed answer is thrown away, so a result can be re-validated after a validator fix and resumed on another device. It is also the substrate text-engine-B (repair from the stored answer) and pipeline-scripts-B (record cassettes from settled turns) both want. Who notices: a creator who closes the laptop mid-research and finds the notebook in the bell.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `submitTurn` with a stub provider that resolves after 2 s, and the caller aborted at 100 ms → `GET /api/turns/:id` at 2.5 s returns `settled` with `result`.
2. Two `submitTurn` calls with the same idemKey while the first is running → same turnId, provider invoked once.
3. The record file on disk contains `promptDigest` and `promptChars` and no 40-char slice of the prompt.
4. A new store instance holding a `running` record with an expired lease → the sweep marks it `abandoned` (kind `interrupted`), and the provider is never called again.
5. A research settle hook given an answer that fails `parseNotebook` → status `failed`, kind `bad-response`, and findings plus the raw answer retained.
6. `jobs.tsx` `readStore` on a running job carrying a `turnId` → stays `running` and polls, not `interrupted`.
7. `TEXT_ENV=cloud` with no `TEXT_TURN_DIR` → `submitTurn` refuses with a named remedy and does not silently fall back to memory.

**Write set.** new: `lib/text/turns/{types,store,submit,sweep}.ts`, `app/api/turns/[id]/route.ts`, `tests/golden-path/text-turns.probe.spec.ts`; edit: `app/api/research/route.ts`, `app/api/recalibrate/route.ts`, `app/api/frames/route.ts`, `lib/jobs.tsx`, `app/_phases/research/run/live.ts`, `app/_phases/script/useVersions.ts`.

**Risks & rollback.**
- Cloud Run disk is per-instance and ephemeral, so the cloud posture needs a bucket adapter. Keep the store interface narrow, and refuse loudly on cloud until the adapter exists.
- A detached promise can be killed when the request ends on some runtimes. Prove the `after()` behaviour in a probe before relying on it.
- Rollback: each route keeps a `?sync=1` path straight to `reason()`, and the client flag reverts to it.

**First session dispatch.**
Read `lib/text/router.ts`, `lib/jobs.tsx:240-370`, `app/api/research/route.ts`, `lib/sound/store.ts` (atomic write), and Next 16's docs on post-response work in route handlers. Build `lib/text/turns/{types,store,submit}.ts` against a stub provider, with probe cases 1-4 failing first. Wire `/api/research` only. Gate: `npm run typecheck`, `npm test` (`tests/golden-path/text-turns.probe.spec.ts`).

_Runner-up:_ a prompt-digest result cache for idempotent cheap turns (`style-synthesis`, `sound-hunt`), so a retried identical turn is free.

### text-engine-B · Repair, don't discard: a failed validation becomes a draft with a repair turn

**Context:** text-engine · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** software-engineering/structured-output#schema-validation-and-repair

**Summary.** When a minutes-long research or recalibration answer fails the app's validator, the creator gets "Nothing was saved" or "Nothing was changed" and up to 12 prose findings. The paid answer is dropped, and the only remedy is to run the whole turn again. The move keeps the answer as a quarantined draft, pins the findings to it, and offers a bounded repair turn that fixes only the listed paths. The repaired answer re-enters the same validator.

**Premise (verified).**
- `lib/text/router.ts:342-346`: `bad-response` is not reroutable and is thrown ("a minutes-long metered turn is not something to repeat on a hunch").
- `app/api/research/route.ts:272-280`: `NotebookError` returns 502 "Nothing was saved." with `findings`. `run.text` is discarded.
- `app/api/recalibrate/route.ts:451-455`: `PlanError` returns "Nothing was changed." with no findings and no answer.
- `lib/notebook/validate.ts:363-368`: findings are free-text strings, not path-addressed. The registry technique says prose errors cannot be fed back to a repair loop.
- `app/_phases/research/run/LiveResult.tsx:132-152`: the failed state is a `Notice` plus a list capped at 12. The only way forward is to start over.
- `lib/text/json.ts:24-31`: the router-level check is shallow (root `required` only). The real doors are per route, so no shared repair seam exists.

**The move.**
1. **Path-addressed findings.** `NotebookFinding {path, rule, observed}` in `lib/notebook/validate.ts`, and the same shape for `parseEditPlan` (`app/_phases/script/editPlan.ts`). `.message` stays as a derived string, so callers keep working.
2. **A `repair` turn class.** Add it to `TurnClass` (`types.ts`), the router's PLAN and timeout rows, and flash-class in google's `MODEL_FOR_TURN`. New `lib/text/repair.ts` exposes `repairTurn({draft, findings, schema})`. The prompt says: here is your object; change only these paths; return the whole object. It is capped at 2 attempts, and `exhausted` is a first-class outcome.
3. **Two guards.** An unchanged-elsewhere diff refuses a repair that edits fields outside the listed paths. A no-shrink rule refuses a repair that deletes facts or edits to pass.
4. **Routes return the draft.** `/api/research` and `/api/recalibrate` failure bodies carry `draft` plus findings. New `/api/research/repair` (guarded). `LiveResult` renders the draft through `NotebookBody` with findings pinned to their sections, using the signal vocabulary (`Tally` per section, finding text verbatim, because it is work and not app narration). A `repair` action is added.
5. **One receipt for both turns.** The receipt records the original turn and the repair turn. Cost is summed only when both turns are priced.

**Why it is a moonshot / what it unlocks.** The most expensive failure in the app (a minutes-long Opus or pro turn) stops being a total loss and becomes a seconds-long fix. The creator sees what the engine actually wrote. Path-addressed findings also produce a per-rule failure histogram across runs, which is the prompt-fix signal the routes' own comments ask for ("one finding per run is a prompt edited five times").

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `parseNotebook` on a notebook missing `tension.strength` → `findings[0].path === "tension.strength"`.
2. `repairTurn` with a stub returning a fixed object → passes `parseNotebook`. Provider called once, provenance turn `repair`.
3. `repairTurn` where the stub stays invalid → after 2 attempts returns `{outcome:"exhausted", findings}` and does not throw a generic error.
4. A repair that drops facts below the draft's count → refused with finding `repair removed N facts`.
5. A repair that changes a field outside the listed paths → refused (unchanged-elsewhere).
6. The `/api/research` failure body includes `draft` and path-addressed findings. `LiveResult` failed state exposes `data-testid="repair-run"`.

**Write set.** edit: `lib/notebook/validate.ts`, `app/_phases/script/editPlan.ts`, `lib/text/types.ts`, `lib/text/router.ts`, `lib/text/providers/google.ts`, `app/api/research/route.ts`, `app/api/recalibrate/route.ts`, `app/_phases/research/run/LiveResult.tsx`, `app/_phases/research/run/live.ts`; new: `lib/text/repair.ts`, `app/api/research/repair/route.ts`, `tests/golden-path/text-repair.probe.spec.ts`.

**Risks & rollback.**
- A repair can "fit to pass". The two guards plus the one validator are the defence.
- A recalibration draft must never be applied to a version before it passes.
- Rollback: the repair route and button are additive, and findings keep their `.message` strings.

**First session dispatch.**
Resolve `structured-output` through `../ai-registry/knowledge/software-engineering/index.json`, and read its golden path and `schema-validation-and-repair`. Then read `lib/notebook/validate.ts` and `app/api/research/route.ts:180-300`. Build path-addressed findings first (case 1), then `repair.ts` against a stub provider (cases 2-5). Gate: `npm run typecheck`, `npm test`.

_Runner-up:_ a pre-click engine chip on every reasoning spend button showing which rung would serve and the price basis, from `engineStatus()` plus `textPriceTable()`.

_Checked:_
- Read in full: `lib/text/router.ts`, `types.ts`, `json.ts`, `log.ts`, `pricing.ts`, `providers/google.ts`, `lib/claudeCli.ts`. Skimmed `env.ts` and `errors.ts`.
- Call sites traced: `app/api/{research,recalibrate,frames}/route.ts`, `lib/sound/hunt.ts`, `lib/foundry/extract/store.ts`. Also read `lib/jobs.tsx:1-370` and `LiveResult.tsx:120-160`.
- Hypotheses confirmed: no server-side turn persistence exists, and no repair or replay seam exists in `lib/text`.

---

## foundry-forge

### foundry-forge-A · Calibrated grading: the human ledger scores, gates and versions the grader

**Context:** foundry-forge · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** media-generation/generated-output-grading#two-grader-disagreement-rule (+ #regrade-without-regenerate)

**Summary.** The forge's automatic grade is drawn under every tile as the cull's pre-filter. Against the 87 human verdicts it ranks plates backwards on craft (AUC 0.29: kept mean 0.64, rejected mean 0.78) and near chance on style (0.58). The text veto has never fired. The move makes grader calibration a versioned artifact, recomputed on every commit, and lets only calibrated fields steer the cull.

**Premise (verified).**
- `pipeline/foundry/README.md:53` says "Grading is a pre-filter, never a verdict". `:103` says the ledger is "how we learn whether the grader predicts the human (kept-vs-rejected mean scores are in every findings.md)", but only per run.
- `pipeline/foundry/ledger.json`: 87 rows from 2 runs (both 2026-08-26). Computed this session: craft AUC 0.29, style_score AUC 0.58, `has_text` false on 87 of 87.
- `lib/foundry/store.ts:168-174`: `findings.md` prints per-run means only. Nothing aggregates across runs or measures discrimination.
- `app/foundry/CullGrid.tsx:463-468`: craft and style meters sit under every tile with equal weight.
- `pipeline/foundry/grade.py:82-90`: `craft_score` is per-field credit against the source annotation, so it measures copy fidelity. The kept plates are the ones that departed from the source, which is a plausible cause of the inversion.
- `pipeline/foundry/forge.py:390-391`: a grade records the `grader` model id only. There is no prompt or schema digest, so a grader change cannot be told apart from drift.

**The move.**
- **Calibration module.** New pure `lib/foundry/calibration.ts` computes, per grade field and split by mechanism: `{n_keep, n_reject, auc, bootstrap CI, status: calibrated|inverted|chance|insufficient}`, with a minimum-sample floor.
- **Versioned output.** `commitRun` writes a new tracked `pipeline/foundry/grader-calibration.json` after the ledger write, in the same effect order. Series are keyed by grader model plus a digest of `grade.py`'s schema and prompt, so a grader change starts a new series instead of polluting the old one (judge-stability). `forge.py` stamps `grader_digest` on every grade.
- **Keep the corpus re-gradable.** The commit keeps a 256 px thumbnail of every decided candidate, rejects included, under `foundry-out/calibration/`, before unlinking. These are our own generations, not third-party content. A challenger grader can then be re-scored against the whole human corpus without regenerating (regrade-without-regenerate).
- **The cull reads the calibration.** `CullGrid` and `Lightbox` ScoreMeters show an inverted or chance field as a `Ghost` (accessible name kept) and add a `StaleBadge` on a digest mismatch. The default cull order uses calibrated fields only.

**Why it is a moonshot / what it unlocks.** The README names human culling as the bottleneck. A grader that demonstrably predicts the human is the only route to overnight sweeps over the 19 zero-evidence extracted styles that can be culled in minutes. Today the meters actively steer the curator the wrong way, and nobody can see that.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Calibration over the current `ledger.json` → craft `{auc≈0.29, status:"inverted"}`, style_score `{status:"chance"}`, has_text `{status:"insufficient"}`.
2. Fewer than the floor of keeps or rejects for a field → `insufficient`, never a calibrated number.
3. `commitRun` on a probe run under `FOUNDRY_DIR` writes `grader-calibration.json` there and leaves the tracked file byte-identical (same instrument gate as `foundry-commit-indices`).
4. A ledger row whose grader digest differs from the current one → excluded from the current series and counted in `other_graders`.
5. The pure cull-order function ignores an `inverted` field.
6. Commit retains a thumbnail for every decided candidate before any unlink.

**Write set.** new: `lib/foundry/calibration.ts`, `pipeline/foundry/grader-calibration.json`, `tests/golden-path/foundry-calibration.probe.spec.ts`; edit: `lib/foundry/store.ts`, `lib/foundry/types.ts`, `pipeline/foundry/forge.py`, `pipeline/foundry/grade.py`, `pipeline/foundry/selftest.py`, `app/foundry/CullGrid.tsx`, `app/foundry/Lightbox.tsx`, `app/foundry/ui.tsx`.

**Risks & rollback.**
- n=87 from two runs. The inversion may be a `ref-early` artifact (copying the source scores high and gets rejected), so the mechanism split is mandatory before any claim.
- Rollback: calibration is advisory. The meters ignore `status` and the grid returns to its current order.

**First session dispatch.**
Read `pipeline/foundry/README.md`, `grade.py`, `forge.py:370-436`, `lib/foundry/store.ts:130-300` and `ledger.json`. Resolve `generated-output-grading` and read `two-grader-disagreement-rule`. Build `calibration.ts` with a probe asserting cases 1-2 against the real ledger, then the commit write (case 3). Gate: `npm test`, `npm run typecheck`, `python pipeline/foundry/selftest.py`.

_Runner-up:_ ledger-derived plans. Compute the next sweep from catalogue gaps (19 candidate styles with no evidence) and seeds ≥ 2 on settled cells, instead of hand-writing `plans/*.json` (`README.md:219`, both plans run one seed).

### foundry-forge-B · Proven style to Library theme in one move

**Context:** foundry-forge · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** media-generation/visual-style-locking#draft-proofing-locked-ratchet (+ #style-onboarding-from-sample)
**App Master decisions (2026-10-07) - read before building foundry-forge-B's next stage.**

- **(a) One plate.** The palette is read off the style's first kept ledger row, the one `heroOf` shows, because proven styles have no exemplars. **Alternative that lost:** merging palettes across 2-3 plates.
- **(b) `finish` is the recipe text with its palette sentences stripped. `technique` is its first sentence. `subject` stays empty for the human.** **Constraint:** a theme must never carry two palettes that can disagree. **Alternative that lost:** the recipe verbatim as `finish`.
- **(c) When this machine has no plates (no `foundry-out/`, or a missing run or plate file), the route answers 200 with `paletteMissing` and a reason, never 500, and the client creates no Theme.** **Constraint:** kept plates exist only where the forge ran.
- **(d) The recognizer must return exactly one `{name, hex, role}` per `ColorRole`. Anything else is `paletteMissing`, and nothing is padded or invented (library-view-B case 4).** **Constraint:** `canLock` does not check the palette (`lib/themes.ts:241`, `canLock`).
- **(e) No proofs are seeded; that waits on an operator call.** **Constraint:** `ref-early` plates were conditioned on a franchise source frame (`pipeline/foundry/forge.py:36`), and approved proofs become pinned style references (`lib/themes.ts:199`, `PINNED_REFS`). The registry's `style-onboarding-from-sample` forbids that. **Alternative that lost:** the card's kept plates as pending proofs.
  - **Superseded by (g).**
- **(g) Seed only kept text-lane plates, as pending proofs labelled with their model; never `ref-early` plates.** **Operator chose** this in ask 7ab59516, 2026-10-07: 'Seed text-lane plates only'. This is a decision, not a landing: another branch is building the stage. **Constraint:** the `ref-early` plates carry the franchise-conditioning risk in (e). **Alternative that lost:** seeding all kept plates.
- **(h) The PresetRail Foundry lane is declined (critic-2026-10-07-m1-tails, T6).** **Constraint:** under (a)-(f) it adds only a second door to the same POST, and on a hosted Library it would show styles that can never be adopted. It reopens as a new card if the catalogue outgrows /foundry. **Alternative that lost:** the lane in milestone 1, or later with a server 'adoptable here' fact.
- **(i) 'A project's Library lists it' reads as: `listThemes` lists the adopted draft (T7).** One assertion in the foundry-adopt probe, added after the seeding stage merges. **Alternative that lost:** a project can be built on it (adopt, approve a seeded proof, lock, `lockedOnly` includes it).
- **(f) The adopt route sits behind `guardRequest`, which deployment-cells reads as the money door.** Both route inventories (deployment-cells and imaging-auth) carry it since `b2b6057`. **Alternative that lost:** the 'access' door that task bdeaf5fd proposed, which the `wrongDoor` check fails.
- **(j) Seeding landed at `818772c`; the App Master's calls on its three questions.** Adopt seeds the style's kept text-lane forge plates as pending proofs, each labelled with its model, and never `ref-early` plates, as (g) chose. `SEED_CAP` is 4 plates with an 8,000,000-byte cap; `cold-photoreal-cg` has 4 plates, 6.34 MB, at the plate cap with none left out. **Q1: keep the prefix cap** (ledger order, deterministic); no style is over a cap today. **Q2: `proofsLeftOut` is not shown on the shelf in milestone 1,** since no style leaves any out today (residue). **Q3: the double palette-plate read stays** (disk only, one human act).
- **(k) foundry-forge-B reads `landed e775376` for milestone 1, closing C7.** `e775376` adds foundry-adopt case 5, which asserts that `listThemes('uid-1')` contains the adopted draft (T7, per (i)); it was green on the base, as T7 expected. **Residue:** the palette editor is held (critic ask 8) and `proofsLeftOut` is not on the shelf (Q2); the PresetRail lane stays declined (h).

**Summary.** Four catalogue styles are `proven` by human culling across scenes, but nothing in the studio can use them. `styles.json` is read only by `/foundry` and the pipeline, and a Library theme can only start from scratch, a preset, a screenshot or a plate. The move adds "adopt" on a proven style. It forks the style into a draft Theme whose palette roles come from a deep read of its kept plates, with those plates offered as pending proofs. The draft, proofing, locked ratchet is preserved.

**Premise (verified).**
- `pipeline/foundry/README.md:228-229`: "Promote a kept candidate to the Library as a theme proof, so a proven style becomes a lockable identity for a project. A route, not a redesign." This is unbuilt.
- `lib/themes.ts:85`: `ThemeOrigin = "scratch" | "preset" | "screenshot" | "plate"`, so there is no foundry origin. A grep for `styles.json` readers finds only `app/foundry/*`, `lib/foundry/*` and `pipeline/foundry/*`.
- `pipeline/foundry/styles.json`: 4 proven styles (painted-3d, cold-photoreal-cg, cel-anime, ink-graphic-novel), 5 forge candidates and 19 extracted candidates with zero evidence. Entries carry `observables/recipe/negative` but no palette. `StyleBlock` (`lib/themes.ts:37-43`) needs exactly three colours with ground, objects and accent roles.
- `pipeline/foundry/DEEP-READ-PROMPT.md:26-29`: the deep read already returns "PALETTE AS ROLES": ground, figure and accent, with named colours. That is the shape `ColorRole` needs.
- `app/library/assets/useShelf.ts:312-330`: `startStyleFrom` (the plate fork) is the template: `createTheme({origin, block})`, announce, then open Styles.
- `app/foundry/StylesShelf.tsx:250-258`: the StyleSheet already gathers each style's kept forge renders (`kept`, `keptFileUrl`).

**The move.**
1. **Draft builder.** New `lib/foundry/adopt.ts` (server). `adoptionDraft(styleId)` returns `{name, block, elements, proofs}`:
   - `technique` and `finish` come from the recipe's own sentences: the medium sentence becomes technique, and the edge and finish sentence becomes finish.
   - `subject` is neutral.
   - `palette` comes from a deep read of 2-3 kept plates through `lib/imaging` recognize, mapped onto `ColorRole`, with the stack named explicitly.
   - `proofs` are the kept forge plates with state `pending` and `model`/`provider` set to the Flux render that made them (`lib/themes.ts:59-60` fields exist), so their lineage is honest.
2. **Route.** `GET /api/foundry/styles/[id]/adopt` (guarded) returns 409 for a style that is not proven.
3. **Theme origin.** `ThemeOrigin` gains `foundry`, with `ORIGIN_WORD` "from the foundry" and `foundryStyleId`.
4. **Surface.** The StyleSheet footer gains the adopt action for proven styles. The Library atelier opens the new draft. The human approves proofs there. Locking stays the Library's rule, unchanged.

**Why it is a moonshot / what it unlocks.** This closes the loop the foundry exists for. A creator starts a project on a style with cross-scene human evidence and real exemplar renders instead of a description. It also gives the 19 extracted candidates a reason to be forged, because proof leads to the Library.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `adoptionDraft("cold-photoreal-cg")` with a stub recognizer → `block.palette` has exactly 3 colours, one per role.
2. `adoptionDraft` on a `candidate` style → `FoundryError` 409.
3. Draft proofs equal that style's kept ledger rows whose files exist. Each is `pending` with provider and model set, and no rejected plate appears.
4. A theme with `origin:"foundry"` round-trips through `studioDb` (fake-indexeddb) and `ORIGIN_WORD` covers it (exhaustive `Record`).
5. Recognizer unavailable → the draft is still returned with an empty palette and `paletteMissing: true`. It is never given a guessed palette.
6. `compileStyleBlock(draft.block)` starts with the recipe's medium sentence and the `NO_TEXT_CLAUSE` path is unchanged.

**Write set.** new: `lib/foundry/adopt.ts`, `app/api/foundry/styles/[id]/adopt/route.ts`, `tests/golden-path/foundry-adopt.probe.spec.ts`; edit: `lib/themes.ts`, `lib/useThemes.ts`, `app/foundry/StylesShelf.tsx`, `app/foundry/foundryClient.ts`, `app/library/LibraryAtelier.tsx`.

**Risks & rollback.**
- Forge plates are Flux 2 renders at 1280x720, while the production model differs. They stay `pending` and are labelled with their model. A user may still need fresh proofs, and that is honest.
- The proof base64 size counts against the 14-proof cap.
- Rollback: the origin is additive. Remove the button.

**First session dispatch.**
Read `lib/themes.ts`, `app/library/assets/useShelf.ts:300-335`, `app/foundry/StylesShelf.tsx`, `pipeline/foundry/DEEP-READ-PROMPT.md`, and the visual-style-locking golden path. Build `lib/foundry/adopt.ts` with a stub recognizer and probe cases 1-3 first, then the route and the origin. Gate: `npm run typecheck`, `npm test`, `npm run check:narration`.

_Runner-up:_ the beat lane (`README.md:224`): the forge over a shot sequence from one trailer, with the cull judging cut rhythm as well as frames.

_Checked:_
- Read: `README.md` in full, `grade.py:1-147`, `forge.py` (outline plus 370-456), `plans/*.json`, `lib/foundry/store.ts:130-300`, `StylesShelf.tsx:235-290`, `CullGrid.tsx:455-470`, `lib/themes.ts:1-125`, `useShelf.ts:295-335`, `LibraryAtelier.tsx:105-140`.
- Computed this session from `ledger.json` and `styles.json`.
- `acquire.py`, `intake.py`, `scene_demo.py`, `scenario_probe.py` and `motion_energy.py` were read through the README only.

---

## foundry-dojo

### foundry-dojo-A · Improvement lifecycle derived from git: owed, merged, pinned and live as one state machine

**Context:** foundry-dojo · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** media-generation/review-iteration-loops#gate-record-outlives-the-media; software-engineering/quality-gates#item-liveness

**Summary.** An approved improvement passes through four places: the ledger row, a reflection branch, the prompt surface and a regression pin. Today these are linked by a hand-stamped `reflected: false|sha` and a hand-written pin list, and they have drifted:
- a row reads reflected by a sha that sat unmerged for 7 days;
- 9 of 13 committed cycles had no row;
- every reject queues reflection work it can never owe.

The move replaces the boolean with a lifecycle whose states are derived from git and the pin file.

**Premise (verified).**
- `lib/foundry/training/types.ts:85-97` defines `reflected: false | string`. `lib/foundry/training/store.ts:230` writes `reflected: false` for every decided improvement, approve or reject.
- `pipeline/foundry/training-ledger.json`: 17 rows, 13 `reflected:false`. 9 of those are rejects that owe nothing. 4 are approved and unreflected since 2026-09-09: nb-counted-beats, nb-what-stays-dark, reference-sheet, build-key-flip.
- `.claude/dojo/config.md:390-398` records three failures: f33275c "sat unmerged 7 days while its ledger row reads `reflected: f33275c` as though it were live"; "9 of 13 committed cycles have no ledger row"; and two were committed with `human: null`.
- `pipeline/frames-prompt-regression.mts:5-9,26-46`: one hand-written regex per gated cycle. It names cycles such as `2026-08-30-what-stays-dark` and `camera-attitude` that have no training-ledger row.
- `lib/foundry/training/types.ts:93`: `verdict` includes `"unmeasurable"`, but it is never written (`store.ts:226`).

**The move.**
1. **Lifecycle module.** New pure `lib/foundry/training/lifecycle.ts`. A row's state is derived, never stored:
   - a reject becomes `closed-no-edit`;
   - an approve starts as `owed`, then `proposed` (a reflection sha exists), then `merged` (the sha is an ancestor of `main`), then `pinned` (a ledger pin exists and passes its surface), then `live`.
2. **Ledger schema 2.** Ledger rows gain `pins: [{surface, pattern}]`, written by the reflection step. `reflected` becomes `reflection: {sha, branch}`, and the file gets `schema: 2` because it is the cross-machine channel (`store.ts:9-15`).
3. **Derived regression.** `pipeline/frames-prompt-regression.mts` reads its pins from the ledger instead of its hand list. The existing hand pins are backfilled under the cycle ids they name, with a `ledgerless` marker for the missing rows.
4. **No row without a verdict.** `commitCycle` and the ledger writer refuse a row without `human: approve|reject`.
5. **Status surfaces.** New `pipeline/dojo-status.mts` prints the lifecycle table. It does the git ancestry checks, so the Next server never shells out. Rows that are owed for too long are flagged as advisory only, because a clock-dependent check may not block (blocking-by-input-determinism). `DojoView` shows the per-state counts with `Tally`.

**Why it is a moonshot / what it unlocks.** The dojo's product is prompt-surface edits, and today nobody can say which gated improvements are actually live in `main`. With this move the reflection queue becomes honest (4 items, not 13). Unmerged branches surface. The frames-prompt regression grows by itself with every approval instead of by a remembered edit.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `lifecycle({human:"reject", reflected:false})` → `closed-no-edit`.
2. An approved row whose `reflection.sha` is not an ancestor of HEAD in a tmp fixture repo → `proposed`, not `merged`.
3. The regression run with a ledger pin whose pattern is absent from its surface → exit 1 naming the cycle.
4. Migration: `reflected:"f33275c"` → `reflection.sha:"f33275c"`, and `"not-better:no-edit"` → `closed-no-edit`.
5. The ledger writer given a row with `human: null` → throws, and the file stays byte-identical.
6. `dojo-status --json` over the current ledger → exactly 4 `owed` rows.

**Write set.** new: `lib/foundry/training/lifecycle.ts`, `pipeline/dojo-status.mts`, `tests/golden-path/dojo-lifecycle.probe.spec.ts`; edit: `lib/foundry/training/types.ts`, `lib/foundry/training/store.ts`, `pipeline/foundry/training-ledger.json` (migration), `pipeline/frames-prompt-regression.mts`, `app/foundry/DojoView.tsx`, `package.json`, `.claude/dojo/config.md` (reflection step writes pins).

**Risks & rollback.**
- The GPU machine's loop writes the same ledger, so both checkouts must ship schema 2 together. The reader accepts v1 rows.
- Backfilled pins for ledgerless cycles must not invent verdicts. Mark them `ledgerless` and never `approve`.
- Rollback: the regression keeps its literal list behind a fallback, and the ledger reader tolerates `reflected`.

**First session dispatch.**
Read `lib/foundry/training/{types,store}.ts`, `training-ledger.json`, `pipeline/frames-prompt-regression.mts`, and `.claude/dojo/config.md:131-150,380-400`. Build `lifecycle.ts` as a pure function of (row, isAncestor, pinPasses) with probe cases 1, 2 and 4 first. Then move the regression onto ledger pins (case 3). Gate: `npm test`, `npm run check:frames-prompt`, `npm run typecheck`.

_Runner-up:_ one engine door for the Python lane. `dojo_judge.py:59` puts the Gemini key in the URL query, and `prepare` (`:93`) calls Gemini even on a `stack: local` cycle unless `--no-gemini` is passed. That contradicts the purity rule at `dojo_run.py:7-9`.

### foundry-dojo-B · Blind gate: the human picks per pair before seeing the judges

**Context:** foundry-dojo · **Slot:** B experience
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 3/10 · **Gate:** direction
**Registry:** software-engineering/eval-harness#judge-stability; software-engineering/measurement-honesty#minimum-sample-floors

**Summary.** The gate shows every pair labelled baseline/challenger, stamps "pick" on the chokepoint's choice, prints its reason, and then asks the human to approve the claim. The only judge that counts is anchored by the judge under evaluation, and judge-vs-human agreement cannot be measured per pair. The move makes the gate blind first: shuffled A/B per pair and a keyboard pick per pair. Then it unblinds, shows the judges, computes agreement, and only then takes the claim verdict.

**Premise (verified).**
- `app/foundry/DojoView.tsx:538-575`: `PairDuo` captions the arms `baseline` and `challenger`, rings and stamps "pick" on `judge_pick`, and prints `judge: … — reason`.
- `lib/foundry/training/types.ts:63` declares `judge_agreement?: {chokepoint_vs_human, gemini_vs_human}`, but no writer exists in `lib/` or `pipeline/foundry/*.py`. So `DojoView.tsx:299-303` never renders it.
- `.claude/dojo/config.md:146-147`: "none pinned yet (pin after >= 3 gated cycles show one tracking the human better…)". That is undecidable while the human gives one verdict per claim and none per pair.
- `training-ledger.json`: the judge's pick rate separates human approve from reject only weakly (AUC ≈ 0.69 over 17 rows). Pick rates fall in thirds and quarters, which means 3-4 pairs per improvement.
- `pipeline/foundry/dojo_judge.py:65-80`: the loop already gives each machine judge its own seeded A/B map (`choke_A`, `gem_A`). The human has none.

**The move.**
- **Verdict shape.** `TrainingVerdicts` per improvement becomes `{claim, pairs: {[pairId]: "A"|"B"|"tie"}}`, plus a `blindMap` seeded from cycle id + "human". It is persisted at first open, like `dojo_judge`'s rng.
- **Phase 1, blind.** Pairs appear as A/B in the human's map. There are no arm names, no judge chrome and no reasons. Keys 1, 2 and 0 pick per pair (`Keycaps`).
- **Phase 2, unblinded.** Arm names and judge picks appear, with per-pair agreement shown through `Tally`. Then the claim verdict is taken.
- **Commit writes the measurement.** `commitCycle` writes `judge_agreement`, `human_pick_rate` and `pairs_n` into the ledger row. With `pairs_n` below the floor, the row's verdict becomes `unmeasurable` (the type member already exists) unless the human overrides explicitly.
- **Pinning becomes a reading.** `DojoView` shows each judge's cross-cycle agreement series, so pinning a judge is something you read off, not a call someone makes.
- **Escape hatch.** "Skip blind" exists, but it records the verdict as `anchored`.

**Why it is a moonshot / what it unlocks.** The gate turns from a stamp over the judge into the measurement the whole loop is calibrated against. "Which judge to pin" becomes decidable after the three cycles the config asks for, and 3-pair cycles stop masquerading as verdicts. Keyboard picking also speeds up a gate the config names as the loop's binding constraint.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `blindMap` for cycle X is deterministic and independent of `choke_A`.
2. The blind-phase view model for a pair contains neither arm names nor the judge reason.
3. A claim verdict cannot be saved while any pair is unpicked in the blind phase, unless it is marked `anchored`.
4. Human `{p1:A→challenger, p2:B→baseline}` against judge `{p1:challenger, p2:challenger}` → `chokepoint_vs_human = 0.5` and `human_pick_rate = 0.5` on the ledger row.
5. `pairs_n = 2`, below a floor of 4, with no override → ledger verdict `unmeasurable`.
6. An old `verdicts.json` with one string per improvement still loads.

**Write set.** edit: `lib/foundry/training/types.ts`, `lib/foundry/training/store.ts`, `app/api/foundry/training/[id]/verdicts/route.ts`, `app/foundry/DojoView.tsx`, `app/foundry/foundryClient.ts`, `app/foundry/ui.tsx`; new: `tests/golden-path/dojo-blind-gate.probe.spec.ts`.

**Risks & rollback.**
- One keypress per pair on a gate that is already the bottleneck. Keyboard-first design and the `anchored` escape are the mitigation.
- Rollback: a phase-1 toggle.

**First session dispatch.**
Read `app/foundry/DojoView.tsx` in full, `lib/foundry/training/{types,store}.ts`, `pipeline/foundry/dojo_judge.py` prepare/park, and eval-harness `judge-stability`. Build the pure view model (blind map plus agreement math) with probe cases 1, 4 and 5 first, then the phase split in `DojoView`. Gate: `npm run typecheck`, `npm test`, `npm run check:narration`.

_Runner-up:_ power-aware cycles. The runner keeps rendering seed-matched pairs until a sequential test on the blind picks clears or a cap is reached, so n=3 is no longer a verdict.

_Checked:_
- Read in full: `dojo_run.py`, `dojo_judge.py`, `DEEP-READ-PROMPT.md`.
- Read in part: `dojo_pairs.py:1-80`, `lib/foundry/training/store.ts:1-80,200-262`, `types.ts:20-110`, `DojoView.tsx:1-60,530-600`, `.claude/dojo/config.md:125-165,380-407`.
- `training-ledger.json` computed this session.
- `dojo_measure.py`, `dojo_study.py` and `dojo_video*.py`: outlines only.

---

## probe-frame-data

### probe-frame-data-A · Corpus lockfile: frames addressed by content, manifests tracked, any clone re-materializes

**Context:** probe-frame-data · **Slot:** A architecture
**Size:** M · **Effort:** 5/10 · **Impact:** 7/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** software-engineering/dependency-declaration#logical-name-or-address

**Summary.** The 14 frame manifests this context owns are not in the repo. The `frames/*` ignore that keeps third-party pixels out also drops the manifests, which hold only timestamps and filenames, so on this clone none exists. Plans reference frames by bare filename, and two lanes reference another user's absolute path. No downstream grade can say which pixels it measured. The move tracks a hash-addressed lockfile, resolves references by logical name, and adds a verifying `materialize`. This is distinct from the frame_manifest v2 deck item: it adds identity and portability, not runtime binning.

**Premise (verified).**
- `.gitignore:102-104` ignores `/pipeline/vlm-probe/frames/*` and re-includes only `truth/`. `git ls-files pipeline/vlm-probe/frames` returns 2 truth files. All 14 manifests in `context-map.json` for this context are absent on disk.
- `pipeline/vlm-probe/identity.py:272-275`: "a fresh clone has none of them", previously surfacing as a bare `FileNotFoundError`.
- `pipeline/vlm-probe/clips/chain/lane.json:10` and `clips/ref2va/lane.json:10` hold `"hero": "C:\\Users\\kazda\\kiro\\gravitone-gcloud\\…"`: another machine and another user. This checkout is `mkdol`.
- `pipeline/foundry/plans/sweep-01.json:7-27` names scenes by filename (`lotr-scene-008.jpg`). `pipeline/foundry/forge.py:165-169` resolves them against the local frames dir with no identity check.
- `pipeline/vlm-probe/corpus.json` (tracked) holds slug, video id, url and duration, which is enough to re-fetch. `ingest.py:236-251` writes manifest rows with `frame/source/t_seconds`.

**The move.**
1. **Track the manifests.** `.gitignore` re-includes `frames/*-manifest.json`. Images stay ignored.
2. **Hash every frame.** Each manifest frame row gains `sha256`, a perceptual hash and `source_id` (the corpus.json id). These are additive fields on v2.
3. **Lockfile.** New `pipeline/vlm-probe/corpus.lock.json` maps frame name to `{slug, t_seconds, sha256, phash, extractor}`, generated from the manifests.
4. **Materialize.** New `pipeline/vlm-probe/materialize.py` fetches each missing entry through the existing fetch and ingest path, extracts at `t_seconds`, and verifies by perceptual hash. It reports one of three outcomes: exact, near (codec drift) or mismatch.
5. **Logical references.** New `pipeline/vlm-probe/refs.py` resolves `frame:<name>` and `lane:<lane>/<file>`. Lanes and plans switch to these. An absolute path raises "non-portable reference".
6. **Record what was read.** `forge.py` writes the `source_sha256` of the frame it actually read into `run.json`. Dojo readbacks do the same.
7. **Selftest.** A selftest fails on any tracked `pipeline/**/*.json` containing a drive-letter path.

**Why it is a moonshot / what it unlocks.** Probe evidence becomes reproducible on any machine. The GPU box and this checkout are different users today. Every grade and readback becomes traceable to exact pixels, so a re-ingest that silently swaps a frame can no longer change downstream verdicts invisibly. The context map also stops listing files that cannot exist on a clone.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `git check-ignore` on `frames/lotr-scene-manifest.json` → not ignored. A `frames/x.jpg` → still ignored.
2. `materialize.py --dry` on a clone with no frames → lists N missing, exit 0. With a corrupted local jpg → a `mismatch` row, exit 1.
3. `refs.resolve("frame:lotr-scene-008")` → the frames path. `refs.resolve("C:\\…")` → raises.
4. The selftest that scans tracked JSON for drive-letter paths fails today on `clips/*/lane.json` (red first) and passes after the rewrite.
5. `forge.py` stamps `source_sha256` on every scene in `run.json`.
6. The lockfile holds no pixel data (bounded bytes per entry).

**Write set.** edit: `.gitignore`, `pipeline/vlm-probe/frame_manifest.py`, `pipeline/vlm-probe/ingest.py`, `pipeline/vlm-probe/clips/chain/lane.json`, `pipeline/vlm-probe/clips/ref2va/lane.json`, `pipeline/foundry/forge.py`, `pipeline/foundry/selftest.py`; new: `pipeline/vlm-probe/corpus.lock.json`, `pipeline/vlm-probe/materialize.py`, `pipeline/vlm-probe/refs.py`.

**Risks & rollback.**
- Manifests name third-party sources, but `corpus.json` already does, so the exposure is not new.
- Re-extraction is not byte-identical, so verification uses the perceptual hash and the sha256 identifies the measured version.
- This must coordinate with the lane_record v2 deck item, whose replay reads lane files.
- Rollback: revert the ignore line. The resolver accepts bare names.

**First session dispatch.**
Read `pipeline/vlm-probe/{frame_manifest,ingest,extract_frames,identity}.py`, `corpus.json`, `.gitignore:88-150` and `forge.py:160-175`. Start with the drive-letter selftest (red first) and the ignore change. Then add sha256 and perceptual hash to the manifest write, then `materialize.py --dry`. Gate: `python pipeline/foundry/selftest.py`, `npm test` (unchanged).

_Runner-up:_ lanes as declared deltas. Use `extends:"reference"` plus `vary:{reference_joins_at:[0,0.25,0.45]}`, so face-only, e25 and late are one sweep, and compile prompts from the character and location slots instead of 8 verbatim copies (field census this session: `character` and `location` are identical in all 8 lanes and repeated inside every shot prompt).

### probe-frame-data-B · Truth by construction: every generated shot emits its own ground-truth sidecar

**Context:** probe-frame-data · **Slot:** B-architecture (no UI surface)
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** software-engineering/test-input-generation#model-based-oracle; media-generation/generated-output-grading#vision-model-grading-schema

**Summary.** Accuracy, as distinct from agreement, is measured on exactly two frames with 3 and 5 graded fields. Meanwhile the lane configs hold a fixed-seed population of generated shots whose size, angle and focus were dictated in the prompt. The move compiles lane prompts from typed craft specs and emits a truth sidecar per rendered shot for the dictated fields. A blind check admits each label, so the truth set grows with every lane run and generator disobedience becomes its own finding.

**Premise (verified).**
- `pipeline/vlm-probe/frames/truth/arcane.json` (3 graded fields) and `duel-keyframe.json` (5) are the entire truth set. duel-keyframe's `_source` is itself a generated frame: "We wrote the generating prompt, so the intent is known".
- `pipeline/vlm-probe/score.py:11-15,95-99` reports accuracy only "where a `frames/truth/<stem>.json` file exists", and agreement everywhere else.
- `pipeline/vlm-probe/shots/reference/lane.json` states craft in prose per shot: "Extreme wide shot … Low camera near the floor. Deep focus." / "Medium shot … slightly above eye level" / "Tight close-up … low angle … Shallow focus."
- `pipeline/vlm-probe/reconcile.py:17-19` pursues "a truth set that scales" by having a model correct the annotations. Yet `reconcile.py:190` says "Only a blind pass is a truth set", so model adjudication is agreement with an anchor.
- 6 shot lanes share seed 770425 and 3 shots each (field census this session), a re-renderable population.

**The move.**
1. **Typed spec and compiler.** New `pipeline/vlm-probe/craft_spec.py` defines a typed spec over `schema.py`'s `ENUM_FIELDS` (shot_size, camera_angle, depth_of_field, lighting_key…) and a compiler from spec to the prose clause now hand-written in each shot.
2. **Lane shots become specs.** Each shot becomes `{spec, extra, legacy_prompt}`. A drift check asserts the compiled clause is contained in the legacy prompt, so the visual experiment does not change.
3. **Sidecars on render.** `consistency.py` writes `<shot>.truth.json` with `basis:"dictated"`, the seed and the spec digest.
4. **Blind admission.** New `pipeline/vlm-probe/truth_admit.py` admits labels blind: the human or two independent model reads see the image without the label. The result is `dictated+confirmed` or `dictated-disputed`.
5. **Scoring.** `score.py` reads truth from `frames/truth/` and from confirmed shot sidecars, shows `basis` per row, and lists disputed fields under a separate generator-compliance table.

**Why it is a moonshot / what it unlocks.** The probe's weakest number (accuracy on n=2) becomes a growing population at zero labelling cost. Two failures that are currently conflated get separated: the generator not obeying (disputed) and the eye misreading (confirmed truth, wrong read). It also gives the forge's craft grade (foundry-forge-A) a real truth anchor.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `compile({shot_size:"extreme-wide", camera_angle:"low", depth_of_field:"deep"})` contains "Extreme wide shot", "Low camera" and "Deep focus".
2. Compiled clauses for `shots/reference/lane.json`'s three shots are substrings of their legacy prompts.
3. A spec value outside `ENUM_FIELDS` → `ValueError` naming the field.
4. `score.py` over a run with 3 confirmed sidecars → "ground truth available for" lists them, and accuracy shows n=3 per field with basis.
5. A `dictated-disputed` sidecar is excluded from accuracy and counted under generator compliance.
6. A spec-digest mismatch between sidecar and lane → the sidecar is unscored, never silently used.

**Write set.** new: `pipeline/vlm-probe/craft_spec.py`, `pipeline/vlm-probe/truth_admit.py`; edit: `pipeline/vlm-probe/consistency.py`, `pipeline/vlm-probe/score.py`, `pipeline/vlm-probe/schema.py`, `pipeline/vlm-probe/shots/*/lane.json` (6 files), `pipeline/foundry/selftest.py` (vlm cases).

**Risks & rollback.**
- Must stay compatible with lane_record v2 replay and resume (deck item). Add fields only and keep the argv shape.
- Confirmed yield may be low if the generator disobeys often. That is a finding, not a failure.
- Rollback: lanes keep `legacy_prompt` and `score.py` ignores sidecars.

**First session dispatch.**
Read `pipeline/vlm-probe/{schema,score,consistency,lane_record}.py`, both truth sidecars and `shots/*/lane.json`. Build `craft_spec.py` with cases 1-3 as selftest cases, then sidecar emission and the `score.py` read (cases 4-5). Gate: `python pipeline/foundry/selftest.py` (add a vlm-probe section), `npm test`.

_Runner-up:_ a disagreement-to-truth adjudication queue in `/foundry`. `score.py --show-disagreements` becomes a field-by-field human settle, written back as truth sidecars with `basis:"human"`.

_Checked:_
- Read: `frames/truth/*.json` in full, all 8 `lane.json` (field census), `corpus.json` head, `frame_manifest.py:1-60`, `reconcile.py:1-60`, `identity.py:265-285`, `.gitignore:83-150`.
- `score.py` truth paths found by grep.
- Hypothesis confirmed: the 14 manifests are ignored and untracked, not deleted.

---

## pipeline-scripts

### pipeline-scripts-A · One gate registry: verify, CI and hooks projected from a single declaration

**Context:** pipeline-scripts · **Slot:** A architecture
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** software-engineering/quality-gates#policy-projection (+ #prose-rule-drift, #gate-liveness)

**Summary.** The blocking gate set is written out by hand in three places, and the copies have already diverged:
- CI skips three gates that `npm run verify` runs, while pre-push claims the two are the same set;
- the pre-push skip banner names 6 of 13 gates;
- a regression script exits 0 on failure and is wired to nothing.

The move declares each gate once, with its inputs and outcome protocol. A runner reports every verdict, and the other three copies are derived from that declaration.

**Premise (verified).**
- `package.json:23`: `verify` chains 13 steps with `&&`, including `check:narration`, `check:clips` and `check:style-refs`.
- `.github/workflows/gates.yml:265-331`: the blocking job runs typecheck, lint:ratchet, manifest, notebook, type, trailer-structure, frames-prompt, test, build and bundle. A grep finds no narration, clips or style-refs step.
- `.githooks/pre-push:4-7` says it runs "`npm run verify` (the exact blocking set of the `gates` CI job…)". `:33` lists "typecheck, lint:ratchet, check:manifest, test, build, check:bundle".
- `pipeline/gate-regression.mts:24-34` counts `bad` and prints "REGRESSION FAILURE(S)", but never sets an exit code. It is referenced by neither `package.json` nor `gates.yml`.
- `pipeline/check-bundle.mjs:34-38` and `check-manifest.mjs:11-15` define 0 (pass), 1 (fail) and 2 (could-not-run). The `&&` chain flattens all of them into "stop at the first non-zero".
- `gates.yml:7-9`: "a check that runs only locally is a courtesy, not a gate".

**The move.**
- **Registry.** New `pipeline/gates.mts`: a typed list of `{id, npmScript, inputs: globs, class: blocking|advisory, rationale (the gates.yml grading prose moves here), needs: ["build"], outcomes: "012"|"01", registry}`.
- **Runner.** New `pipeline/run-gates.mts`:
  - runs independent gates in parallel and respects `needs`;
  - collects every verdict instead of stopping at the first failure;
  - reports exit 2 as could-not-run;
  - prints one table and writes `.gate-report.json`.
  - `--changed` adds a local-only input-digest skip. CI always runs everything (determinism).
- **Derived copies.**
  - `verify` becomes `tsx pipeline/run-gates.mts --blocking`.
  - The `gates.yml` blocking job either runs that single step, or a probe asserts its steps equal the registry.
  - The pre-push banner prints from `--list`.
  - `check-manifest` refuses any `pipeline/*-regression.mts` or `check-*` that is neither registered nor listed with an `unregistered: <reason>` (gate-liveness).
- **Repair the dead gate.** `gate-regression.mts` gets an exit code and an entry.

**Why it is a moonshot / what it unlocks.** It restores the stated contract "verify == CI". Adding a gate becomes a one-entry change. One run shows every failure instead of the first, and parallelism takes minutes off every push to `main`. Could-not-run stops masquerading as fail. The three gates that silently were not blocking in CI become decidable.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A consistency probe: blocking registry ids equal the `npm run` targets of the `gates.yml` blocking job. It fails today on narration, clips and style-refs (red first).
2. `run-gates` with two failing stub gates → both reported, exit 1. A stub exiting 2 alone → reported as could-not-run, exit 2.
3. A gate with `needs:["build"]` never starts before build ends. Independent gates overlap (recorded timestamps).
4. `gate-regression.mts` with a broken `PROBES` entry → exit 1.
5. `check-manifest` fails on a new unregistered `pipeline/foo-regression.mts`.
6. The pre-push banner text equals the registry's blocking list (snapshot).

**Write set.** new: `pipeline/gates.mts`, `pipeline/run-gates.mts`, `tests/golden-path/gate-registry.probe.spec.ts`; edit: `package.json`, `.github/workflows/gates.yml`, `.githooks/pre-push`, `pipeline/gate-regression.mts`, `pipeline/check-manifest.mjs`, `.ai/SPEC.md` (if the manifest rule needs an id), `docs/DEPLOYMENT.md`.

**Risks & rollback.**
- This touches CI and the pre-push policy. It must only tighten.
- Before marking the three missing gates blocking in CI, prove each is input-deterministic (the `gates.yml` grading rule) and runs in a clean CI checkout. `check:clips` may depend on files; if a gate is not deterministic it becomes advisory there, with its reason recorded.
- Parallel `build` and `npm test` contention.
- Rollback: keep the old chain as `verify:serial`.

**First session dispatch.**
Read `package.json` scripts, `.github/workflows/gates.yml` in full, `.githooks/pre-push`, `pipeline/check-manifest.mjs`, and the headers of `check-narration.mjs`, `check-clips.mjs` and `style-ref-stability.mts` (are they input-deterministic?). Write the consistency probe (case 1) and watch it fail. Then build `gates.mts` and `run-gates.mts`. Gate: `npm run typecheck`, `npm test`, `npm run verify`.

_Runner-up:_ finish retiring the nine `drive-*.mjs`. `playwright.live.config.ts:13` says the live lane "replaces" them, yet all nine remain, with private ports (3182-3184) and their own PASS/FAIL vocabulary. Port the unique assertions into `tests/live` and delete the rest.

### pipeline-scripts-B · Recorded-engine lane: drive the real reasoning routes end-to-end without a model

**Context:** pipeline-scripts · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/test-harness#recorded-interaction-fixtures (+ #approval-snapshots-with-guarded-update)

**Summary.** Every journey that crosses a reasoning turn is verified against a stand-in:
- the live lane's research run is a mocked local clock;
- recalibration has a `simulated` engine;
- the drivers assert "the simulated transform's answer" or print NOT VERIFIED.

So `/api/research`, `/api/recalibrate` and `/api/frames` have never run end-to-end in any lane: prompt assembly, schema handling, validators, receipts and the failure taxonomy. The move adds a replay provider behind the text router, plus a recorder, and moves the reasoning journeys and the three driver suites onto recorded turns.

**Premise (verified).**
- `tests/live/golden-path.live.spec.ts:246-247`: "The mocked run is a local clock at SPEED× (useResearchRun.ts) — no network, no vendor".
- `app/_phases/script/recalibrate.ts:180` sets `engine: "simulated"`. `pipeline/drive-recalibration.mjs:205-207`: "Asserting a specific cell here was asserting the simulated transform's answer."
- `pipeline/drive-studio.mjs:52` prints "NOT VERIFIED BY THIS RUN … Treat them as unverified." `pipeline/drive-research-step.mjs:14-17` says its previous version "had been failing at its first click ever since".
- `lib/text/router.ts:91-115`: the PLAN and PROVIDERS tables are the single seam, and the providers are only `claude-cli` and `google`. A grep for replay or cassette in `lib/text` finds nothing.
- `lib/text/log.ts:19-26`: the prompt is never persisted, so a cassette must key on a digest and store only the response.

**The move.**
- **Replay provider.** New `lib/text/providers/replay.ts` (id `replay`). Add a new `TextTransport` value `"replay"`, so a replayed answer can never pass as a real one (the ladder's inspectability rule).
- **Cassettes.** Each cassette is keyed by `sha256(turn + "\n" + prompt)` and stored as `tests/cassettes/text/<turn>/<digest>.json` holding `{text, recordedProvenance, recordedAt}`. A fault form `{fault:"timeout"|"bad-response"|"refused"|"no-key"}` drives the failure UIs.
- **Posture.** `TEXT_ENV=replay` (`env.ts`) makes the plan replay-only. Like `lib/devAuth.ts`, it is refused in production builds and needs an explicit opt-in. A missing cassette throws a typed `no-cassette` error naming the digest, and never falls through to a real engine.
- **Recorder.** `TEXT_RECORD=<dir>` writes cassettes after real turns. New `pipeline/record-cassettes.mts` records the seed set once against the demo seed project (prompts built from committed fixtures, no creator data).
- **Journeys.** New `tests/live/reasoning-routes.live.spec.ts` runs research, recalibrate and frames under replay, including one fault journey per route. The research-step, recalibration and script-step drivers are ported there, then deleted.
- **Staleness.** A prompt edit changes the digest, which turns the lane red with a "re-record" remedy (guarded snapshot update).

**Why it is a moonshot / what it unlocks.** The most expensive and failure-prone paths gain a deterministic, free lane that CI can run. Prompt edits to `RESEARCH-PROMPT.md` and `FRAMES-SCENE-PROMPT.md` become visibly test-affecting. The bad-response and rung-4 refusal UIs get exercised for the first time. It composes with text-engine-A, whose settled turns are natural recordings.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `TEXT_ENV=replay` with the cassette present → `reason()` returns the recorded text with `provenance.transport === "replay"`.
2. Cassette absent → `TextError` kind `no-cassette` with the digest in the message, and neither real provider is constructed.
3. Recorder with `TEXT_RECORD=tmp` and a stub provider → a cassette is written and contains no 40-char slice of the prompt.
4. A fault cassette `{fault:"bad-response"}` → `/api/research` returns 502 with `code:"bad-response"`.
5. Live lane: the research journey on `FRESH_PROJECT` under replay lands a notebook whose receipt shows transport `replay`.
6. A one-character edit to `pipeline/RESEARCH-PROMPT.md` → the research journey fails with `no-cassette`, which proves the keying.
7. A production build with `TEXT_ENV=replay` → refused at boot (probe on the env predicate).

**Write set.** new: `lib/text/providers/replay.ts`, `tests/cassettes/text/**`, `tests/live/reasoning-routes.live.spec.ts`, `pipeline/record-cassettes.mts`, `tests/golden-path/text-replay.probe.spec.ts`; edit: `lib/text/router.ts`, `lib/text/env.ts`, `lib/text/types.ts`, `lib/text/errors.ts`, `playwright.live.config.ts`; delete after porting: `pipeline/drive-research-step.mjs`, `pipeline/drive-recalibration.mjs`, `pipeline/drive-script-step.mjs`.

**Risks & rollback.**
- Replay must be impossible in production. Add the production predicate and a `check-bundle`-style assertion that `providers/replay` is not reachable from a prod route path.
- Large answers bloat the clone, so commit only the seed set.
- Rollback: the provider and env are additive. Delete them.

**First session dispatch.**
Read `lib/text/{router,env,types,errors}.ts`, `tests/live/golden-path.live.spec.ts` in full, `playwright.live.config.ts`, `lib/devAuth.ts`, and test-harness `recorded-interaction-fixtures`. Build `replay.ts` with probe cases 1-3 first, then one live journey (research, case 5). Gate: `npm run typecheck`, `npm test`, `npm run test:live`.

_Runner-up:_ an input-scoped `--changed` mode for the live lane, so a push that touches no route, prompt or component under a journey skips it locally (change-scoped-work-selection, local only).

_Checked:_
- Read in full: `package.json` scripts, `.githooks/pre-push`, `gate-regression.mts`, `frames-prompt-regression.mts`, `drive-studio.mjs`.
- Read in part: `.github/workflows/gates.yml` (1-80 plus a step grep), `preflight.mts:1-80`, `check-bundle.mjs:1-60`, `check-manifest.mjs:1-40`, `drive-recalibration.mjs` (head and tail), `drive-research-step.mjs` (head), `playwright.live.config.ts:1-40`, `tests/live/golden-path.live.spec.ts:1-40,218-276`.
- `lint-ratchet.mjs` and `check-type-scale.mjs`: wiring only.

---

## data-asset-probes

### data-asset-probes-A · Effect-log harness: enumerate every crash point and interleaving of the foundry commits

**Context:** data-asset-probes · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** software-engineering/durable-agent-operations#recovery-prefix-enumeration; software-engineering/concurrency-guards#race-catalog-with-two-histories

**Summary.** The three foundry commits are multi-effect sequences over shared, git-tracked indices. Their probes each hand-pick one failure. The move routes every commit effect through a recordable fs port. A probe then enumerates every prefix crash and the index-boundary interleavings of two commits, and asserts invariants. That will surface the lost-update race on `styles.json` and `ledger.json`, which today's concurrency probe passes by construction.

**Premise (verified).**
- `lib/foundry/store.ts:240-298`: `commitRun` reads and writes the ledger, then reads and writes styles, then unlinks rejects, then writes findings, verdicts and `run.json`. `c.deleted` lives in memory until the last write.
- `lib/foundry/store.ts:258` (`commitRun`) and `lib/foundry/extract/store.ts:352` (`commitExtractRun`) both read-modify-write `pipeline/foundry/styles.json` with no lock. `runStore.writeJsonAtomic` prevents torn files, not lost updates. `extract.mts --commit` (`README.md`, headless cull) writes from a second process.
- `lib/foundry/training/store.ts:213-233`: `commitCycle` read-modify-writes `training-ledger.json` the same way.
- `tests/golden-path/foundry-commit-indices.probe.spec.ts:198-215` simulates the crash with one hand-written `rewindToDone`. `tests/golden-path/foundry-run-store.probe.spec.ts:102-115` asserts that concurrent writes "both resolve without collision" and accepts either writer's content, so a lost update passes.
- `lib/foundry/store.ts:21`, `extract/store.ts:21` and `training/store.ts:29` import `node:fs/promises` directly, so there is no seam to interpose.

**The move.**
1. **The port.** New `lib/foundry/fsPort.ts`: an `FsPort` of `{readJson, writeJsonAtomic, unlink, copyFile, writeFile, mkdir, stat}`, real by default. The three stores take it through a probe-only setter (the same posture as `FOUNDRY_DIR`).
2. **The harness.** New `tests/golden-path/_effects.ts`:
   - a recording port that logs effects and can throw at effect k;
   - a deterministic scheduler that interleaves two commits at their index read and write boundaries. That is about 6 points each, so it stays bounded.
3. **Invariants.**
   - I1: every ledger keep row has its file.
   - I2: every unlinked file has a ledger row, because destruction must follow the record.
   - I3: a retry after a crash at any k converges to the uninterrupted end state.
   - I4: two concurrent commits of different runs leave both runs' rows and evidence.
   - I5: `styles.json` evidence per style equals that style's ledger rows.
4. **The fix lane.** `runStore.updateJson(file, fn)` adds a per-file async mutex inside the process, plus compare-and-swap on a content digest across processes, with a bounded retry.

**Why it is a moonshot / what it unlocks.** Hand-picked crash cases become a derived population, and coverage becomes the number of prefixes enumerated, printed by the probe. It finds a real way to lose human verdicts, which are the most expensive data in the foundry. The harness is reusable for every future disk store: sound, the text turn store from text-engine-A, and the dojo ledger.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The recording port over `commitRun` (3 candidates) logs effects in the documented order: ledger, then styles, then unlinks, then `run.json`.
2. For every k in 1..K: crash at k, then retry → final ledger, styles and `run.json` deep-equal the no-crash result (I3). K is printed.
3. Crash between the unlinks and `run.json` → I1 and I2 hold after the retry.
4. A forge commit A interleaved with an extract commit B so both read `styles.json` before either writes → A's evidence and B's styles are both present. Fails today (I4, red first).
5. The same interleaving for two `commitCycle` runs on `training-ledger.json`.
6. `updateJson` with an external write between read and write → retries and merges, never overwrites.

**Write set.** new: `lib/foundry/fsPort.ts`, `tests/golden-path/_effects.ts`, `tests/golden-path/foundry-commit-crash.probe.spec.ts`, `tests/golden-path/foundry-commit-race.probe.spec.ts`; edit: `lib/foundry/runStore.ts`, `lib/foundry/store.ts`, `lib/foundry/extract/store.ts`, `lib/foundry/training/store.ts`, `tests/golden-path/foundry-run-store.probe.spec.ts` (tighten to assert both updates).

**Risks & rollback.**
- The foundry-engine deck item (commit preview plan with HMAC token) edits the same commit functions. Sequence this after it, or share the port.
- Keep interleavings bounded to index boundaries so the probe stays fast.
- Rollback: the port defaults to the real fs, and the probes are additive.

**First session dispatch.**
Read `lib/foundry/{runStore,store}.ts`, `extract/store.ts:300-420`, `training/store.ts:150-262`, the three existing commit probes, and `recovery-prefix-enumeration` (resolve via `../ai-registry/knowledge/software-engineering/index.json`). Build `fsPort` and the recording port. Write case 1, then case 4, which must be red. Gate: `npm test`, `npm run typecheck`.

_Runner-up:_ a tracked-index contract probe. Every tracked `ledger.json`, `styles.json` and `training-ledger.json` is validated against a schema plus cross-file invariants (evidence vs ledger, thumbs vs ledger rows) on every `npm test`.

### data-asset-probes-B · Notebook corpus lane: every tracked notebook walks the one validation door

**Context:** data-asset-probes · **Slot:** B-architecture (no UI surface)
**Size:** M · **Effort:** 5/10 · **Impact:** 7/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** software-engineering/structured-output#schema-validation-and-repair (one-validation-door); software-engineering/test-harness#approval-snapshots-with-guarded-update

**Summary.** Every notebook probe asserts against one hand-retyped fixture. Meanwhile the tree tracks five real notebooks from terminal research runs, written in a second dialect (snake_case NOTEBOOK-SCHEMA) that no code reads, and their top-level keys drift from run to run. The move adds a dialect adapter and a lane whose population is derived from `git ls-files`. Each tracked notebook goes through `parseNotebook`, `notebookIssues` and the consumers, with an approved per-file verdict snapshot.

**Premise (verified).**
- `app/_phases/_shared/notebook/notebook.ts:1-3` and `types.ts:4-6`: the fixture is run 1 "verbatim … retyped" by hand from `pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/notebook.json`.
- `tests/golden-path/notebook-graph.probe.spec.ts:30-34` and `shared-notebook-contracts.probe.spec.ts:20-36`: the populations are `NOTEBOOK` and clones of it. `pipeline/check-notebook.mts:24-27` checks the fixture only.
- Tracked: `gauntlet/runs/2026-08-12-l1-first-sweep/l2/{conflict-osint,creator-economy,news-reaction,public-corruption}/notebook.json`, plus the run-1 notebook. All use snake_case (`counter_positions_to_state_fairly`, `analogy_candidates`). Their top-level key sets differ: `_meta`, `card_dimension` and `domain_fill` in one file; `$schema` and `id` in others.
- A grep finds no module under `app/`, `lib/` or `pipeline/` that reads snake_case notebook keys. They appear only in comments in `types.ts`.
- `lib/notebook/validate.ts:631-643`: `parseNotebook` is the app's door (camelCase), and it already calls `notebookIssues` (`validate.ts:610`).

**The move.**
- **Dialect adapter.** New `lib/notebook/dialect.ts` provides `detectDialect(raw)` and `fromSchemaDialect(raw)`: snake_case to camelCase through an explicit field map taken from NOTEBOOK-SCHEMA.md's field tables. Unknown keys are counted and reported as `unmapped`, never dropped silently.
- **Derived population.** New `tests/golden-path/notebook-corpus.probe.spec.ts`. Its population is `git ls-files "*notebook.json"`, derived and not listed. Each member goes through the adapter, then `parseNotebook`. Accepted members then run through `notebookIssues`, `buildCards`, `railFor` and the score-spot origin consumer without throwing.
- **Approved snapshot.** Each member yields `{verdict, findings by rule, unmapped}`, compared to an approved snapshot at `tests/golden-path/__snapshots__/notebook-corpus.json`. Updating it needs `NOTEBOOK_CORPUS_UPDATE=1` and prints the diff.
- **Fixture check.** A fixture-vs-source check adapts run 1 and diffs it field by field against `NOTEBOOK`. Only the declared "revised by follow-up round 1" fields may differ.
- **Gate.** `check-notebook.mts` walks the same corpus.

**Why it is a moonshot / what it unlocks.** The validator, graph checker and consumers get tested against what engines actually write, not one curated instance. Schema drift between runs becomes a reviewable snapshot diff. The adapter is also the importer that lets a terminal research run open in the studio.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A new tracked `notebook.json` not in the snapshot → the probe fails with "unapproved corpus member <path>".
2. `fromSchemaDialect(conflict-osint)` → `counterPositions` and `analogyCandidates` arrays present, and the keys it did not map listed in `unmapped`.
3. Each member's `parseNotebook` verdict and finding counts equal the snapshot.
4. No consumer throws on any accepted member.
5. Run 1 adapted vs the `NOTEBOOK` fixture → the diff is confined to the declared follow-up fields.
6. Snapshot rewrite without the env flag → refused, with the diff printed.

**Write set.** new: `lib/notebook/dialect.ts`, `tests/golden-path/notebook-corpus.probe.spec.ts`, `tests/golden-path/__snapshots__/notebook-corpus.json`; edit: `pipeline/check-notebook.mts`, `lib/notebook/validate.ts` (export `normalise`), `pipeline/NOTEBOOK-SCHEMA.md` (field map table if missing).

**Risks & rollback.**
- Gauntlet L1 notebooks may be far from conformant, so the snapshot records rejections. That is evidence, not failure.
- Exclude untracked worktree copies (`.claude/worktrees/**`) by using `git ls-files`.
- Rollback: probe-only. Delete it.

**First session dispatch.**
Read `lib/notebook/validate.ts` in full, `app/_phases/_shared/notebook/types.ts`, `pipeline/NOTEBOOK-SCHEMA.md`, one gauntlet `notebook.json`, and the two notebook probes. Build the derived population plus `detectDialect` (cases 1-2) first, then the snapshot. Gate: `npm test`, `npm run check:notebook`, `npm run typecheck`.

_Runner-up:_ score-spot origin over the same corpus. Every accepted notebook's facts become cue origins, and their provenance pins are checked, so the music-placement contract is exercised beyond the one fixture.

_Checked:_
- Read: `notebook-graph.probe.spec.ts` in full, `foundry-commit-indices.probe.spec.ts:1-50,195-215`, `foundry-run-store.probe.spec.ts:100-118`, and the test lists of all 9 context probes plus their foundry siblings; `shared-notebook-contracts.probe.spec.ts:1-50`, `check-notebook.mts:1-30`.
- Read: `lib/foundry/store.ts:225-298`, the commit grep in `extract/store.ts`, `training/store.ts:200-262`, `runStore.ts:1-80`.
- Key census of the 5 tracked notebooks.
- Hypothesis confirmed: there is no lock or compare-and-swap on the shared indices.
