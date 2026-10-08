# Moonshot cards · Imaging Music

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

Contexts covered: imaging-service, character-consistency-testing, vlm-frame-annotation, music-service.

> Map drift noticed while reading. The `music-service` description in `context-map.json` still says "/playground provides four interactive benches". That is no longer true. `/playground` is now the three-module Sound lab (triage / arrange / hunt) over `lib/sound` (`app/playground/PlaygroundView.tsx:3-23`), and the context map does not list `lib/sound/*`. This is a note for the next subtree scan, not a card.

---

## imaging-service

### IMG-A · One spend kernel for every paid call: a durable ledger shared by imaging, music and text

**Context:** imaging-service · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** software-engineering/cost-metering#usage-ledgers, #budget-enforcement, #reversible-debit-and-settle, #unit-classes-are-open

**Operator decisions (2026-10-07) - read before building stage 3.**

- **(3a) Question (superseded by the 3a, revised entry below):** "Should the spend meter survive restarts and be shared across processes?" **Operator chose:** "Decide with hosted state later". **Consequence:** stage 3a is held. That covers the file-backed `SpendStore` under `foundry-out/spend/`, cross-process holds and TTL reclaim, i.e. acceptance cases 1, 2 and 5. The meter stays in-process, C3 stays partial, and 3a reopens only when hosted state is decided. **Constraint the repo shows:** this card's own Risks line says the cloud posture has no shared disk, and `lib/deployment.ts` names Cloud Run as the SaaS target (lines 8-9 and 54). **Alternative that lost:** the file-backed JSONL ledger plus holds file that 'The move' prescribes.
- **(3a, revised) Question:** the same as above, reopened by ask c4c3335e. **Operator chose:** 'Local now, hosted later' (ask c4c3335e, 2026-10-07). **Consequence:** build 3a as a local file spend store behind one async interface that a GCS adapter can fill later; AIO-A's hosted ledger waits for the AUP-A vault call. This supersedes 'Decide with hosted state later' above. **Landed:** `42918cc` (async store and meter), `717f366` (file spend store with a cross-process lock, dead-owner TTL reclaim, the managed posture refused), `2aaad00` (one spend window per machine via `lib/spend/select.ts`, node test lane pinned to memory). spend-ledger probe cases 1-6 are green; the file store measured p50 3.08 ms and p95 3.90 ms per reserve+settle (n=200, Windows 11). **Alternative that lost:** holding 3a until hosted state is decided.
- **(3b) Question:** "Should text turns get a spend ceiling, and may it refuse a turn?" **Operator chose:** "Count only, refuse nothing". **Consequence:** the `text-usd` class books priced rows (basis `vendor`, from the claude-cli `total_cost_usd`) and counts unpriced turns (no $0 row), and has no ceiling and no refusal. Acceptance case 4 stands. The card's per-class ceiling and fail policy for `text-usd`, and its "gets a limit for the first time" claim, are superseded for text. **Alternative that lost:** a `text-usd` ceiling with a stated open or closed fail policy, as 'The move' prescribes.
- **(3c) The App Master's calls on the 3a resume's four questions.** **Q1:** keep the loud refusals: `SPEND_STORE=file` on the managed posture throws `HostedSpendStoreNotBuilt`, and an unknown `SPEND_STORE` value throws. **Q2:** whether music rows store their quote is decided in the MUSIC-B honest-meter stage; the App Master leans to storing it. **Q3:** `playwright.live.config.ts` stays unpinned, because it is the real app. **Q4:** `GET /api/spend` reads fresh, never `seenSpendRows`. ~~**Open:** `GET /api/spend`, queued; C3 reads closed only when it lands.~~ Superseded by (3d).
- **(3d) GET /api/spend landed.** **Question:** how does a reader see every class's spend in one window? **Chose:** one fresh projection, `lib/spendView.ts`, behind `GET /api/spend` with `guardAccessOnly`, per (3c) Q4. **Consequence:** `86c0ab1` (cherry-pick -x of held run 3799b387's commit, diff unchanged; 7 files: `app/api/spend/route.ts`, `lib/spendView.ts`, one additive read export each in `lib/imaging/budget.ts` and `lib/music/budget.ts` (`imagingSpendWindow`, `musicSpendWindow`), `tests/golden-path/spend-view.probe.spec.ts` with 6 cases, and one row each in the deployment-cells and access-only-401 probes). The view reads each meter's `stats(now)` and `byAxis(now)` at one `now`, and every class carries its own `windowMs`, `windowStart` and `windowEnd`. `text-usd` is count-only and has none of `ceiling`, `floor`, `held`, `remaining`, `underFloor`, following (3b). A read does not consume the origin rate limiter (probe case 5). Probe case 4: a real tsx child books $0.40 of imaging and 12 s of music on the file store, and this worker's GET shows both. Census `bbb0f28` (files 544->545, `app/api` 76->77). Gates at merge: typecheck, `lint:ratchet`, `check:kit-census` and the full `npm test` (1807 passed, 1 skipped), all exit 0. **Measure:** `spendView()` on the file store with one imaging row booked, after one warm-up call: p50 127.13 ms, p95 300.16 ms, n=50, Windows 11 Home 10.0.26200, measured on the same diff before the rebase. **Reroute evidence:** a billed failure reroutes under a fresh hold, in `tests/golden-path/imaging-budget-holds.probe.spec.ts` at :406 (case 9), :425 (case 10) and :451 (case 11). The first attempt was held because the census counts `git ls-files`: its builder ran the census check before the route was committed, so it passed, then the merge gate's kit-catalog probe failed; the resume regenerated the census after the commit existed. C3 and IMG-A close for milestone 1. **Residue (recorded, not decided):** the hosted (GCS) store is held by 'Local now, hosted later' (ask c4c3335e); `npm run verify`'s build and bundle gates have not run for this change, because Turbopack refuses the headless worktree's `node_modules` junction, so 'npm run verify exits 0' is open as for C1 and C2 and the question is with the operator; `MUSIC_BUDGET_FLOOR_SECONDS` is missing from `.env.example` (0 hits at `bbb0f28`); whether music rows store their quote ((3c) Q2) waits for the MUSIC-B honest-meter stage. **Constraint the repo shows:** the kernel imports no adapter, so the view lives outside `lib/spend/`; the census counts `git ls-files` (header of `pipeline/kit-census.mts`), so a census check run before the commit passes vacuously. **Alternative that lost:** reading `seenSpendRows` or a store's `lastSeen`, which goes stale (Q4).

**Summary.** Today there are three engines and three spend stories. Imaging has an in-memory USD ledger with holds. Music has a separate in-memory seconds ledger that checks and then records, with no hold. Text has no ceiling at all. This card lifts the reserve → settle → book kernel out of `lib/imaging/budget.ts` into `lib/spend/`, behind one store that survives a restart and is shared across processes, with one ceiling per unit class. Every metered call in the repo then sits under one limit that can be read.

**Premise (verified).**
- `lib/imaging/budget.ts:21-25` and `:141,152`: the ledger and the active holds are module-level `let` and `Map`. The file says "per-process: good enough for a single-instance prototype; a scaled-out deployment would move the ledger to a shared store". `lib/deployment.ts:54` names Cloud Run (`K_SERVICE`) as the SaaS target, so every cold start and every instance gets a fresh $5 window.
- `lib/music/budget.ts:37-40` repeats the same per-process caveat. `:211` `assertWithinMusicBudget` is check-only, and `lib/music/elevenlabs.ts:101` then `:106` records only after the vendor returns. That is the check-then-act race imaging closed with holds at `lib/imaging/budget.ts:143-152,338-369`.
- `lib/text/router.ts:204-255` (`reason()`) walks the chain with no reserve or settle. `grep budget lib/text` finds only comments. Meanwhile `lib/text/pricing.ts:11-13` says every `claude-cli` turn carries a vendor-reported `total_cost_usd`. That is real spend with no ceiling, behind `app/api/research`, `app/api/frames` and `app/api/recalibrate`.
- `pipeline/direct-frames.mts:181`, `pipeline/build-style-trials.mts:136` and `pipeline/foundry/dojo-pairs-nb.mts:68` import `lib/imaging/router` in their own Node process. Each one therefore has a private $5 window that the Next server's window cannot see.
- The registry golden path (cost-metering, "A ledger, not a log") says spend rows "live on the product's transactional retention terms, not telemetry's". Under usage-ledgers, "deleting run history visibly lowers enforced spend" is the listed failure, and a process restart does exactly that here.

**The move.**
- New `lib/spend/`:
  - `classes.ts` defines `SpendClass = "imaging-usd" | "music-audio-s" | "text-usd"`. Each class carries its ceiling env var, window and fail policy (open or closed, stated per class).
  - `store.ts` is a `SpendStore` interface. The first adapter is a file-backed JSONL ledger plus a holds file under `foundry-out/spend/`, using the exclusive-create lock and tmp+rename idiom already proven in `lib/sound/store.ts:15-27`. A named seam is left for a shared store on Cloud Run.
  - `meter.ts` provides generic `reserve(class, amount)`, `settle(hold, rows)`, `release(hold)`, `stats(class)` and `byAxis(class)`, plus the counters `lib/imaging/budget.ts:169-195` already defines.
- `lib/imaging/budget.ts` and `lib/music/budget.ts` become thin adapters that keep their exported names, so the existing probes still pass.
- `lib/text/router.ts` gains a hold around `walk()`. Basis is `vendor` when the CLI reports cost and `unpriced` (counted, never $0) for cloud.
- New `GET /api/spend` returns every class in one window view, with boundaries attached (same rule as `budgetStats`).
- Holds left by a dead process expire by TTL, and that expiry is counted.

**Why it is a moonshot / what it unlocks.** The ceiling stops being a per-process opinion. A pipeline script, the Next server and a second instance all spend from one window. Music stops overshooting under concurrent renders. The text engine, which is the one that actually bills on every research turn, gets a limit for the first time. A spend surface can answer "which engine spent this hour" across all three. This is also the precondition for the video capability in `docs/video-generation-plan.md:93-111` ("spend accounting per clip in the existing ledger idiom").

**Acceptance (failing tests first).**
1. Two processes (two `tsx` children) each reserve 60% of a $1 imaging ceiling at the same time → exactly one is refused `over-budget`.
2. Book $4 → simulate a restart (new module instance, same store dir) → `stats("imaging-usd").spentUsd` is still $4.
3. Two concurrent music renders whose seconds sum past the ceiling → the second is refused before vendor dispatch (fake fetch never called).
4. A `claude-cli` turn reporting `total_cost_usd: 0.31` → one `text-usd` row with basis `vendor`. A google text turn → `counters.unpriced` is incremented and no $0 row is written.
5. A hold whose owner pid is dead is reclaimed after its TTL → `counters.expiredHolds` is 1 and the window total does not include it.
6. The existing `imaging-budget*.probe.spec.ts` and `music-budget.probe.spec.ts` pass unchanged against the adapters.

**Write set.** new `lib/spend/{classes,store,fileStore,meter}.ts`, new `app/api/spend/route.ts`, `lib/imaging/budget.ts`, `lib/imaging/budgetForecast.ts`, `lib/music/budget.ts`, `lib/music/elevenlabs.ts`, `lib/text/router.ts`, new `tests/golden-path/spend-ledger.probe.spec.ts`, `.gitignore` (foundry-out/spend).

**Risks & rollback.** File-lock contention on a hot path could add latency per call. Measure it, and keep reserve to one append. The cloud posture has no shared disk, so the file adapter must refuse the hosted posture loudly (by asking `lib/deployment.ts`) rather than quietly running per instance. Rollback: the adapters keep the old exports, so pointing them back at an in-memory `SpendStore` is a one-line swap.

**First session dispatch.**
Read `lib/imaging/budget.ts`, `lib/music/budget.ts`, `lib/sound/store.ts` (lock idiom) and the registry `cost-metering` golden path plus `usage-ledgers`.
Build `lib/spend/meter.ts` with an in-memory store first, and move imaging onto it with zero behaviour change (`npm test` on the imaging-budget probes stays green).
Then add `fileStore.ts`, and write acceptance cases 1-2 as a probe spawning two `tsx` children.
Then music (case 3) and text (case 4). Gate: `npm run typecheck && npm test`.

_Runner-up:_ content-addressed server-side render store. Plates become pointers plus provenance instead of `data:` URLs inside step records (`app/_phases/frames/frames.ts:71`, video plan decision 3).

### IMG-B · Plates that inspect and repair themselves: free local-eye QC plus instruction edits as plate versions

**Context:** imaging-service · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** direction
**Registry:** media-generation/generated-output-grading#unconditional-fail-criteria, #vision-model-grading-schema · media-generation/generative-provider-routing#cost-per-usable-economics

**Summary.** Today a plate that misses the "usable" bar can only be re-rolled, or reworded and re-rolled. Under this card, every new plate is read by the $0 resident eye against a short unconditional-fail schema (text present, subject missing, wrong aspect content). A failed plate offers a one-key repair: an instruction edit through the already-built `edit` capability, kept as a new version of the plate with its full receipt.

**Premise (verified).**
- `lib/imaging/router.ts:317-329`: "usable" is defined as on-brief AND free of text, and is measured: Leonardo 23% usable vs Google 87%. Nothing in the Frames step checks either property after a render. `app/_phases/frames/useFrames.ts:371-389` marks a plate `ready` as soon as any image comes back.
- `lib/imagingClient.ts:159-169`: `editImage` and `recognizeImage` exist, but no component calls them (grep across `app/` and `components/`). Their only callers are server-side foundry and pipeline code. The edit prompt's role map is probe-tested (`tests/golden-path/imaging-reference-roles.probe.spec.ts`).
- `lib/imaging/router.ts:341-349`: recognize leads with the local `ollama` eye at $0. A text veto already exists for foundry grading (`lib/foundry/extract/vocabulary.ts:95` `has_text`, used at `lib/foundry/extract/engine.ts:431`), but the studio's own plates never get one.
- `app/_phases/frames/frames.ts:69-78`: `Plate` holds only `src/model/costUsd/subject/note`. `useFrames.ts:384-385` and `alternatives/useAlternatives.ts:180` drop `provider`, `costBasis`, `reroutedFrom` and `negativePromptChannel`, which `lib/imaging/types.ts:125-127` says are "worth PERSISTING".
- A re-route is not a recovery path for these plates. Only Google sets `supportsReferences: true` (`providers/google.ts:153`; agy `:177` and leonardo `:118` are false), and a style-locked request is constrained to reference-capable vendors (`router.ts:730-732`). On the plates the studio actually makes, repair has to be an edit, not a hop.

**The move.**
- New `lib/imaging/inspect.ts` (server) defines `PLATE_QC_SCHEMA`: `{has_text, subject_present, subject_named?, defects[]}`, as closed enums plus one noun phrase. `POST /api/imaging/inspect` runs it through `recognize`, so it is routed and metered like any other call.
- `Plate` becomes `{versions: PlateVersion[], activeId}`. Each version carries `{src, provenance (whole), qc, parentId, op: "generate"|"edit", instruction?}`. The frames reducer and `useAlternatives` adopt it.
- Frames UI uses only the signal vocabulary:
  - a `StaleBadge`/`Tally`-style QC chip on the plate (`text`, `no subject`)
  - one `Keycaps`-bound action, `E`, which pre-fills the edit instruction from the QC finding ("remove the lettering on the sign at upper left")
  - an edit that sends `image = active version` plus the style references, and lands as a new version (the parent stays one key away)
  - `Provenance` rendered from the stored receipt
- No explanatory prose is added.

**Why it is a moonshot / what it unlocks.** The 87% usable rate becomes something closer to 100%, at edit cost instead of re-roll cost, and the 13% failures are found for free instead of by eye. "Which plate came from which vendor, at what basis" becomes answerable on the plate itself. Versions with parents are the same shape the video plan wants for takes (`docs/video-generation-plan.md:103-107`).

**Acceptance (failing tests first).**
1. A render whose fake recognize returns `has_text: true` → the plate's QC reads `text` and the plate is not counted as usable by `framesProgress`-style tallies.
2. Pressing the repair action → `editImage` is called with the active version's pixels plus the theme references. The new version has `parentId = previous`, `op: "edit"`, and an instruction that names the defect.
3. The persisted frame record holds `provenance.provider`, `costBasis` and `reroutedFrom` exactly as returned (round-trip through `saveStep`).
4. Recognize unavailable (no `OLLAMA_HOST`, google no-key) → the plate shows QC `unmeasured`, never `clean` (unmeasured-is-not-pass).
5. Deleting the active version promotes its parent (the alternatives rule, `alt-last-one-stays.probe.spec.ts` shape).

**Write set.** new `lib/imaging/inspect.ts`, new `app/api/imaging/inspect/route.ts`, `lib/imagingClient.ts`, `app/_phases/frames/frames.ts`, `app/_phases/frames/useFrames.ts`, `app/_phases/frames/alternatives/useAlternatives.ts`, `app/_phases/frames/parts.tsx`, `app/_phases/_shared/stepStore.ts` (frames payload migration), new `tests/golden-path/plate-qc.probe.spec.ts`.

**Risks & rollback.** A local-eye false positive on `has_text` (stylised glyph-like texture) nags the user. Mitigation: QC is advisory and never blocks adoption. The persisted-payload shape changes, so follow `.vault/Architect/decisions/2026-08-29-persisted-payload-versioning.md`. Rollback: read old `Plate` as a single-version plate. The UI chip and key are additive.

**First session dispatch.**
Read `lib/imaging/router.ts` (PLAN comment), `lib/foundry/extract/vocabulary.ts` (READBACK_SCHEMA), `app/_phases/frames/useFrames.ts:350-410` and the persisted-payload ADR.
Build `inspect.ts` plus its route with a fake-recognize probe (cases 1, 4).
Then the `PlateVersion` model and migration (case 3), then the edit action (case 2).
Gate: `npm run typecheck && npm test`, then photograph the Frames screen with `pipeline/cx-capture.mjs studio-frames`.

_Runner-up:_ a second reference-capable generate vendor, so a Google safety refusal on a style-locked plate has somewhere to hop (today the chain is structurally empty).

_Checked:_ read in full `lib/imaging/{types,router,budget,budgetForecast,api}.ts`, `lib/imagingClient.ts`, `app/api/imaging/{generate,budget,pricing}/route.ts`. Skimmed `providers/*` (capabilities/references), `lib/text/{router,pricing}.ts` headers, `lib/music/budget.ts`, `app/_phases/frames/{useFrames,frames,parts}.tsx?`, `alternatives/useAlternatives.ts`. Traced: provenance persistence (dropped), `avoid`/`edit` callers (none in UI), reference-capable vendors (google only), out-of-server router importers (5 pipeline scripts), text metering (absent).

---

## character-consistency-testing

### CC-A · The ruler graduates: a frozen, digest-pinned scale with JSON verdicts and a resident worker

**Context:** character-consistency-testing · **Slot:** A architecture
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** media-generation/character-identity-continuity#identity-ruler-calibration · software-engineering/eval-harness#measurement-revision

**Summary.** The identity ruler is the repo's most valuable instrument. It is still a script that recalibrates from gitignored film stills on every run, prints prose, and is reached into by other programs through `sys.path`. This card freezes the calibration into a committed, versioned scale artifact (numbers plus digests, no pixels), exposes a public scoring API with machine-readable verdicts, and adds a resident worker mode. Lanes, the dojo and the planned video acceptance gate then all read one ruler.

**Premise (verified).**
- `pipeline/vlm-probe/identity.py:297-364`: `main()` recalibrates from `ANCHORS` (`:76-95`) on every invocation and reports verdicts with `print()` only. `verdict()` (`:241`) returns an English string.
- `identity.py:271` `missing_anchors()`: the anchor stills are gitignored extracted frames, so a fresh clone cannot calibrate at all and exits 2.
- `pipeline/foundry/dojo_measure.py:78-89` imports `identity` through a `sys.path` insert, calls the private `vecs_for/pair_rows/scale_from`, and recalibrates per cycle. Nothing records which scale a verdict was read against beyond the printed numbers.
- `pipeline/vlm-probe/motion.py:35` restates "floor 0.364" in prose. `CONSISTENCY-FINDINGS.md:50-55,197-201` carry the rungs as tables. The same fact now has three authorities.
- `identity.py:97` `_m = {}` is a per-process model cache. Each lane scoring pays DETR, MTCNN, FaceNet and DINOv2 loads again.
- `docs/video-generation-plan.md:127-132` (P2): "the vlm-probe identity ruler graduates from research to acceptance gate — calibrated before it judges". There is no interface for it to graduate into yet.

**The move.**
- New package `pipeline/vlm-probe/ruler/`:
  - `calibrate.py` writes `ruler/scale-v<n>.json`: `{version, anchors:[{name, sha256}], models:{facenet:"vggface2@rev", dinov2:"dinov2-base@rev", detr:"detr-resnet-50@rev"}, MIN_FACE_PX, rungs:{within, floor, ceil, look_floor}, separation, blind:null|reason, calibratedAt}`. It is committed, and holds no third-party pixels.
  - `api.py` provides `load_scale()` (refuses on a model revision mismatch or `blind`), `score_pairs(paths) -> [Verdict]`, where a `Verdict` is a dataclass `{a, b, identity, look, rung: "within"|"floor"|"looser"|"different"|"unscored", reason, faceSizePx, scaleVersion}`, and `worst_pair()`.
  - `serve.py` is a stdin/stdout JSONL worker (models load once, one request per line). It is the seam a Node acceptance gate calls later.
- `identity.py` becomes the CLI over `api.py` (same output plus `--json`).
- `dojo_measure.py` uses `api.score_pairs` and stamps `scaleVersion` into `measures.json`.

**Why it is a moonshot / what it unlocks.** A consistency claim becomes portable: "0.371 against scale-v3" means the same thing on any machine, including one with no film stills. The dojo can compare cycles across months without wondering whether the scale moved. The video seam's P2 becomes a call into an existing worker instead of a research port. A recalibration that moves the floor becomes a version bump that readers can see, instead of a silent change.

**Acceptance (failing tests first).**
1. `load_scale()` on a scale file whose `models.facenet` revision differs from the installed weights → raises `RulerMismatch` naming both revisions.
2. A scale with `rungs.ceil <= rungs.floor` → `load_scale()` refuses with the inversion reason (existing `ruler_blindness` semantics).
3. `score_pairs` on a pair whose face is 40 px → `rung: "unscored"`, `reason: "face below MIN_FACE_PX"`, never a number.
4. `serve.py` receives two requests on one process → the second has no model-load latency (assert a load counter equals 1).
5. `dojo_measure.py identity` output carries `scaleVersion` equal to the committed file's version.
6. On a fresh clone (no `frames/` stills), scoring against the committed scale succeeds, and only `calibrate.py` needs the anchors.

**Write set.** new `pipeline/vlm-probe/ruler/{__init__,calibrate,api,serve}.py`, new `pipeline/vlm-probe/ruler/scale-v3.json`, `pipeline/vlm-probe/identity.py`, `pipeline/foundry/dojo_measure.py`, `pipeline/vlm-probe/motion.py` (drop the restated number, cite the file), new `pipeline/vlm-probe/selftest_ruler.py`.

**Risks & rollback.** Committing digests and distances of copyrighted stills is fine (no pixels), but say so in the file header. Model revision pinning needs the HF revision ids recorded at calibration time, and an unpinned download would refuse loudly, which is the intent. Rollback: `identity.py` keeps its live-calibration path behind `--recalibrate`.

**First session dispatch.**
Read `pipeline/vlm-probe/identity.py`, `CONSISTENCY-FINDINGS.md` §"A third rung", `pipeline/foundry/dojo_measure.py:78-113`, and the registry technique `identity-ruler-calibration`.
Build `ruler/api.py` as a pure extraction (no behaviour change) plus `selftest_ruler.py` with fixture embeddings (cases 2, 3).
Then `calibrate.py` writes the scale on the 4090 box, and `load_scale` checks revisions (cases 1, 6).
Then `serve.py` (case 4). Gate: `python pipeline/vlm-probe/selftest_ruler.py`, then `python identity.py --set shots/reference-face-e25 --json` reproduces 0.371.

_Runner-up:_ a thirty-shot drift-curve harness. Declarative lane specs, plus cumulative worst-identity vs shot index, to answer "three shots is not thirty" (`CONSISTENCY-FINDINGS.md:166-168`).

### CC-B · GPU tenancy lease: one cross-process turn broker replaces look-then-kill recycling

**Context:** character-consistency-testing · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** software-engineering/concurrency-guards#cross-process-exclusion, #release-guarantees · software-engineering/admission-queue#resource-denominated-bounds

**Summary.** One 24 GB card is shared by at least four kinds of tenant: the consistency and motion lanes, foundry forge and dojo, the preset-clip renderer, and the Next server's resident Ollama eye. Today they coordinate by guessing tenancy from output filename prefixes and by `Stop-Process -Force`. This card builds a lease on disk, readable from both Python and Node: one holder, a VRAM-denominated claim, heartbeat expiry, a FIFO queue, and one ComfyUI client that every tenant uses. A recycle then becomes something only the lease holder may do.

**Premise (verified).**
- `pipeline/vlm-probe/guard.py:313`: `MY_PREFIXES = ("baseline", "reference", …)`. Tenancy is a hand-list of the vlm-probe's own filename prefixes, inferred from the running queue (`:316-344`). `pipeline/foundry/dojo_video_h3.py:65` calls the same `foreign_job()` from a different tenant, so "ours" means the wrong thing there.
- `guard.py:347-357`: `recycle_comfy()` is `Stop-Process -Force`. `CONSISTENCY-FINDINGS.md:281-300` records it firing nine times during the stills lanes while a `forge.py` sweep was driving the same ComfyUI, killing its jobs "silently, from that pipeline's point of view for no reason at all".
- Other tenants check only `guard.comfy_process_ids()`: `pipeline/foundry/forge.py:319`, `scenario_probe.py:96`, `scene_demo.py:162`, `pipeline/video/render_preset_clips.py:201`.
- There are three separate ComfyUI queue/poll clients: `pipeline/vlm-probe/consistency.py:176` (with process-vanish detection), `pipeline/vlm-probe/replicate.py:175-182`, and `pipeline/foundry/dojo_video.py:65-77` (hardcoded `127.0.0.1:8188`).
- `lib/imaging/providers/ollama.ts:33` makes the Next server load `qwen3.8:27b`, measured at 22.3 GB resident, which is 93% of the card (`guard.py:9-10`). It does this on any recognize request with no headroom check. `grep -i vram lib/` finds nothing on the Node side.

**The move.**
- New `pipeline/gpu/lease.py` and `lib/gpu/lease.ts` share one on-disk protocol, `foundry-out/gpu/{lease.json, queue.jsonl, lock}`, using the exclusive-create lock idiom of `lib/sound/store.ts:15-22`.
  - A lease is `{tenant, engine: "comfy"|"ollama", vramGb, pid, host, jobPrefix, acquiredAt, heartbeatAt, ttlS}`.
  - `acquire(tenant, engine, vramGb, wait)` is FIFO with a bound. A stale lease (pid dead, or heartbeat older than ttl) is reclaimed and the reclaim is logged.
  - `recycle(engine)` is allowed only for the holder.
- New `pipeline/gpu/comfy.py` is the single ComfyUI client: submit with a tenant-stamped prefix, poll, detect a vanished process, enforce the timeout. It replaces the three copies.
- `guard.py` keeps its headroom probes, reads tenancy from the lease instead of `MY_PREFIXES`, and `--status` prints the holder and the queue.
- The Node ollama adapter takes a short `ollama` lease. If it is busy, it raises a reroutable `rate-limited`-class error, so the router's trail records `ollama (gpu-busy)` and the request falls to the cloud eye.

**Why it is a moonshot / what it unlocks.** Unattended work becomes safe to stack: a dojo cycle, a lane and a foundry sweep can be queued overnight, and none of them can kill another. The failure the findings call "the most expensive mistake in it" becomes impossible by construction rather than by courtesy. It is also the admission layer that P1 of the video plan (the ComfyUI bridge as a server-callable provider, `docs/video-generation-plan.md:120-124`) needs before a browser click is allowed to touch the card.

**Acceptance (failing tests first).**
1. Tenant A holds a comfy lease and tenant B calls `recycle("comfy")` → `LeaseHeld` names A, and no process is stopped (Stop-Process stubbed).
2. The holder's pid is dead and its heartbeat is past ttl → B's `acquire` reclaims it, and `reclaims` is incremented in `queue.jsonl`.
3. Two waiters queue → they are granted in arrival order (FIFO), and a waiter past `wait` gets `LeaseTimeout`, not a hang.
4. `lib/gpu/lease.ts` and `lease.py` interoperate on one temp dir: a Node holder blocks a Python acquire, and vice versa.
5. Recognize while comfy is leased → the router trail shows `{provider:"ollama", why:"rate-limited"}` and google serves (fake fetch).
6. `pipeline/gpu/comfy.py` with a process that vanishes mid-poll → raises `ComfyVanished` within one poll interval (the `consistency.py:199-203` behaviour, now shared).

**Write set.** new `pipeline/gpu/{lease,comfy}.py`, new `lib/gpu/lease.ts`, `pipeline/vlm-probe/guard.py`, `pipeline/vlm-probe/consistency.py`, `pipeline/vlm-probe/motion.py`, `pipeline/vlm-probe/replicate.py`, `pipeline/foundry/dojo_video.py`, `pipeline/foundry/dojo_video_h3.py`, `pipeline/foundry/forge.py`, `lib/imaging/providers/ollama.ts`, new `pipeline/gpu/selftest.py`, new `tests/golden-path/gpu-lease.probe.spec.ts`.

**Risks & rollback.** A leaked lease could stall the rig overnight, so heartbeat ttl and pid liveness are mandatory (release-guarantees), and `guard.py --break-lease` is the operator escape. The Windows pid liveness check differs from POSIX, so reuse `guard.comfy_process_ids()` probing. Rollback: tenants call `acquire` behind `GPU_LEASE=off`, which degrades to today's behaviour.

**First session dispatch.**
Read `pipeline/vlm-probe/guard.py`, `CONSISTENCY-FINDINGS.md` §"This box is not ours alone", `lib/sound/store.ts` (lock idiom) and the registry `concurrency-guards#cross-process-exclusion`.
Build `pipeline/gpu/lease.py` plus `selftest.py` (cases 1-3) with stubbed process control.
Then port the lease to `lib/gpu/lease.ts` (case 4), then `comfy.py` and migrate `consistency.py` and `dojo_video.py` first (case 6).
Gate: `python pipeline/gpu/selftest.py && npm run typecheck && npm test`.

_Runner-up:_ a shared `pipeline/gpu/comfy.py` client on its own, without the lease (smaller, but leaves the kill problem standing).

_Checked:_ read in full `identity.py` (`:1-364`), `consistency.py:1-230`, `CONSISTENCY-FINDINGS.md:1-300`. Skimmed `motion.py` header/imports, `replicate.py` client, `guard.py` function map plus `foreign_job/recycle_comfy`, `pipeline/foundry/dojo_measure.py:78-113`, `dojo_video.py`, `docs/video-generation-plan.md:1-137`, `lib/imaging/providers/ollama.ts`. Traced: identity consumers (dojo via sys.path), ComfyUI client copies (3), comfy tenants (7 call sites), Node-side VRAM awareness (none).

---

## vlm-frame-annotation

### VLM-A · One cinematography vocabulary, derived everywhere: a versioned vocab file plus a drift gate

**Context:** vlm-frame-annotation · **Slot:** A architecture
**Size:** M · **Effort:** 5/10 · **Impact:** 7/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** media-generation/generated-output-grading#vision-model-grading-schema, #replication-as-comprehension-test · media-generation/cinematic-language

**Summary.** The closed vocabularies that make every machine judgement in the studio comparable are hand-copied across Python and TypeScript, and the copies have already drifted while one of them claims to be verbatim. This card puts one versioned `cinematography.json` (field groups, enums, ordinal flags, descriptions, weights, and the measured reason each enum value exists) at the centre. `schema.py`, `style.py`, the foundry vocabulary, the cull grid and the dojo study all derive from it, a `check:vocab` gate enforces that, and every annotation row is stamped with its vocab version.

**Premise (verified).**
- `lib/foundry/extract/vocabulary.ts:4-7`: "The enums below are that file's [`pipeline/vlm-probe/style.py`], verbatim". They are not. TS `ENUMS` (`:38-50`) has `medium`, `particle_fx`, `finish` and `focus`, which `style.py` (`:46-53`, `FIELDS :59-75`) lacks. `style.py` has `motion_treatment` and `consistency_across_frames` (`:70-71`), which TS lacks.
- `pipeline/vlm-probe/schema.py:1-9,16-73`: the craft vocabulary is "lifted verbatim" from the registry's cinematic-language subject, which is another hand copy. `:28-42` carry measured reasons (`indeterminate` added after 34/36 `wide-angle`, `exposure` added after `lighting_key` tracked brightness) that live only as comments.
- `app/foundry/CullGrid.tsx:65` hard-codes `CRAFT_SUMMARY = ["shot_size", "camera_angle", …]`. `pipeline/foundry/dojo_study.py:40` hand-lists `FIELDS`.
- Scoring rules diverge by language. Python gives ordinal half-credit (`schema.py:135-140`, `score.py:71-78`). TS weights `render_mode`/`medium` double (`vocabulary.ts:71-83`). Neither knows the other's rule.
- `pipeline/vlm-probe/README.md:74-77`: result rows live in gitignored `vlm-probe-out/` with no vocabulary version, so a run before and after the `exposure` change cannot be told apart.

**The move.**
- New `pipeline/vocab/cinematography.json`: `{version, groups:{craft, style, face_state}, fields:{<name>:{group, enum[], ordinal:bool, weight, description, evidence:[{date, finding}]}}}`.
- Readers: `pipeline/vocab/vocab.py` (Python) and `lib/vocab/cinematography.ts` (pure, client-safe JSON import).
- `schema.py`, `style.py`, `lib/foundry/extract/vocabulary.ts`, `CullGrid.tsx` and `dojo_study.py` build their enums, ordinal sets and weights from it. Field selections per pass (the per-frame craft set, the per-source style set) are named subsets in the file, not re-declared lists.
- `probe.py` rows and foundry readbacks carry `vocabVersion`. `score.py` refuses to compare rows across versions unless `--cross-version` is given, and then it prints the delta fields.
- New `pipeline/check-vocab.mjs` joins `npm run verify`. It fails on any enum literal array in the listed files that is not sourced from the vocab file, and on a field referenced by name that the file does not declare.

**Why it is a moonshot / what it unlocks.** A grader's readback, a forge-read style, a probe annotation and a dojo study become provably the same language. That is the premise every cross-surface score already assumes (`vocabulary.ts:6-7`: "a score is a comparison of enums rather than an opinion"). Adding a field such as the dojo's `face_state` becomes one edit with a dated reason, not five. It also gives VLM-B its stable key: a certificate is "per field, per vocab version".

**Acceptance (failing tests first).**
1. `check-vocab` on the current tree → fails, naming `vocabulary.ts` fields absent from `style.py`'s pass and vice versa (the drift becomes a red gate before it is fixed).
2. After migration: `json_schema()` from `schema.py` is byte-identical in field set and enums to its pre-migration output (snapshot test).
3. `ENUMS` in TS deep-equals `vocab.groups.style` enums. `CRAFT_SUMMARY` is derived and contains no literal.
4. `score.py` given rows with `vocabVersion` 3 and 4 → exits non-zero naming the version split. With `--cross-version` it lists the changed fields.
5. Adding an enum value without an `evidence` entry → `check-vocab` fails.

**Write set.** new `pipeline/vocab/{cinematography.json,vocab.py}`, new `lib/vocab/cinematography.ts`, `pipeline/vlm-probe/{schema,style,score,probe}.py`, `lib/foundry/extract/vocabulary.ts`, `app/foundry/CullGrid.tsx`, `pipeline/foundry/dojo_study.py`, new `pipeline/check-vocab.mjs`, `package.json` (verify), new `tests/golden-path/vocab-single-source.probe.spec.ts`.

**Risks & rollback.** The style pass and the extract pass legitimately ask different subsets. Do not force them to one field list; name the subsets. A TS JSON import must stay client-safe (no node imports). Rollback: the readers can inline-export constants identical to today's, so reverting is per-consumer.

**First session dispatch.**
Read `pipeline/vlm-probe/schema.py`, `style.py:40-80`, `lib/foundry/extract/vocabulary.ts:1-115` and `app/foundry/CullGrid.tsx:60-70`.
Write `check-vocab.mjs` first and land it red (case 1, reported, not wired into verify yet).
Author `cinematography.json` from the union, with evidence lines copied from the comments, then migrate the Python readers (case 2) and TS readers (case 3), then wire the gate.
Gate: `npm run verify` plus `python pipeline/vlm-probe/score.py --run <existing>` reproduces its report.

_Runner-up:_ remove machine-specific literals (`probe.py:33` reads another user's `C:\Users\kazda\kiro\personas\.env`; `guard.py:41` defaults `COMFY_DIR` to the same foreign home) into the onboarding config.

### VLM-B · Eye certificates: a self-minted truth corpus, and recognize routed by per-field trust

**Context:** vlm-frame-annotation · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** media-generation/generative-provider-routing#extraction-model-bake-off · software-engineering/eval-harness#certification-levels, #failure-signatures-beside-the-pass-rate

**Summary.** The probe answers "which eye can read which field" in a markdown report a human reads once. The app's router then sends every recognize call, for every field, to whichever local model an env var names. This card turns the probe's verdict into a committed, machine-readable certificate per model, per field and per vocab version. It grows the truth set from two hand files into a corpus minted from shots the pipeline generated with a stated camera. It then lets `lib/imaging` route a recognize request away from the local eye exactly when the request asks for a field that eye is not certified to read.

**Premise (verified).**
- `pipeline/vlm-probe/score.py:232`: the only output is `report.md` (markdown tables plus prose). Nothing machine-readable leaves a scoring run.
- `pipeline/vlm-probe/frames/truth/` holds two files (`arcane.json`, `duel-keyframe.json`). The "is it right" section (`score.py:97-99,144-172`) is therefore measured on n=2.
- Truth by construction already exists and is thrown away: `consistency.py:84-110` `SHOTS_SPEC` states the shot size, angle and focus of every generated shot ("Extreme wide shot … Low camera … Deep focus"), and nothing writes it as a truth sidecar.
- `lib/imaging/providers/ollama.ts:33` hand-sets `qwen3.8:27b`, and `lib/imaging/router.ts:341-349` makes it lead recognize for every schema. Fields this repo measured as unreliable on local eyes (`schema.py:28-42`: `lens_impression`, `lighting_key`) are exactly what foundry grading asks it (`app/foundry/CullGrid.tsx:65` reads `lighting_key`, `depth_of_field`).
- `lib/imaging/router.ts:456-459,600-606`: a per-request `Constraint {needs, test}` already narrows the chain and records `why: "constraint"` in the trail. The mechanism needed for field-trust routing exists and is used once (reference images).

**The move.**
- Truth minting: generating lanes (`consistency.py`, `replicate.py`, and later the foundry) write `frames/truth/<stem>.json` from their structured spec. The spec moves from prose to typed fields (`{shot_size, camera_angle, depth_of_field, …}`) that are also compiled into the prompt, so truth and prompt cannot disagree.
- `score.py --certify` writes `pipeline/vlm-probe/certificates/<model>.json` with `{model, vocabVersion, runId, measuredAt, perField:{<f>:{truthAcc, truthN, yardstickAgree, stability, failureSignature}}, sPerFrame, vramGb}`. These are committed: numbers only.
- New `lib/imaging/eyes.ts` (server) loads the certificates. `certifiedFields(model, vocabVersion, {minN, minAcc})` returns the trusted fields, and a stale vocab version means nothing is certified.
- `recognize()` derives the enum fields from `req.schema`. If any field is uncertified for the local eye, it applies a Constraint (`needs: "a certified reading of lighting_key"`) that skips ollama with a recorded trail. If every field is certified, the local eye serves at $0.

**Why it is a moonshot / what it unlocks.** The local-vs-metered decision the probe was built to make (`README.md:6-9`) stops being a one-off finding and becomes the router's live policy. It is cheap where the local eye is good and pays only where it measurably is not. Each new model is admitted by running the probe, not by editing an env var. The truth corpus grows as a side effect of every lane, and that is what makes `truthAcc` numbers mean something.

**Acceptance (failing tests first).**
1. A `consistency.py` dry run (no GPU, workflow stubbed) writes a truth sidecar whose `shot_size`/`camera_angle` equal the spec, and the compiled prompt contains the same values.
2. `score.py --certify` on a fixture `results.jsonl` produces a certificate whose `truthN` per field equals the number of truth-bearing frames, and whose `vocabVersion` equals the rows'.
3. A recognize request whose schema includes `lighting_key`, where the ollama certificate has `truthAcc 0.4` → the trail shows `{provider:"ollama", why:"constraint"}` and google serves (fake fetch).
4. A request whose schema includes only `palette_strategy`, certified at 0.9 with n≥20 → ollama serves and the trail is empty.
5. A certificate with an older `vocabVersion` than the current vocab → treated as uncertified for every field (stale verdict refuses).
6. No certificate file for the configured model → behaviour unchanged from today (the local eye leads), with one log line naming the absence.

**Write set.** `pipeline/vlm-probe/{score,consistency,replicate}.py`, new `pipeline/vlm-probe/certificates/` (+ README line), new `lib/imaging/eyes.ts`, `lib/imaging/router.ts`, `lib/imaging/json.ts` (schema → enum field list), new `tests/golden-path/imaging-eye-certificates.probe.spec.ts`, new `pipeline/vlm-probe/selftest_certify.py`.

**Risks & rollback.** Small-n certificates over-trust or under-trust, so `minN` must be explicit and printed (measurement honesty). Generated-frame truth is biased toward the generator's own rendering of a camera term; record that bias in the certificate, and keep the hand truth set as a separate split. Rollback: `eyes.ts` returning "all certified" restores today's routing exactly.

**First session dispatch.**
Read `pipeline/vlm-probe/score.py`, `README.md`, `lib/imaging/router.ts:440-720` and the registry `extraction-model-bake-off`.
Build `score.py --certify` against a fixture run plus `selftest_certify.py` (case 2).
Then `lib/imaging/eyes.ts` plus the router constraint with fake providers (cases 3-6).
Then truth minting in `consistency.py` (case 1).
Gate: `python pipeline/vlm-probe/selftest_certify.py && npm run typecheck && npm test`. Land after VLM-A if possible, so certificates key on `vocabVersion`.

_Runner-up:_ cut-aware corpus ingestion. `ingest.py`'s scene strategy feeds a vocab-stamped annotation store that the foundry and the dojo query by enum, instead of each re-reading frames.

_Checked:_ read in full `schema.py`, `score.py`, `README.md`, `probe.py:1-60`, and headers of `guard.py`, `ingest.py`, `beats.py`, `build_gallery.py`, `extract_frames.py`, `fetch_curl.sh`, plus `style.py:1-80`. Compared against `lib/foundry/extract/vocabulary.ts:1-122`, `app/foundry/CullGrid.tsx:65`, `pipeline/foundry/dojo_study.py:40`, `pipeline/foundry/prove-local-eye.mts`, `lib/imaging/providers/ollama.ts`. Traced: vocabulary copies (5, drifted), truth-set size (2), probe output format (markdown only), router constraint reuse.

---

## music-service

### MUSIC-A · Cue receipts: one stored render path, verified against the plan before anyone listens

**Context:** music-service · **Slot:** A architecture
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** contract
**Registry:** media-generation/generated-music-acceptance#structure-verification-against-plan, #rights-and-provenance-record · media-generation/music-prompt-composition#duration-and-tempo-locking

**Summary.** Production cues go through a second, poorer vendor path (`/v1/music`). It returns bare bytes: no song id, no vendor plan, nothing to check the render against. Meanwhile the detailed path, used by every Sound-lab take, has lost the body-read deadline the production path earned. This card collapses the two into one transport and one stored, detailed compose. It extends `MusicProvenance` into a receipt (song id, the vendor's own plan, brief-vs-delivered deltas) and adds a pure plan-conformance check, so a cue that is the wrong length or has the wrong sections fails on the numbers before an ear is spent on it.

**Premise (verified).**
- `app/api/music/generate/route.ts:130` → `lib/music/elevenlabs.ts:194-264`: `composeMusic` posts to `/v1/music` with no `store_for_inpainting`, and returns `{audio, provenance}` where `MusicProvenance` (`lib/music/types.ts:129-135`) has no `songId`, no vendor plan, and no delivered length.
- `lib/music/types.ts:181-189`: `DetailedMusicResult` already returns "the vendor's own composition plan … the ground truth section list (with durations)". Only `/api/music/compose` and `lib/sound/generate.ts:143-170` use it.
- `lib/music/elevenlabs.ts:276-302`: `vendorFetch` clears its timer in `finally` as soon as headers arrive. That is the exact defect `composeCall` fixed and documented at `:225-232` ("THE TIMER SPANS THE BODY"). `composeDetailed` and `generateSfx`, and therefore every Sound-lab render, still read a megabyte body with no deadline.
- `lib/music/plan.ts:203-231`: the brief commits checkable numbers (per-section `durationMs`, `barsFit`, a hard ending only when whole bars fit). `lib/sound/types.ts:96-97` stores `measured.durationS` beside the asked `durationS`, but nothing compares them, and `grep conform lib/sound app/playground app/_phases/score` finds no structural check.
- The registry technique (structure-verification-against-plan) says: run the deterministic pass first and let it gate the listen. Total duration is "the first check and the cheapest kill".

**The move.**
- `lib/music/elevenlabs.ts`: one `vendorCall(url, body, timeoutMs)` whose timer spans the body read, used by all four ops. `composeMusic` becomes `cueToPlan` → `toWirePlan` (exported, replacing the private `toChunk`) → `composeDetailed({plan, storeForInpainting: true})`. The `/v1/music` path is deleted.
- `MusicProvenance` gains `{songId, vendorPlan, requestedSections:[{name, durationMs}], conformance}`. This is a contract change: version the wire with `receiptVersion: 2`.
- New `lib/music/conformance.ts` (pure): `checkPlan(brief: MusicPlan, vendor: WirePlan|null) -> {verdict: "holds"|"drifts"|"unmeasured", deltas:[{section, askedMs, gotMs}], totalAskedMs, totalGotMs}`, with an absolute tolerance per section and `unmeasured` when the vendor returned no plan.
- A second, client-side layer, `measuredConformance(decodedLengthS, onsetEnvelope, expectedOffsets)`, reuses `app/library/audio/analysis.ts`'s onset envelope to check the decoded length and section-boundary energy changes at the briefed offsets. It runs on the existing measure-on-open pass (`app/playground/shared/measure.ts`).

**Why it is a moonshot / what it unlocks.** Every production cue becomes editable later, because it now has a stored song id. Every cue carries a rights-grade receipt of what was asked versus delivered. The most common generated-music failure, the right piece at the wrong length, is caught by arithmetic instead of by a listen. The Sound lab's renders stop being able to hang a handler until `maxDuration`. This is the engine contract that MUSIC-B's section revisions stand on.

**Acceptance (failing tests first).**
1. Fake vendor sends headers, then stalls the body → `composeDetailed` rejects `timeout` within `timeoutMs` (today it hangs).
2. `POST /api/music/generate` with fake fetch → the request goes to the detailed endpoint with `store_for_inpainting: true`, and the response provenance carries `songId` and `vendorPlan`.
3. `checkPlan` with brief sections [8000, 5000] and vendor [8000, 7400] → `drifts`, with one delta `{section:"sc 2", askedMs:5000, gotMs:7400}`.
4. `checkPlan` with vendor plan `null` → `unmeasured`, never `holds`.
5. `measuredConformance` with decoded length 13.0 s vs asked 13.0 s and an energy step within tolerance of the 8 s boundary → `holds`. Shift the step to 5 s → `drifts` naming the boundary.
6. The existing `music-cue-provenance`, `music-budget` and `music-failure-classification` probes pass against the single transport.

**Write set.** `lib/music/elevenlabs.ts`, `lib/music/types.ts`, new `lib/music/conformance.ts`, `app/api/music/generate/route.ts`, `lib/musicClient.ts`, `app/playground/shared/measure.ts`, `app/library/audio/analysis.ts` (export the onset envelope), `app/_phases/score/ScoreSpotting.tsx` (render the conformance chip with the signal vocabulary), new `tests/golden-path/music-conformance.probe.spec.ts`.

**Risks & rollback.** The detailed endpoint's multipart parsing (`elevenlabs.ts:432-455`) becomes production-critical, so cover it with fixture bodies. Storing every cue for inpainting may have vendor retention or price implications; record it in `pricing.ts`'s source line. Rollback: keep `composeMusic` behind `MUSIC_LEGACY_ENDPOINT=1` for one release.

**First session dispatch.**
Read `lib/music/elevenlabs.ts` (whole), `lib/music/plan.ts`, `lib/music/types.ts` and the registry technique `structure-verification-against-plan`.
Fix the transport first (case 1, a probe with a stalling fake fetch). It is the smallest provable win.
Then route `composeMusic` through the detailed path (case 2), then `conformance.ts` (cases 3-4), then the measured layer (case 5).
Gate: `npm run typecheck && npm test`.

_Runner-up:_ replace `plan.ts`'s INVENTED constants (`:57-76`) with section-style rules derived from the sound ledger's confirmed lessons (`pipeline/sound/ledger.json`).

### MUSIC-B · Score cues become takes: they survive the reload, a note re-renders one section, and lab takes can be spotted to picture

**Context:** music-service · **Slot:** B experience
**Size:** L · **Effort:** 7/10 · **Impact:** 9/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** media-generation/music-prompt-composition#section-plan-as-the-brief · media-generation/generated-music-acceptance#generated-audio-defect-taxonomy

**Summary.** The Score step and the Sound lab are two music products that never meet. Score renders a cue into a blob URL that dies on reload, keeps one take per cue, and can only re-roll the whole cue. The Sound lab has a durable take store, verdicts, versions and section edits. This card renders every Score cue as a take in the sound store, linked to the project and cue. It closes the open ADR (score-take-persistence) with a fourth option the ADR predates: bytes on the server-side take store, pointers in the step. A note on one section becomes a section edit that keeps the rest of the cue byte-for-byte, and a finalized lab take can be spotted onto a cue directly.

**Premise (verified).**
- `app/_phases/score/ScoreSpotting.tsx:202-220`: a `Take` is "NOT PERSISTED", an object URL over decoded audio. `:585-605` re-rendering revokes and replaces the previous take, so takes cannot be compared. `app/_phases/_shared/stepStore.ts:190-198`: `ScoreStepData` "does not carry [a take], does not have a field for one".
- `.vault/Architect/decisions/2026-08-29-score-take-persistence.md` is `status: proposed`, with "Decision: Not made". Its options A/B/C all assume IndexedDB or re-render. Its prerequisite ("the Score step … takes no `projectId`") has since been met: `app/studio/[projectId]/phases.tsx:29` passes `projectId`.
- The store that answers the ADR exists. `lib/sound/store.ts:1-27` is a file-backed take store with atomic writes. `lib/sound/types.ts:104-160` takes carry `songId`, `plan`, `parentId`, `verdict`, `stage` and `label`. `lib/sound/generate.ts:19-20,152-170` already implements `section-edit` (kept sections by reference).
- `lib/music/types.ts:10-15` states the doctrine, "a note on one section becomes an edit to that section instead of a reroll of the whole take", and the Score step cannot do it. Its cues have no song id (MUSIC-A premise).
- `lib/sound/types.ts:19`: `TakeOrigin` has no `score` member, and nothing links a take to a project or cue. Arrange's finalized takes carry "the label agents select by" (`:132-133`), but Score has no way to pick one.

**The move.**
- `lib/sound/types.ts`: `TakeOrigin` gains `"score"`, and takes gain `{projectId, cueId}` (null for lab takes).
- `lib/sound/generate.ts`: an op `"cue"` accepts a CueBrief, runs `cueToPlan` → `toWirePlan` (shared with MUSIC-A, or exported here first), renders stored, and files a take. The doctrine stays server-side, as `app/api/music/generate/route.ts:1-8` requires.
- `ScoreSpot` gains `takeIds: string[]` and `activeTakeId` (pointers, a few bytes each). The Score step lists the cue's takes from `/api/sound/takes?projectId&cueId`, plays them with `takeFileUrl`, keeps an active one, and lets the user mark verdicts with the lab's rubric keys.
- Section revision: select a section on the cue's waveform (joints already drawn per `app/playground/labModel.ts:56`), press a key, type the note → `op: "section-edit"` with that section `regenerate` and the rest `keep` → a child take (`parentId`), shown beside its parent.
- "Spot a lab take": a picker over `stage: finalized` takes filtered by label adopts an existing take as the cue's active take, with no render.
- Hosted posture: `capabilities.musicSectionEdit` (`lib/capabilities.ts:64-71,159`) and the absence of server disk keep today's session-only behaviour, and the surface shows that with `Ghost`/`StaleBadge`, not prose.

**Why it is a moonshot / what it unlocks.** Scoring stops being a bench where work evaporates and becomes a place where it accumulates. The creator can compare takes, revise one section at the cost of one section, and reuse what agents and the lab already judged. The ledger then learns from production cues, not only lab experiments, because Score verdicts flow into `pipeline/sound/ledger.json` through the same transaction. A long-open product question gets answered by infrastructure that now exists.

**Acceptance (failing tests first).**
1. Render a cue (fake vendor) → a take exists with `origin: "score"`, `projectId`, `cueId`, a `songId`, and the spot's `takeIds` contains it. A reload (fresh `loadStep`) lists the same take.
2. Render twice → two takes. The first stays playable and comparable, and `activeTakeId` follows the user's pick, not the newest.
3. A section revision on section 2 of 3 → `composeDetailed` receives audio-ref chunks for sections 1 and 3 and a generation chunk for 2. The child take has `parentId` equal to the source, and metered seconds equal section 2's length only.
4. Adopt a finalized lab take labelled `pier-night` → the spot's `activeTakeId` is that take, and no vendor call is made.
5. Hosted posture (`musicSectionEdit` off) → no section-revision affordance renders, and takes stay session-scoped as today.
6. Judging a score take writes its ledger verdict in the same store transaction (`lib/sound/ledger.ts` rule), and fixture or version-only rules still exclude what they exclude.

**Write set.** `lib/sound/types.ts`, `lib/sound/generate.ts`, `lib/sound/takes.ts` (filter by project/cue), `app/api/sound/takes/route.ts`, `app/_phases/_shared/stepStore.ts` (`ScoreSpot` pointers), `app/_phases/score/{ScoreSpotting.tsx,useSpots.ts,SpotList.tsx}`, `lib/music/elevenlabs.ts` (export `toWirePlan` if MUSIC-A has not landed), `.vault/Architect/decisions/2026-08-29-score-take-persistence.md` (decision recorded), new `tests/golden-path/score-takes.probe.spec.ts`.

**Risks & rollback.** `ScoreSpotting.tsx` is large (about 1,100 lines), so keep new UI in `app/_phases/score/` step-local files per repo law. Store growth: score takes are real bytes on disk, so apply the lab's existing eviction or stage rules rather than inventing new ones. Rollback: `takeIds` are additive and optional. A build without the feature reads spots exactly as today.

**First session dispatch.**
Read the ADR `.vault/Architect/decisions/2026-08-29-score-take-persistence.md`, `lib/sound/{types,generate,store}.ts`, `app/_phases/score/ScoreSpotting.tsx:200-260,540-640` and `lib/music/plan.ts`.
Build op `"cue"` in `lib/sound/generate.ts` plus the take linkage, with a fake-vendor probe (case 1).
Then wire Score to list and adopt takes (cases 2, 4), then section revision (case 3).
Record the ADR decision in the same commit. Gate: `npm run typecheck && npm test`, then `pipeline/cx-capture.mjs studio-score` and open the PNG.

_Runner-up:_ auto-spot. Propose a finalized lab take per cue by matching label, tempo and measured length against the cue's picture, with the user confirming in one key.

_Checked:_ read in full `lib/music/{types,plan,elevenlabs}.ts`, `app/api/music/{generate,compose}/route.ts`, `lib/musicClient.ts` (non-comment lines), `app/playground/{page,PlaygroundView}.tsx`. Skimmed `lib/music/budget.ts`, `lib/sound/{store,generate,types}.ts` headers/types, `app/playground/shared/measure.ts`, `lib/capabilities.ts:55-71`, `stepStore.ts:185-232`, `ScoreSpotting.tsx:200-260,576-612`, the score-take-persistence ADR. Traced: production cue path (non-detailed, no songId), vendorFetch body deadline (missing), take persistence (blob only), Score↔lab linkage (none), map description staleness (playground).
