# Gravitone Next: rebuild plan

**Status:** proposed, 2026-10-14, revision 2. Built from the owner's verdicts in contest family
`foundry-next-design` (round 1: design reports; round 2: UI prototypes; round 4: the fusion), plus
three read-only inventories of the current code. Read this before writing any code for the new
version.

**The target:** *The Watershed*. It is the round-2 winner **The Weir** (seat a2, variant 2; blind
key B/2) with the owner's four absorptions fused in:
- (a) the Weir's calendar column, which expands to a month view;
- (b) the Ledger route, from The Ratchet Board;
- (c) the Library column grown into a Library built for thousands of items;
- (d) projects as compositions on top of the pipeline, with a per-resource plan, and Runs as the
  place to steer them. This half comes from The Switchboard.

It was then polished in /perfect-style waves that the owner gated.

The prototype lives at `.contest/arena/foundry-next-design-r4/polish/variant-1/`. **That folder is
git-ignored. Step 0.1 commits it.**

> Revision 1 of this plan targeted *The Light Table*. The host had read the owner's seat/variant
> label "A/2" as a blind letter. The owner corrected the mapping, and round 3 is closed as built on
> the wrong baseline. Everything below targets The Watershed.

**The owner's rule for the design system:** *the winning design establishes the new kit, not vice
versa.* The kit is **extracted** from the prototype's pages. Tokens and components are named for
what the design already does, and extraction must not change a pixel: the style contract between
the prototype and the rebuilt route holds at 0 deviations. No token audit may bend the design
toward an existing system.

---

## 1. What the owner gets

- **One floor from first prompt to published file.** Every medium flows Foundry → Weir → Library →
  Calendar on one screen, and a Project carries its composition's Parts, Jobs, Decisions,
  Library items and Slots for every medium: image, article, audio, video and style. Today the same work is
  split across five state models, seven header modules, three machines and one browser's IndexedDB.
- **Every decision at the Weir, and every act in one Ledger.** Today there are four verdict state
  machines, three gate locations and no audit trail. After the rebuild there is one decision kernel,
  one Weir with its Board sheet, and one append-only Ledger that both the operator and agents can
  query.
- **Every producer started from the screen, with cost and queue position shown first.** Today
  forge, Dojo and Strips can only be started from a CLI. After the rebuild every producer is a Job on
  a declared lane, with a dry run by default.

**Not a port.** The new version is built on a foundation that absorbs the current app's best
mechanisms (leases, resumable step machines, revisioned verdicts, the router's "no silent
elimination" rule, spend reservation, freshness-labelled polling, identity eviction, the gate
registry). Each module is cut over once and its v1 code deleted in the same change. Code quality is
a ratchet: every gate below starts at the strictest value and may only move toward stricter.

**Only the landing page stays as it is** (`app/page.tsx`, `app/_landing/`). A separate project
decides its future. Step 0.3 unhooks it from the code that is going away.

---

## 2. Product shape: routes and records

### 2.1 Routes (from the fused prototype)

The Floor is the hub. Every other page is a deeper surface of one of its columns.

| Route | What lives there | Replaces (v1) |
|---|---|---|
| `/` (studio) → **Floor** | Four media lanes (Image, Article, Audio, Video). Each lane flows left to right: **Foundry** column (a composer that shows cost, minutes and queue position before Launch; running work) → **the Weir** (piles awaiting the operator) → **Library / Projects** column (ratified) → **Calendar** rail. The header shows the NEXT decision, 24h spend and the ledger delta. `⇧1–4` focuses a lane | `/foundry` stations, the Pipeline canvas, the Projects shelf, article topics, Suno and music-video queue views, the Sound lab's place in the nav |
| **Board** (a sheet over the Floor, deep-linkable) | The Sovereign Board: one decision desk per packet with matrix cull (K/X/U, reasons 1–4, ⇧K/⇧X row, Z zoom, ⌫ undo), blind pairs and packet review (articles, cuts). Commit is one act per packet. Esc returns to the Floor | `/board`, Foundry Cull, Extract, Dojo and Strips verdict UIs, article approval, the per-step sign-off in `/studio`, audio triage |
| `/projects` → **Plan** | A project is a **composition** (recipe: Film, Album video, Explainer, …) of parts. Each part is a job: a model on a lane, with units, time, cost and dependencies. The model picker prices every choice. The style is chosen from the Library | `/projects`, `/projects/new`, `/studio/[projectId]` (its six steps become parts) |
| `/projects` → **Runs** | The day-line across every resource (GPU box, render box, render box · Chrome, text seat, Google, ElevenLabs, Leonardo), the Weir lane and the Calendar lane. Select a part to see what blocks it and what it blocks. Re-route shows Δ finish time, Δ cost and queue position before you commit. Reorder, pause and retry | The Pipeline canvas, the music-video and Suno queues, the studio stepper |
| `/projects` → **Compose** | A new composition from a recipe, a style, a take and a topic | The create wizard |
| `/library` | References and ratified assets for all media, at thousands of items. The vocabulary is the spine: Kind, then that kind's real vocabulary, then state, collections and origin. Live counts, OR within a group and AND across groups. A virtualised grid or list and a detail panel with lineage | Library (Styles, Assets, Animations, Audio), Foundry Styles (the catalogue ratchet lives here) |
| Calendar (the Floor rail ⇄ a month page) | The rail expands to a month with channel toggles and publish errors shown verbatim. Esc returns to the rail | `/calendar` |
| `/ledger` | A typed, append-only event list. Facets for actor (operator, agent, machine), type and lane; a time strip; filters in the URL; a JSONL view; `query()`; every subject linked to its record | Nothing (new) |
| `/kit` | The design system, extracted from these pages | `/kit` (Almanac v2 retired) |
| `/articles/:runId`, `/board?…`, `/playground`, `/foundry`, `/studio/:id` | **Redirects** to the matching Board packet, Project or lane. Skills send humans to these addresses | — |

### 2.2 The record model (the spine; full schemas live in `packages/domain` (`@gt/domain`) in Phase 1)

```ts
Run       { id, lane:"image"|"article"|"audio"|"video", producer, prompt, recipe?, styleId?,
            estimate:{seconds,usd|null,unpricedReason?}, queuePos, state, projectId?, partId? }
                                                       // launched from a Floor composer or as a project part
Project   { id, title, recipe:"film/<template>"|"album-video"|"explainer"|…, styleId?, takeId?,
            topic?, runtimeS?, rev, parts: Part[], state }      // a composition on top of the pipeline
Part      { id, kind:"research"|"script"|"frames"|"motion"|"voice"|"score"|"sfx"|"cut"|"still"
                 |"words"|"render"|"draft"|"critique"|"publish"|…,
            model, lane:"gpu.local"|"box.render"|"box.chrome"|"seat.text"|"cloud.google"|…,
            units, estimate, after: PartId[], gate?:"verdict" }  // each part runs as one Job
Job       { id, partId|runId, lane, state, lease?, attempt, progress, spend, error? }   // see 4.3
Packet    { id, lane, source:"forge"|"extract"|"dojo"|"strips"|"article"|"triage"|"cut"|…,
            mode:"matrix-cull"|"blind-pair"|"packet-review", items: Candidate[], state }  // a Weir pile
Candidate { id, jobId, media: BlobRef, grades: Grade[] }  // grades shown only when calibrated (3.2)
Decision  { key, verdict:"keep"|"reject"|null, reason?, rev, by:"operator"|"agent", surface, at }
LibraryItem { id, kind, vocabulary:{…}, state, collections[], origin, rights,
              source:"real"|"fixture"|"derived", lineage[], media?: BlobRef }   // ratified things live here
Style     { id, status:"candidate"|"proven"|"locked", observables, recipe, negative, palette?, evidence[] }
Slot      { id, libraryItemId, channel, at, state }      // the publish state machine (v1 lib/publish)
Event     { seq, at, actor:{kind:"operator"|"agent"|"machine", id}, type, subject:{kind,id}, lane?,
            cost?:{usd,src:"real"|"model"|"illustrative"}, data, prevHash, hash }
```

A v1 Project is imported as a **Project** whose recipe comes from its discipline × template. Its
six studio steps become Parts, and per-step sign-off becomes Decisions on the matching Packets. The
recipes the prototype uses (Film, Album video, Explainer) are the first entries in `@gt/catalog`'s
recipe table. A Weir pile is a Packet. Every decision surface is a Packet mode, not a separate
screen.

---

## 3. What the rebuild keeps (the intelligence inventory)

The bar: nothing clever in v1 is lost. Each mechanism is either kept as it is, generalised into a
foundation primitive, or replaced by something strictly better. Sources: the three inventories of
2026-10-14 (background runtime, UI/API and gates, agent touchpoints).

### 3.1 Runtime and durability

| v1 mechanism | Why it matters | Next home |
|---|---|---|
| `lib/diskTx.ts` (in-process FIFO plus cross-process lock; EEXIST/EPERM/EBUSY) and 3 weaker lock copies (`lib/sound/store.ts`, `lib/articles/store.ts`, Python `catalogue_lock.py`) | No lost updates across Next, CLIs and Python | **Generalise.** `kernel/store`: one transactional port. The local adapter is SQLite (WAL); a hosted adapter is added later. Content-addressed blobs stay on disk. Replaces all 4 lock copies, 4 atomic-write copies and 6 pid-liveness copies |
| `lib/foundry/catalogue.ts` (write-ahead journal line, `_rev`, idempotent retry that reuses its revision) | Six writers in two languages converge | **Keep the semantics.** The catalogue becomes tables with a revision column. A git export of `styles.json` is kept as an artifact for diffs |
| `lib/foundry/verdictLog.ts` + `app/foundry/gate/useGate.ts` (keyed revisioned patches, 409 with current rev, append-only log, 400 ms merge window, pagehide keepalive, ticketed commit plan) | Ends last-writer-wins between tabs and the Board; history outlives deleted media | **Generalise** into `kernel/decision` (server) plus `ui/board` (client). Every Weir packet mode (matrix cull, blind pair, packet review) is an adapter, so the Board stops being an adapter layer |
| Extract step machine (`lib/foundry/extract/engine.ts`, pure `next()`, bounded `perform`, manifest-only state, TTL lease, breaker that excludes money stops, per-run ceiling checked before each unit) | Runs on Cloud Run's request ceilings and in a CLI with the same code | **Generalise** into `kernel/job`. Add a fencing token to the lease |
| MV queue (`lib/sound/mv/queue.ts`: plan from missing outputs, redo-by-part, lease claimed before recovery, record updated before files are deleted) | Resume without bookkeeping; never re-spend | **Keep the planner idea** as the job model's default (`missingSteps`) |
| Suno queue rules (crash means switch off and name what was running; driver-health pause; enqueue never spends) | Credits may already be spent; the operator looks first | **Keep** as job-engine defaults |
| GPU lease (`lib/gpu/lease.ts` + `pipeline/gpu/lease.py`: heartbeat, TTL, ticket, FIFO, cross-tested in both languages) | One holder per 24 GB card | **Keep.** It is the template for `kernel/lease` |
| Article status machine (`lib/articles/types.ts` `TRANSITIONS`, shared by client and server) | Client and server cannot disagree | **Keep the pattern.** Every Job/Part state machine is a declared table imported by both sides |
| Turn ledger (`lib/turns/ledger.ts`: server record, 202 plus poll, bootId/pid/host ownership, orphan sweep, prompt digest only) vs `lib/jobs.tsx` (localStorage, "only narrows" the cross-tab race) | Durable, honest job records | **Replace** `jobs.tsx` serialisation. The bell becomes a pure view of server Jobs |
| Forge (`pipeline/foundry/forge.py`: resumable per file, GPU tenancy, `grader_digest`) and Dojo stack purity (`dojo_run.py` refuses a spec without a stack) | Hours of GPU work survive crashes; one bill per cycle | **Keep as external workers** that speak the `kernel/job` contract (manifest plus lease), so the UI treats them like any other job. "Lane declared, never inferred" becomes a kernel check |
| `lib/publish/schedule.ts` (at-most-once claim before upload, missed-window policy, drift stops a slot, DRY default) | Never double-publishes | **Keep.** Fix the gap: nothing in-app calls `tick` today, so it moves to a real scheduler (a worker on the render box; Cloud Scheduler when hosted) |
| Freshness (`lib/usePolling.ts`, `lib/pollFreshness.ts`, `StalePoll`) | Stale status is never shown as current | **Keep the contract** (value plus age plus edge health). The transport becomes SSE from the event log |
| `lib/musicVideoExport.ts` determinism (preview and export run the same `renderFrame`, frame-indexed capture) | What you approve is what renders | **Keep.** It becomes a render worker behind the job contract |

### 3.2 Routing, cost and posture

| v1 mechanism | Next home |
|---|---|
| `lib/imaging/router.ts` + `lib/text/router.ts` (capability-first, `PREFER_ONLY`, no silent elimination, `trail`/`reroutedFrom`, ladder rungs with no canned floor, reserve before call) | **Generalise** into `kernel/router`, one kernel with capability tables per medium (image, text, audio, video). The Runs re-route action writes a steer, not a new code path |
| `lib/spend/*` (reserve → settle → book; NaN refused; deferred settle; count-only classes; refuses a per-instance hosted store) | **Keep as-is.** Build its SQLite adapter first; Jobs carry their reservation |
| `lib/imaging/pricing.ts` ("never invent a price": source plus date, or `undefined` with a reason) + `receipts.ts` (idempotency) | **Keep.** Merge the text and imaging tables; receipts become durable in the store |
| STUB/LIVE arm + publish DRY + `SUNO_DRIVER=fake` + `__setMvEngines` (four dry mechanisms) | **Replace** with one server-side `DryRun` request mode, on by default, returning `wouldCall` receipts. The Runs "launch" confirm shows the receipt |
| `lib/capabilities.ts`, `lib/deployment.ts`, `lib/localMode.ts`, `lib/devAuth.ts` (compiled out), `lib/apiAuth.ts` + `lib/principal.ts` (fail-closed, async guards, verified Firebase tokens over WebCrypto) | **Keep.** Retire the legacy shared-secret mode once the CLIs authenticate (P2 below). Remove `apiAuth.devOpen()`, which duplicates `DEV_AUTH` |
| Fixture universe (`NEXT_PUBLIC_GRAVITONE_DATA=fixtures`, `fixtures-out/`, its own IndexedDB name) | **Keep** as a store namespace (a second SQLite file) |
| `lib/studioArchive.ts` (gzip NDJSON, trailer manifest, per-section SHA-256, all-or-nothing import, re-minting) | **Keep the format.** It is the migration path for browser-held projects into the server store (Phase 4) |
| Calibration (`lib/foundry/calibration.ts`: AUC per field with bootstrap CI; `cullOrder` uses only calibrated fields) + Dojo blind gate (`training/blind.ts`) | **Generalise.** Every machine score is registered in a calibration series and shown only when calibrated. Every gate is blind-first, then the machine verdict is revealed. The fused prototype already labels `craft · inverted 0.29` |

### 3.3 Frontend foundation

| v1 | Next |
|---|---|
| `components/ui/signal/*` (Hint, Tally, PipRow, TabRail, Fold, StackBar, BandTrack, Ghost, UpstreamBreak, Keycaps, StaleBadge, Provenance) and the README law "no slot for a paragraph" | **Keep** the APIs and the law; restyle to the new tokens |
| `signal/keymap.ts` + `components/ui/layers.ts` (one declaration drives binding, guarding and the drawn key table; one top-layer router) | **Keep** as the only keyboard path. Lint against raw `addEventListener("keydown")` (v1 has 30 of these, plus `keyGuard.ts` and a third keymap) |
| `lib/useRemembered.ts`, `lib/usePolling.ts`, `components/kit/Pager.tsx` (`useWindow`) + `useVirtual`, `components/ui/Pending.tsx` + `next/dynamic`, `sideEffects` | **Keep.** Merge the two windowing hooks into one. The Library's 5,000-item grid is the proving ground |
| `lib/identityEviction.ts` + walk probe, `storageRemedy.ts`, `GlobalErrorBridge`, `announcer` | **Keep verbatim.** Put the 10 raw `localStorage` writers behind one storage adapter that registers keys with eviction by construction |
| Pipeline canvas pure modules (`camera`, `geometry`, `grid`, `cells`), ghost flight, `MoveMap` (a keyboard alternative to drag) | **Keep for Runs**: drag a bar to another lane, with MoveMap as its accessible twin |
| Design tokens: four "worlds" (Obsidian, Almanac kit with 75 parts that have zero adopters, Obsidian-kit, Paper Cosmos); `globals.css` redefines Tailwind's `text-sm` as 16 px | **Replace.** One world, **extracted from the winning design**: the prototype's `tokens.css` plus the values its page sheets (`floor.css`, `projects.css`, `library.css`, `ledger.css`) actually use. At extraction they held 318 colour literals and 142 px font sizes outside `tokens.css`. These become a derived token artifact in `packages/ui` (one `tokens/source.json`, primitives → roles; the generated `tokens.css` and `tokens.ts` mirror carry a regeneration header; the values stay byte-equal to the prototype). Components style themselves with co-located **CSS Modules over those variables**, never with Tailwind utilities, so the prototype's CSS ports nearly 1:1. The rule is the owner's: extraction changes names, never pixels. Tailwind and Paper Cosmos stay only for the landing, and for v1 until each surface is retired (§9) |
| Auth on every route through a client `AuthGate`; `firebase/auth` (~110 KB) in the root chunk of every route, including `/` | **Replace.** Auth lives in a `(studio)` route-group layout. Page data renders on the server, because the stores are server-side |

### 3.4 API layer

Replace the hand-copied pieces with four foundation pieces:
- **`route({guard:"money"|"access"|"public", maxDuration, bodyCap}, handler)`**: one JSON parse and **one error envelope** `{error, code, detail?}`. v1 answers `{detail}` in 37 routes and `{error, code}` in 7.
- **`serveFile(req, abs, {ranges, mime})`**: v1 has 4 copies of range serving.
- **One `apiClient`** returning `Result` (`ok | unavailable | refused`, `status 0` means network, `rev` on 409, idempotency key). v1 has about 7 `call` helpers with 3 failure shapes.
- **One `AppError(code, status)`**: v1 has about 30 Error subclasses.

### 3.5 Quality gates (kept verbatim and extended)

`pipeline/gates.mts` + `run-gates.mts` (one registry; blocking/advisory by determinism;
outcomes 0/1/2; CI projection; liveness rule), `check-bundle.mjs` (with its positive control),
`lint-ratchet.mjs`, `check-type-scale.mjs`, `check-narration.mjs`, the two Playwright lanes (node
probes; live lanes with the legibility negative control), the mutant registry,
`cx-screens.mjs` + `cx-capture.mjs`, `.githooks/*`, and the `.claude/settings.json` deny list.

**New code starts at the strictest setting:**

| Gate | v1 today | Next starts at |
|---|---|---|
| Lint warnings | 26 (`lint-baseline.json`; its 150 is `filesFloor`, not a warning count) | 0 in `packages/` |
| Import cycles / layer inversions | 22 SCCs; lib→app 55, pipeline→app 31, components→app 4 | 0 (`next-structure`) |
| `as unknown as` / `JSON.parse(...) as` | 53 / 30 | 0; `JSON.parse` only in `packages/domain/src/door.ts` |
| Error classes / result shapes | 65 subclasses / ad hoc `{ok}` | one `AppError` taxonomy, one `Result` |
| Files over 400 LOC | 101 (6 over 1,000) | hard cap 400 in `packages/` |
| Unit rung | none (the Playwright runner is the node lane) | Vitest for every package, with template-copy SQLite fixtures |
| Narration budget (`title=` prose, Hint words) | 6 | 0; Hint ≤ 12 words is the norm |
| Type floor | 16 px label floor | 12 px absolute, 14 px body. The prototype's law, checked by a live probe on every route |
| Raw keydown listeners | 30 | 0 (lint rule) |
| Error envelopes / client helpers | 2 / ~7 | 1 / 1 |
| Probes without a mutant | 249 | Unguarded budget starts at 0 for new probes |
| Legibility baseline | ratchet | 0 contrast misses on new routes |

**One v1 claim to correct (scouted 2026-10-14; an earlier note here said `sealNetwork` did not exist - wrong):** `sealNetwork()` exists at `pipeline/integration-imaging.mts:102`, but it seals only that standalone script, which no gate runs. `pipeline/gates.mts` and `gates.yml` cite it as the `probes` lane's seal, and the lane has none: `playwright.config.ts` stubs nothing, and 243 of 284 specs never replace `fetch`. Phase 0.5 installs a real lane-wide seal (loopback allowed, every other host refused and reported) with a negative-control probe, and corrects the citations.

Domain gates tied to retired features (`notebook`, `trailer-structure`, `render-gate`,
`frames-prompt`, `ads-prompts`, `style-refs`, `clips`, `vocab`) are **kept running against v1
until their feature is rebuilt.** At that point they are ported, not dropped (Phase 4).

---

## 4. Target architecture

```
app/
  page.tsx, _landing/           untouched (step 0.3 moves its imports to @gt/catalog)
  (studio)/layout.tsx           auth + shell; the only client boundary for identity
  (studio)/page.tsx               the Floor (lanes, composers, Weir, Library/Projects column, Calendar rail)
  (studio)/@sheet/board/[packet]  the Board sheet as a parallel/intercepting route over the Floor
  (studio)/projects/[[...id]]/    Plan · Runs · Compose
  (studio)/{library,calendar,ledger,kit}/
  api/<area>/…                  every handler wrapped in route()
packages/     npm workspaces, TypeScript source run by Node 24 type stripping, transpiled by Next (§9)
  catalog/    @gt/catalog   pure registry data (recipes, presets, channels); no I/O; the landing may import it
  domain/     @gt/domain    ids · errors · transitions · door (shipped) + run · project · part · job ·
                            packet · candidate · decision · library-item · style · slot schemas
  kernel/     @gt/kernel    store · lease · job · decision · router · spend · dryrun · events · posture
                            (io-free cores + one driver each; store seam with a contract suite)
  producers/  @gt/producers forge · extract · dojo · strips · article · suno · mv · still · cut · publish
                            (each: recipe parts → jobs; drivable by request, CLI or worker)
  ui/         @gt/ui        generated tokens + React components with CSS Modules, keymap registry,
                            layers, list window, freshness, storage adapter with eviction
lib/          v1, frozen behind its ratchets; shrinks as each cutover deletes what it replaced
workers/      render box: job runner, publish tick, GPU-lane forwarders (Python workers keep their CLIs)
pipeline/     CLIs: same verbs, same --json, same exit codes 0/1/2, now thin over @gt/producers
```

**The ledger is the spine, not a log file.** Every state change is written in the same transaction
as its `Event` row (an outbox pattern). The hash chain makes tampering visible. `/api/ledger` and
`pipeline/ledger.mts query` expose the same `query({actor, act, subject, since, …})` the prototype
shows. SSE from the event table feeds every view, which retires most polling.

**Store decision (owner to confirm):** SQLite through Node 24's built-in `node:sqlite` (verified on
this machine: SQLite 3.51.2), opened by Python's stdlib `sqlite3` for the forge and Dojo workers.
WAL mode handles one writer and many readers across processes. Blobs stay content-addressed on
disk. The hosted posture adds an adapter behind the same `kernel/store` port; until it exists the
app refuses the managed posture, as `lib/spend` already does.

---

## 5. Contracts that must not break

Skills, CLIs and agents call the app. A rename that is not versioned breaks them silently.

1. **The `lib/` seam and CLI interfaces.** Verbs, `--json` single-document stdout and exit codes
   0/1/2 stay the same for `article`, `music-video`, `sound`, `publish`, `strips/run`,
   `foundry/extract` and `preflight`, as do the spend guards (`--yes`, `--budget-usd`, `--dry`).
   The CLIs become thin over `@gt/producers`, with the same names exported or re-exported.
2. **Pure logic still inside `app/` that 11 CLIs and gates import:**
   - `app/_phases/frames/{shotPrompt,frames,sceneSpec,shots}.ts`
   - `app/library/{presets,trials}.ts`
   - `app/_phases/_shared/notebook/*`
   - `app/_phases/script/{gate,renders,trailer/*}`

   Move these to `lib/` **before** any `app/` deletion (step 0.4).
3. **Store layout and env overrides** (`ARTICLES_STORE_DIR`, `SOUND_STORE_DIR`, `FOUNDRY_DIR`,
   `GPU_LEASE_DIR`, …) stay honoured until each store migrates. Then the migration writes a
   one-time importer and leaves a `MIGRATED` marker in the old root.
4. **The `mv.json` worker lease and the catalogue lock/journal** shared with Python. Migrate the
   writer and its readers in one change, never one side alone.
5. **Turn-class names** (`lib/text/types.ts`, mirrored in `.ai/use-cases.json`) are a public enum.
6. **Money-route gate:** the auth scheme changes only through `PRINCIPAL_MODE` and a CLI token.
7. **Deep links:**
   - `/articles/:runId`, `/board?src=&st=&i=`, `/foundry` tabs and `?step=` become redirects.
   - `cx-screens.mjs` ids are re-mapped in that one file, and the vocabulary stays.
8. **`HarnessProtocol`** is bumped on any change to the bridge.
9. **Single-source registries:** `MODULES` and the plan-template catalog. The `.claude/*/config.md`
   overlays are updated in the same change.
10. **Gate ids, `.ai/manifest.yaml` capability ids and the deny list.**
11. **Context-map identity:** rescan through Personas on the machine that owns the map, then
    regenerate `.ai/registry-map.json`. Expect /conform state to reset where context ids change,
    and say so.

---

## 6. The way there: phases

Each phase ships something the operator uses, deletes the v1 code it replaces in the same change,
and has an exit gate. Phases 2–6 are each run as /perfect waves (Director plus disjoint builder
lots) inside the phase.

### Phase 0: settle the ground (S, about 1 session)

> **Done 2026-10-14** (`daf16ec`..`1c473fe`). The approved prototype and the Almanac source are committed;
> the overlay, CLAUDE.md and map-ownership drift is corrected; `@gt/catalog` exists and
> `landing-isolation.probe` proves the landing reaches no `app/_phases`, `app/library`, `app/_studio`
> or `studioDb`; ~95 pure modules moved to `lib/` behind one-line stubs and `no-app-imports.probe`
> proves nothing under `lib/`, `components/` or `pipeline/` imports `app/` (allowlist: the
> compositor's four importers, held by a live session); the node lane has a real network seal.
> `npm run verify`: 21 of 22 gates pass. The one red is the `sound-store` probe, caused by
> a sibling session's uncommitted sound ledger; Phase 0 did not cause it. Four new mutants killed.
> Carried forward: move `app/_phases/frames/music-video/compositor.ts` once its session lands, then empty the allowlist;
> probes must import `lib/` directly (a dynamic `import()` of an `export *` stub does not resolve
> under the probe runner).

- **0.1** Commit the fused prototype and kit as the design reference: `docs/next/prototype/` with
  real media thumbnails only. The full `data/` stays out of git (20 MB); a script regenerates it
  from `foundry-out/` and fixtures. Also commit the v2 Almanac source the `kit` overlay points to, so
  that pointer is not left dangling.
- **0.2** Fix the drift the inventory found:
  - The committed `context-map.json` was exported from the other machine's project (`91d8170c`,
    root `mkdol`). This checkout is `d57f858b`. Decide which machine owns the map.
  - The overlays `.claude/cx/config.md` and `.claude/perfect/config.md` say Motion was retired, but
    `lib/projects.ts` `PHASES` has it.
  - Four overlays point at `C:/Users/mkdol/...` vaults.
  - `.claude/cx/config.md` lists 17 screens; `cx-screens.mjs` has 23.
- **0.3** Pull registry constants into `packages/catalog` (`@gt/catalog`) (no IndexedDB import) and point
  `app/_landing/*` at it. Delete `app/_landing/sky.ts` (dead for the landing).
- **0.4** Move the pure logic named in §5.2 out of `app/` into `lib/`, leaving re-exports.
- **0.5** Seal the node probe lane's network (see §3.5), and point the `probes` gate's citation at the mechanism that actually runs.
- **Exit:**
  - `npm run verify` is green.
  - The landing imports nothing from `app/_phases`, `app/library` or `lib/studioDb`.
  - No CLI imports from `app/`.

### Phase 1: foundation (L, 3–4 waves)

> **Done 2026-10-15** (`5ff36c3`..`e6492e7`, four waves, 13 builder lots).
> - `@gt/domain`: every §2.2 record as a zod schema; lifecycles as zod-free `*.machine.ts` tables
>   (absorbed from v1's turn ledger, extract engine, MV/Suno queues, publish slots); `unauthenticated` (401) joins
>   the error taxonomy.
> - `@gt/kernel`: store (node:sqlite, WAL, BEGIN IMMEDIATE, sync tx callback; two-process no-lost-update test),
>   migrate, blob, events (outbox by type, RFC 8785 hash chain verified by stdlib Python), lease (fencing;
>   one JSON spec run by Node and Python; mixed-process contention test), job (missing-output planner,
>   ceiling-before-unit, breaker, `interrupted` on crash), decision (revisioned, blind-first reveal,
>   idempotent commit), calibration (v1's numbers pinned), spend (lapsed reservations keep counting;
>   v1 SpendStore port), router + pricing + receipts, one DryRun mode; `openKernel`; crash-prefix
>   enumeration in every driver.
> - `@gt/ui`: keymap registry (one listener), layer stack (+ tooltip kind), window (50k proven), freshness,
>   storage with eviction by registration; 29 components over generated tokens, one status table.
> - Server seam `app/_server`: `action()`, `route()`, `serveFile()`, SSE `/api/events/stream`, session
>   `/api/session`. `(studio)` shell + the new `/kit`; v1's Almanac kit retired (§8.5).
> - Gates added: unit mutation rung (`npm run test:unit-mutants`, budget 0; 92/92 killed after fixes),
>   client-closure guard (no classic zod in a browser module), per-route first-load budget
>   (`/kit` 213,962 B gzip, of which 48.5 KB is v1's root until Phase 6), route-wide type floor +
>   legibility live probe, `npm run style-contract` (8 prototype pages, 141 measurements).
> - `npm run verify`: 21 of 22; the red is `sound-store` (a sibling session's uncommitted ledger), as at Phase 0.
> - **Exit status:** kernel probes incl. crash-prefix and cross-language lease pass. The style contract holds
>   on ledger, pair, plan, runs; five deviations remain where the prototype disagrees with ITSELF (owner to rule):
>   `.btn` padding-right 8px in floor.css vs 10px in tokens.css; `.toggle` rest colour faint vs muted;
>   search-field keycap inset 32px (Library) vs 34px (Ledger).
> - **Carried forward:** Ghost outline 1.21:1 and disabled Button/TabRail text 2.2-4.3:1 are prototype-faithful
>   contrast misses, baselined on `/kit` (owner: fix the design or keep); a lint hatch for single-component
>   values (6 roles admitted against the test, ADMISSION.md); `(studio)` still nests under v1's root layout
>   (Firebase in first load) until Phase 6; the compositor move to `lib/` (its session has landed);
>   v1 `/foundry` shows new legibility findings from today's foundry-out data (not a Phase 1 change).
- **Kernel:**
  - `kernel/store` (SQLite plus blob store, effect port for crash enumeration)
  - `kernel/lease` (with fencing token; spec tests shared with Python)
  - `kernel/events` (outbox, hash chain, query, SSE)
  - `kernel/decision` (revisioned patches, blind-first reveal, calibration registry)
  - `kernel/job` (pure `next` / missing-output planner, bounded perform, breaker, per-job ceiling,
    declared lane, switch-off-on-crash)
  - `kernel/router` (merged imaging and text capability tables)
  - `kernel/dryrun`
  - `lib/spend` SQLite adapter
- **Server:** Server Components read `@gt/kernel` directly; every mutation is a Server Action that
  goes through the `@gt/domain` door; live state arrives over SSE from the event ledger. `route()`,
  `serveFile()` and the one `AppError` envelope serve only CLIs, agents and file bytes. There is no
  general client fetch layer: client state is UI-only (cursor, selection, drafts).
- **UI:** tokens and components **extracted from the prototype's pages** (the design leads; see the
  owner's rule at the top) as generated token variables and CSS Modules (§9); `ui/signal`, keymap,
  layers, one window hook, freshness, the storage adapter with eviction; the `(studio)` shell with
  auth in the layout.
- **Gates:** Phase 1 builds INSIDE the governance skeleton of §9, which is live before it starts
  (`next-structure`, `next-typecheck`, `next-unit`, `next-tokens`, each proven red once), plus the
  type-floor live probe over every new route, narration 0, and Vitest kernel tests with mutants.
- **Exit:**
  - `/kit` renders on the new foundation, and a capture of the prototype's own pages (Floor, Board
    sheet, Plan, Runs, Library, Ledger) against kit specimens holds the style contract
    (`contest/scripts/style-contract.py`, 0 deviations on the named roles).
  - The kernel probes pass, including crash-prefix enumeration and the cross-language lease test.

### Phase 2: Ledger and Runs, read-only first (M)
- Adapters project every v1 store (forge runs, extract, training, strips, articles, Suno, mv,
  publish, turns, spend) into `Event`s and `Job`s. Nothing writes yet.
- Ship `/ledger` (filters in the URL, JSONL, `query`, deep links to each record) and
  `/projects` → Runs (resource lanes, NOW line, what-blocks-what, the Weir and Calendar lanes) over
  real data. **This is the first value:** the operator sees every lane and
  every act in one place, before any producer moves.
- CLI auth token replaces the legacy shared secret on money routes.
- **Exit:** ledger counts reconcile with the v1 stores (a probe compares them); Runs shows every
  live job the v1 UIs show.

> **Done 2026-10-15** (`9c17dfb` Phase 1 rulings, `ec399f2` wave A, `d2785b0` wave B,
> `1f38dcd` a strengthened strip test). What landed:
> - **The ledger knows v1** (`lib/ledger/v1`, `pipeline/ledger-sync.mts`): 12 sources (the plan's
>   ten, the GPU queue, video clips) project into the kernel ledger, read-only. Two clocks on every
>   projected event (`occurredAt` + `atSrc`, the derived ones drawn `≈`); a natural key makes
>   re-sync idempotent in the store; a snapshot field is an observed fact, never back-dated. A sync
>   starts from a page render without blocking it, claim-guarded across processes. Real
>   `foundry-out`: 1387 events, every source reconciles exactly, Python verifier intact.
> - **`/ledger`**: URL filters, facet counts with their own filter left out, the day strip, a
>   windowed list, JSON Lines, a detail panel, live arrivals over SSE; `GET /api/ledger?format=jsonl`
>   for agents.
> - **Runs** at `/projects/runs` (beside v1's `/projects` until Phase 4): 8 resource lanes, Weir and
>   Calendar rows, packing with +N, NOW, what-blocks-what, inspector. Read-only: write verbs are
>   neither drawn nor bound.
> - **Per-caller CLI tokens** (`pipeline/token.mts`, kernel `token`) on both doors. The shared secret
>   retires for non-browser callers with `SHARED_SECRET_CALLERS=browser`; the browser's bundle
>   secret is its only credential on a local-mode machine and retires at Phase 6 with the v1 screens.
> - **Exit evidence:** `ledger-reconcile.probe` (all 12 sources, re-sync appends 0) and
>   `runs-live.probe` (Runs' live set equals each v1 view's own predicate), 17/17 new probe mutants
>   and 117/117 unit mutants killed. Verify: every gate green but `sound-store` (sibling ledger).
> - **Decided in the Director's seat:** Runs reads v1 live work at render time and stores no Job rows
>   for it; the six browser-only `lib/jobs.tsx` kinds are not observable server-side; in the fixture
>   universe the new world reads `fixtures-out/` for all five stores v1 itself reads inconsistently
>   (strips, articles, turns, spend, clips).
> - **Carried forward:** v1 defects seen, not fixed - a strip run has no holder (a dead pipeline
>   reads `running` forever); the Suno/MV snapshot GETs start paid workers; the Calendar GET and
>   every spend read write their files. No OpenAI resource lane (such work is drawn on the vision
>   engine's lane, marked). v1 has no per-record foundry URL (links go to `/foundry`). `LiveJob`
>   carries no `projectId`/`after` yet, so threads light only where v1 records a project. The
>   Ledger's search ⏎ applies the query rather than jumping to rows (revisit with Library, Phase 5).

### Phase 3: the Floor and the Weir (M–L)
- Every decision surface becomes a `kernel/decision` adapter: cull, extract, Dojo (blind), strips,
  article approve (dossier), audio triage, Suno bands, mv keep/drop, proof/adoption.
- Ship the **Floor** (four media lanes; the Foundry column is read-only until Phase 4 moves the
  producers; the Weir piles; the Library/Projects column; the Calendar rail) and the **Board sheet**
  over it: matrix cull, blind pair and packet review, with one commit per packet.
- Retire `/board`, the Foundry Cull, Extract, Dojo and Strips views, and article approval. The
  per-step studio sign-off follows in Phase 4.
- Move the gate kernel `useGate` into `ui/board` unchanged in behaviour (its probe carries over).
- **Exit:**
  - Drive every verdict, undo, commit and blast-radius preview in a browser and assert the store
    write.
  - The decision log is append-only and shows in the Ledger.
  - `/board` redirects.

> **Done 2026-10-15** (`47b8095` wave A, `694994f` a deterministic lease test, `7245d4b` wave B,
> `26820a6` wave C). What landed:
> - **Decision kernel v2** (`packages/kernel/src/decision`): reasons per source, picks
>   `a|b|tie|both-bad`, a commit that refuses the undecided, a consequence token over the decisions
>   and the digest of the v1 state read, and an apply outbox (retry ceiling 5, then stuck, redrive).
> - **Eight adapters** (`lib/decision/v1`): forge, extract, Dojo (blind), strips, article,
>   audio triage, Suno, mv. Each opens a v1 record as a packet carrying v1's verdicts, previews
>   through v1's own planners, and applies through v1's own writers, idempotently; a v1 outcome that
>   differs is parked as stuck, never overwritten. mv drops delete only at commit, after the preview.
> - **The Floor** (`/floor`: four lanes, the Weir piles, NEXT) and **the Board sheet**
>   (`/board/<packet>`, intercepted over the Floor): matrix cull, blind pair, packet review, losses
>   shown at the gate, a legend of only the source's reason keys. Applies are kicked after a commit
>   and swept, claim-guarded, on Floor and Board renders and by `ledger-sync apply`.
> - **Retired:** v1 `/board` (a redirect; `?src=&i=` maps to its packet), the `/foundry` Cull,
>   Extract, Dojo and Strips tabs, the article GatePanel, `/playground?m=triage`.
> - **Exit evidence:** `tests/live/board-exit.live.spec.ts`, 11/11 over a seeded temp universe:
>   every source opened from its Floor pile, decided with keys, undone, previewed, committed; the
>   kernel events, the v1 store write (by v1's own reader) and `/ledger?q=<packet>` asserted; a
>   second commit idempotent; a v1 write failing once drawn on the Floor and then landed by the
>   reconciler; the store refusing to rewrite or delete a decision; `/board` redirecting.
>   Mutants: 145/145 unit killed (the L24 red-proofs in its report; one live mutant,
>   commit-apply-never-kicked, survives because the render sweep delivers anyway, and the Vitest
>   mutant catches it). Verify: every gate green but `sound-store` (sibling ledger).
> - **Decided in the Director's seat:** proof and adoption wait for Phase 4 (browser-only stores);
>   a Dojo cycle fully decided in v1 still opens (as a review); aggregate piles carry a cutoff
>   (`audio/triage/<ms>`, `suno/triage/<ms>`, `mv/settled/<ms>`); a stored packet is read, never
>   re-opened; the kernel's re-open now compares the stored body (it compared the input with itself).
> - **Deviations, recorded:** the v1 Foundry launch screens (Extract upload, Dojo, Strips, Cull)
>   retired with their tabs, so launching from the browser waits for Phase 4 (the CLIs remain), and
>   `extract-progress.live` retired with the upload screen. `PacketReview` decides `items[0]` only,
>   so a multi-claim Dojo review cannot overturn its other claims (refused at the preview in v1's
>   words). Unopened Weir piles join the rail without a cap of their own. `/playground` now opens on
>   Arrange, whose pre-existing low-contrast labels entered the legibility baseline (5 -> 3 net).
> - **Carried forward:** the fixture generator lacks an article post, an mv export and strip card
>   files (the exit spec patches its own universe), and the strips store root is hard-coded to
>   `foundry-out/` in both universes. `lib/board/**` stays where the palette counts, the pipeline
>   canvas and `keys.ts` still import it. v1 defects seen earlier stand (strip run holder, paid
>   snapshot GETs, writing readers). On this machine `.env.local`'s `NEXT_PUBLIC_LOCAL_MODE=1` makes
>   `golden-path.live`'s bypass-account case read `local-owner`.

### Phase 4: Composers, Projects and Producers (L, the largest)
- **Records:** `domain/run`, `domain/project` and `domain/part`, with recipes from `@gt/catalog`
  (Film from the 10 v1 templates, Album video, Explainer, plus `article/*`, `track/*`, `style/*`,
  `strips/*`).
- **Producers on `kernel/job`, one wave each:**
  1. extract
  2. mv
  3. Suno
  4. article
  5. strips
  6. forge (worker)
  7. Dojo (worker)
  8. the six studio-step renderers as parts: research, script, frames, motion, score, cut
- Each producer's CLI keeps its contract (§5.1). Its domain gate is ported to the new code.
- **Import:**
  - Browser projects arrive via the `.gravitone` archive (one-click export in v1, import in Next),
    becoming Projects, with their steps as Parts.
  - `foundry-out/*` stores are imported by one-time scripts.
- Ship the Floor composers (cost, minutes and queue position before Launch), `/projects` → Plan
  (parts with priced model pickers) and Compose. Runs gains re-route (Δ finish time, Δ cost and queue
  position first), reorder, pause and retry. Every launch is a dry-run receipt, then a confirm.
- Retire the v1 `/projects` shelf, `/projects/new`, `/studio/[projectId]` (redirect to the Project), IndexedDB
  `projects`/`steps`, and `lib/jobs.tsx` serialisation.
- **Exit:**
  - Each producer can be started from the UI and from its CLI on the same job.
  - Crash recovery passes a kill test.
  - Spend reconciles to the meter.
  - An imported project round-trips with its plan.

> **Done 2026-10-16** (`9cb1b4b`..`7b088459`, four waves, 23 builder lots). What landed:
> - **Jobs on the kernel** (`packages/kernel`): dry jobs run end to end through one DryRun port (STUB/LIVE,
>   `SUNO_DRIVER=fake`, `__setMvEngines` and the article stub bins retired as the dry switch); spend is the meter's
>   (every priced call reserves and settles with its job and step; `Job.spend` is a projection reconciled to
>   `spend_rows`; credit-priced work is booked unpriced with its reason); lanes have slots (`LANE_CAPACITY`); an
>   operator-movable queue with computed position; re-route through the router's judgement as one verb; a crash on a
>   paid lane HOLDS it until acknowledged (owner ruling 2026-10-16); a settle hook and same-transaction release of
>   waiting parts; the worker (`npm run worker`, `npm run worker:gpu`) picks by (producer, lane); a Python job protocol
>   spec-tested against Node; ONE GPU lease (v1's file lease is a shim over the kernel's `gpu.local#1`; forge holds the
>   card for the first time).
> - **Every producer on `kernel/job`**, each CLI keeping its verbs and gaining `--json`, 0/1/2, `--budget-usd`,
>   `--dry`, `--detach`: extract, article, mv, Suno (its first queue CLI), strips, forge, Dojo, and the studio steps
>   (research, script, frames, motion, score, cut, still, words, voice). Never-re-spend holds across kills in each.
> - **Records** (`@gt/catalog` recipes, `@gt/domain` run/project/part, kernel `records` and `parts`): recipes as data
>   (9 films, album video, explainer, single-producer recipes), priced model options with their source
>   (real/model/illustrative), part/project state derived on read, receipts whose token a confirm must carry (a
>   ceiling is a stop point, not a launch gate), part records for all v1 step keys with media as blobs, one
>   server-side undo, verdicts (ads and motion included), gate parts as Board packets that ratify and release.
> - **Screens**: the Floor composers, `/projects` (composition list) and `/projects/[id]` Plan, Compose, Runs acts
>   (pause, retry, earlier/later, re-route, lane hold + acknowledge), the receipt; the part editors rebuilt in the kit
>   (owner ruling 2026-10-16) on one workspace frame - research (notebook scope board, beats board, ads brief),
>   script (document + render gate, trailer cut + structure check, ads scenarios), frames (canvas, direction
>   proposals wired, shots that render), motion (clips), score (spotting timeline), cut (finish line, animatic),
>   album and explainer parts; `/projects/import` (one click from the browser's v1 data, `.gravitone` for another
>   machine; v1 run history imported as Run rows).
> - **Retired**: v1 `/projects` shelf, `/projects/new`, `/studio/[projectId]` (redirects to the Project or the
>   import), IndexedDB `projects`/`steps` as a store (read only by the importer), `lib/jobs.tsx` serialisation (the bell
>   is a view of server jobs); 217 files after a reachability check.
> - **Exit evidence**: the same job from the UI and the CLI for every producer (`exit-same-job.live`, 15/15); a
>   process-level KILL test for the Node and the Python worker; spend reconciled across a faked-live multi-producer run
>   ($1.33 on every ledger); an imported project round-trips with its plan (`exit-roundtrip`). Verify: static gates,
>   `test:unit` 1612/1612, node lane 1976 passed (bar `sound-store`, the sibling session's ledger), live lane 143
>   passed / 0 failed; unit mutants 390/390 killed (388 in the full run; the two read baseline-red there from a
>   teardown flake in `parts-real.test.ts` under load, and each is killed run alone), probe mutants 48/48 killed.
> - **Decided in the Director's seat** (recorded in the lot commits): one job per Run or Part, gates are packets;
>   `@gt/producers` holds pure definitions over ports, `lib/producers` binds v1's engines; dry is a job property and
>   `GRAVITONE_DRY_ONLY` refuses live; part ids `<projectId>/<key>`; a rejected plate owes a re-render and a returned
>   review reopens as `<gate>#<attempt>`; strips on `seat.text` (the turns are the cost); forge/Dojo run on a Python
>   worker; disabled controls keep their dimming in the legibility baseline (plan §8 decision 7).
> - **Carried forward**: strips steps one card at a time (v1 ran three); voice and Wan clips are dry-only (no engine/app
>   path); style themes still live in IndexedDB (plates use a preset until Phase 5); the receipt has no field for a
>   part held by preflight; a project ceiling is copied per job, not pooled; `forge.py` 788 lines and
>   `lib/foundry/strips/store.ts` 492 (the 400 cap gates packages only); the Floor video composer asks a receipt with an
>   empty subject when no strips approach exists; v1 asset ids inside imported records resolve nowhere yet (Phase 5).

### Phase 5: Library and Styles (M)
- One `Style` table merges `styles.json` and Library themes. The `proven` and `locked` ratchets are
  kept; the git export of `styles.json` stays for the Python writers until they are moved onto the
  store.
- The Library becomes a server-side index (SQLite FTS5 for search, facet counts by SQL). It has a
  vocabulary-as-spine rail (Kind, then that kind's vocabulary, then state, collections and origin),
  virtualised grid and list, a detail panel with lineage, and an attention facet for unreadable or
  missing media.
- Media facts are computed **at ingest**, not in the browser: decodability, poster/keyframe,
  duration and mean brightness. The prototype had to hard-code a list of near-black renders to keep a
  pile from leading with a black cover, and probe every mp4 at boot to sink undecodable ones. Both
  become columns on the blob record, so cover choice and the attention facet are queries. Prove it at 50,000
  items with a generated corpus (latency budget: search under 50 ms p95 at 50k; measure, do not
  assume).
- Retire Foundry Styles plus Library theme tabs, `lib/themes.ts` and `lib/assets.ts` (IndexedDB).
- **Exit:** the 50k probe meets the budget, and adopting a style to locked is driven end to end.

> **Done 2026-10-16** (`ce2b7cee`..`15fd570c`, two waves, 9 builder lots). What landed:
> - **One Style table** (`@gt/domain/style` + `style.ratchet` + `styleView`, kernel `styles`): the catalogue's
>   StyleDef and the v1 theme's look in one record, status derived by one pure function; candidate -> proven
>   (operator keeps in >= 2 cells) -> locked (an explicit act, admitted only when proven, nothing pending and three
>   trial problems approved under the current block digest), both one-way - the domain machine's `locked -> proven`
>   edge is gone and the store refuses a demotion by trigger. `pipeline/foundry/styles.json` is now an export
>   (`_rev`, re-written after each change) for the Python readers; `acquire.py` writes through the Python door
>   `packages/kernel/py/styles.py`; the catalogue fence keeps guarding the other indices. 27 styles imported into the
>   operator's store; every v1 theme comes in through the importer (`v1-theme:<id>`; a theme v1 had locked arrives
>   locked and `grandfathered`, frozen; the rest meet the new gate).
> - **The Library as a server index** (kernel `library`): a hot items table, facets with counts kept by triggers,
>   FTS5 (diacritics folded, prefix indexes, one quoted door for user text), OR within a group and AND across, each
>   group counted with its own filter left out; feeds over every v1 source plus Suno clips, video clips, publish
>   exports and kernel blobs (idempotent, never pruned on a failed read). **Media facts at ingest**: a free local
>   `media-facts` job (ffprobe/ffmpeg) writes decodability, poster, duration, size and mean luma per blob; the
>   attention facet and cover choice are queries (measured on the real corpus: 37 of 396 images near-black; the hand
>   list and the boot-time mp4 probe are gone).
> - **Screens**: `/library` (rail, grid/list over useWindow, detail with lineage, attention, keys, URL state, pin and
>   use-in-project as events; v1's `?style=` handoff kept), `/library/style/[id]` (the atelier: the document, the lock
>   gate's blockers in the work's words, the proof sheet with stale-under-a-new-digest marked, the trial matrix,
>   Adopt and proof generation as priced `style` jobs through the receipt, Lock, Duplicate), `/audio` (owner ruling
>   2026-10-17: the Recipe Book's composing tools rebuilt - terms, composer, drafts, variations, references, and a Suno
>   proposal from a sentence, so the Floor's audio confirm launches a music job; its keep/reject is the Board's).
>   Frames draw in the project's Style (approved proofs as references, a named default with its reason on the
>   receipt); the Board's proof pile reads the Style table.
> - **Retired**: the Foundry Styles tab (`/api/foundry/styles*` answer 410 with the new address), v1 `app/library/**`
>   and `app/_library/*`, `lib/themes.ts`, `lib/assets.ts`, `lib/useThemes.ts`, `lib/useAssets.ts`, the v1 Board proof
>   source, the `assets-tree` gate; IndexedDB `themes`/`assets`/`uploads` are read only by the importer.
> - **Exit evidence**: the 50k probe (`pipeline/library-corpus.mts`, n=200 per query after 5 discarded, 2026-10-16,
>   Ryzen 7 7800X3D, node 24.14, shared machine): search p95 2.1-48.2 ms, the 3-group facet query the worst at
>   45-48 ms, under the 50 ms budget; `style-exit.live` drives adopt -> generate (dry, through the receipt) -> judge
>   three trial problems -> lock on the real side, with the refusal before coverage. Verify: static gates,
>   `test:unit` 1813/1813, node lane 1887 passed (bar `sound-store`, the sibling session's ledger), live lane 171 passed / 0 failed on assertions (one
>   teardown error - `taskkill` on an exited server in `proof-frames.live` - fixed, that spec 2/2 rerun);
>   unit mutants 448/448 killed (433 in the full run; 15 read baseline-red there and each is
>   killed run alone), probe mutants 48/48 killed.
> - **Decided in the Director's seat**: no delete op for styles; the lock gate does not require the subject slot;
>   the media-facts and style jobs carry no Run row (free/local, or atelier-owned) and a failed media-facts job
>   blocks a fresh one until it is retried on Runs (it is listed there); `lib/kernelProcess.ts` holds the kernel
>   handle without `server-only` so the operator's CLIs load the v1 foundry modules; a non-kit route may baseline
>   disabled controls only.
> - **Carried forward**: the 3-group facet query sits within 5 ms of its budget on a shared box; `pipeline/direct-
>   frames.mts` still hard-codes `PRESETS[0]` for its standalone CLI; fixture-mode video clips are never read (v1's
>   clip store ignores the fixture switch); a live style act's landing is not polled (the atelier shows the plates
>   on its next load); a promoted asset's block snapshot and cost are not copied onto its Library item (the style's
>   proof keeps them); folder move/rename is gone (folders survive as pin collections).

### Phase 6: Calendar and cutover (M)
- Calendar: the Floor rail ⇄ month page (channel toggles, failures verbatim), with publish `tick`
  on the worker scheduler.
- Sound lab: folded in as the design places it. Generation is the Audio lane's composer, triage is a
  Weir packet, and kept takes are Library audio facets. `/playground` redirects to the Audio lane.
- Delete the remaining v1: the Almanac kit, the dual-world `StudioFrame`, the v1 Foundry route and
  the v1 API routes now unused.
- **After cutover:**
  - Rescan the context map through Personas, on the owning machine.
  - Regenerate `.ai/registry-map.json`.
  - Update every `.claude/*/config.md` overlay (cx screens, perfect Class B/C, prototype paths,
    kit, leonardo brand).
  - Rewrite the hand-written law in `CLAUDE.md`. Move the context-map process (about 330 lines) to
    its own doc and keep the git policy verbatim.
- **Exit:** v1 code under `app/` other than the landing is gone, `npm run verify` is green on the
  new gate set, and cx-capture covers every new screen.

> **Done 2026-10-18** (`8f972e0f`, `13a72f6a`, `ed151a11`; three waves, 16 builder lots). Owner rulings 2026-10-17:
> the Sound lab rebuilt in `/audio`, the music-video acts rebuilt as new-world acts, slots in the kernel store, a
> `blog` channel. What landed:
> - **The Calendar, real.** Kernel `slots` (slots / publications / metric_snapshots, every write one tx + a `slot.*`
>   event): v1 `lib/publish/schedule.ts`'s machine absorbed - the claim is a kernel lease (two processes sweeping 40
>   due slots make 40 claims), a slot overdue past 60 min is missed and never published late, drift annotates and
>   clears itself, a dead claimant's slot fails "interrupted", one publication per item x channel x MODE (a dry
>   rehearsal never blocks the live upload), reads never sweep. The Floor rail and month read it; the slot level
>   (`/floor?slot=<id>`: player or the blog PR, the error verbatim on scheduled -> auth -> upload -> live, metrics with
>   null as "—"), move / cancel / publish-now at the slot's rev, the schedule sheet (v1 Composer), channel readiness
>   with standing and the worker timer's last tick. A one-time importer (`pipeline/import/slots.mts`, dry by default,
>   MIGRATED marker) never refuses a v1 row: duplicates import cancelled with the reason.
> - **Publish `tick` on the worker.** A timer roster in `workers/` (`publish-tick`, `metrics-refresh` as kernel leases,
>   tick-isolated, observable, downtime measured from the timer's own heartbeat and recorded on `slot.miss`); the
>   publish producer DRY through the kernel's dry-run port (the plan is the receipt's blob, zero network); YouTube
>   session addresses guarded. `pipeline/publish.mts` keeps its verbs, `--json` keys and exit codes.
> - **Board Approve -> calendar** for articles (a `blog` slot landed by the PR when the article lands); music-video
>   Regenerate (receipt first; v1 launched live with none) and Send to Calendar on the Runs inspector; the Library's
>   Schedule act on video exports.
> - **The Sound lab folded into `/audio`**: Arrange (stages x groups, finalize gated on a library label, the Suno
>   round trip as a stack's next version), Hunt (leaves priced in audio-seconds, side-by-side audition with one
>   playhead, crown = keep, a Run the worker carries), Lessons (saved only on the operator's confirm, "because" and
>   n >= 3 required), strengths per provider (no figure under three takes), rubric 1-10, brief vs measured (also on the
>   Board's audio tile), the operator batch through a receipt, effects as the `sfx` producer (also from the Floor);
>   waveform peaks, tempo and key measured at ingest (`audio_measures`). `/playground` redirects to `/audio`.
> - **v1 retired.** `app/{foundry,playground,articles,calendar,_phases (but the compositor),_projects,_studio,board,
>   studio,projects}`, 92 `app/api` routes, `StudioFrame` (MODULES -> the (studio) shell's `SECTIONS`), the Almanac kit
>   (`components/kit`), `components/ui/{deck,shell,Modal,...}`, `lib/board`, `lib/publish/{publisher,http,metrics}`.
>   Every v1 address redirects (§5.7). The Dojo gate runs headless through `pipeline/decide.mts` (the Board's packet,
>   `--by` required). The four file doors the screens still call are on `route({ guard: "access" })`, `?k=` gone.
> - **Exit evidence.** Under `app/` outside `(studio)` and the landing only the recorded exemptions remain:
>   `app/_server` (the server seam), `app/_dev-inspector`, the sibling session's
>   `app/_phases/frames/music-video/compositor.ts`, nine API routes the screens and agents call, the root layout and
>   error boundaries. Verify: static gates clean (typecheck, typecheck:next, next-structure, lint:ratchet, tokens,
>   narration - now over `@gt/ui` - type-scale), `test:unit` 2125/2125, probes 1440 passed (bar `sound-store`, the
>   sibling's ledger), the full live lane 210 passed with its 13 failures fixed and rerun green, unit mutants killed
>   per wave (A 37/37, B 69/69, C 32/32), probe mutants 2/2 + 1/2 (the survivor retired: the probe runner
>   cannot see a mutation in `packages/**`; its unit twin kills it). cx covers every screen: 53 ids in
>   `pipeline/cx-screens.mjs` (floor, floor-calendar, floor-slot, floor-schedule, board, board-sheet, ledger, runs,
>   library-style, 12 audio ids), walked by the legibility lane. **Not run:** `npm run build` + `check:bundle` (the OS
>   stopped the build for memory on a shared machine); `pipeline/bundle-budget.json` read a stale build's route list.
> - **After cutover.** `CLAUDE.md` rewritten (494 -> 172 lines; generated block and git policy byte-identical); the
>   context-map process moved whole to `docs/context-map.md` (its gate now sees `packages/` and `workers/`); every
>   `.claude/*/config.md` overlay and the prototype / train-style skills repointed. The context-map rescan and the
>   `.ai/registry-map.json` regeneration belong to the machine that owns the map (project `91d8170c`): logged in
>   `.vault/map-drift.md`.
> - **Decided in the Director's seat**: an error stays on a slot cancelled after failing (drawn dim); drift and missed
>   are fields, never error text; the claim is a kernel lease; ElevenLabs is the desk's effects maker while the
>   capability is on; the `sfx` producer is bound (album effect parts are refused with a sentence, not parked);
>   `/articles/<runId>` -> the Board, the Ledger and shelf link a run's history instead.
> - **Incident**: the Director's live-lane runs on 2026-10-17 migrated the operator's store three times (specs that open
>   the kernel themselves fell back to `foundry-out/gravitone.sqlite`); no data written, restored from its 21:09
>   pre-migrate snapshot (chain intact, 1438). The lane now hands its temp store to the specs; `ledger.live` refuses.
> - **Carried forward**:
>   - waiting on the sibling session: move the compositor to `lib/` (empties the `no-app-imports` allowlist), delete
>     `lib/publish/{schedule,store,types}.ts` (read only by the orphaned `lib/sound/mv/calendar.ts`), fold `mvActs`'s
>     copy of v1 `regenerateMv` back into the queue;
>   - `npm run build` + `check:bundle` on a quiet machine, and `bundle-budget.json` rebaselined from it;
>   - orphans to sweep: the rest of `components/ui/signal/*`, `lib/jobs.tsx` (`JobsProvider`, `useJobs`, `jobNoun`),
>     `lib/frames/{alternatives/alts,records}.ts`, `lib/usePollFreshness.ts`, the landing's almanac `EnterButton`,
>     `lib/apiAuth.ts`'s guards (read only by `lib/imaging/handlers.ts` for `pipeline/integration-imaging.mts`);
>   - `/articles/<runId>` lands on a Board refusal for a run not at its gate (route by the run's state);
>   - the schedule form's default item still treats a dry-published slot as holding its item; `slottedIn` counts a
>     dry-published slot as placed (does a rehearsal ratify a slot part?);
>   - `/api/script`'s request-size bound left with the route: compose has no size bound in `lib`;
>   - the rubric is written on `/audio` after the Board verdict (a Board decision has no score field);
>   - `board-exit.live`'s mv/strips undo is a timing flake (4/4 on repeat);
>   - wave C's L68 edited the slots v2 migration wave B had added (unpushed; no store outside the lanes ran it).

---

## 7. Risks and what we measure

| Risk | Measure | Guard |
|---|---|---|
| A skill or CLI breaks on a rename | `npm run verify` plus a CLI contract probe per CLI (`--json` keys, exit codes) | §5. Contract probes are written in Phase 0 against v1 and must still pass at the end |
| Data loss when moving IndexedDB to the server store | Archive round-trip probe (export → import → export, byte-equal manifest hashes) | Keep the v1 archive export for 2 releases |
| Producers double-spend after migration | Spend meter reconciliation per job; kill test mid-job | Lease with fencing token; dry run by default |
| The kernel becomes a framework nobody uses | Each kernel module has at least 2 adopters before Phase 1 exits (a v1 store adapter counts) | Build kernel modules only from mechanisms §3 already proves |
| Visual drift from the chosen prototype | `style-contract.py` capture from the prototype vs the new routes: 0 deviations on the owner's named roles | Promotion procedure in the contest skill (`references/promotion.md`) |
| Ledger growth | Events per day plus size, measured from Phase 2 | Partition by month; archive cold months to JSONL |
| Narration creeps back | `check:narration` at 0 for new routes; screenshots per route on every wave | The law in `ui/signal/README` |
| Two machines diverge (map, stores) | Map provenance check at session start | Phase 0.2 decides map ownership |

---

## 8. Decisions (approved by the owner, 2026-10-14)

1. **Store:** SQLite (`node:sqlite` plus Python `sqlite3`) is the local single source (§4).
2. **Board:** a sheet over the Floor, and also a deep-linkable intercepting route that opens
   full-page from a link.
3. **Sound lab:** folded into the Audio lane. Generation is the Audio composer, triage is a Weir
   packet, and kept takes are Library audio. `/playground` redirects.
4. **Reference data:** the prototype's `data/` set (20 MB) stays out of git and is regenerated by a
   script from `foundry-out/` and fixtures. Only the prototype's own pages are committed.
5. **`/kit` (2026-10-15):** Phase 1 replaces v1's Almanac kit at `/kit` outright - route, parts,
   `kit-census` gate, kit probes and overlay retire in the same change, after a reachability check.
   (Pulled forward from Phase 6.)
6. **The Floor's address (2026-10-15):** `/floor`. The landing keeps `/`; its enter link and the
   retired v1 hubs redirect to `/floor`. Every `/` in §2.1 and §4 that names the Floor means `/floor`.
7. **Phase 1 rulings (2026-10-15, the Director's recommendations, approved by the owner):**
   - *The prototype against itself:* the shared sheet (`tokens.css`) wins over a page's local
     redefinition (`.btn` right padding 10px, `.toggle` at rest `--muted`), and the search field
     reserves 34px for its keycap. Recorded as `accept` in `docs/next/style-contract/roles.*.json`.
   - *Contrast:* a Ghost outline is a mark and holds 3:1 (WCAG 1.4.11); the prototype's 1.21:1 is
     a defect, fixed in `@gt/ui`. Disabled controls keep the prototype's dimming: WCAG 1.4.3
     exempts inactive components, and they stay in the legibility baseline under that reason.
   - *One-off values:* the token lint gets one loud, countable hatch (`--one-off-<name>`, px only,
     declared once per module, budget in `tokens:check` that may only fall). The six
     single-component roles moved back into their modules.
   - *Keys:* one key with two verbs stays where a mode or a selection separates them: `P` in Runs
     (pause the selected job, else open Plan); `K`/`J` (keep and previous in matrix cull, previous
     and next section in packet review - the two modes never share a screen).
   - *Lanes:* `cloud.qwen` is its own resource lane (its own key and rate); `agy` occupies
     `seat.text` (the operator's own CLI install).
   - *Reasons:* a Packet's reject reasons belong to its source. The Board's four (1-4) are the
     image cull's; audio triage carries its own defect set through the same 1-4 keys.
     `@gt/domain/decision` `REJECT_REASONS` becomes per-source in Phase 3, when triage becomes a
     packet.
   - *Steering:* a Runs re-route may only pick a route the plan's router already allows for the
     part (a steer is a preference inside `kernel/router`'s table, never a new route).

The design is approved as the rebuild's target: contest `foundry-next-design-r4`, winner A/1 "The
Watershed".

---

## 9. Code quality architecture

Designed in spark `watershed-code-quality` (2026-10-14, `.vault/Spark/ideas/watershed-code-quality.md`),
from three measurements: v1's quality machinery, the prototype's code, and the registry subjects
that govern it (`module-design`, `invariant-placement`, `quality-gates`, `metric-gates`,
`test-harness`, `design-tokens`, `codegen`, `error-handling`, `migrations`, `dead-code`). The owner
chose every structural fork; the rest follows convention or the registry. **Every phase builds
inside this chapter; a phase that needs to loosen it asks the owner first.**

### 9.1 Why v1 ended where it did (measured)

No single decision made v1 hard to change; it accumulated:
- **Layering:** 55 `lib → app` imports, 31 `pipeline → app`, 4 `components → app`.
- **Cycles:** 22 import cycles (the largest 18, 15 and 13 files).
- **Type safety:** 53 `as unknown as`; 30 `JSON.parse(...) as T` with no validator; 53 hand
  validators plus two copies of a schema checker.
- **Errors:** 65 Error subclasses and ad hoc `{ok}` result shapes.
- **Tests:** 177 of 284 test probes assert by reading source text.
- **File size:** 6 files over 1,000 lines.

The winning prototype is a prototype: 433 string-HTML `esc(` calls, five copies of one status
mapping, signal colours re-typed about 144 times past their tokens, no state machine kept as a
table, and keys that change meaning per page. The rebuild extracts the design and leaves all of
that behind (contest skill `references/port-quality.md`, 1.11.0).

### 9.2 The structure (owner's choices)

| Fork | Chosen | Rejected and why |
|---|---|---|
| Boundaries | **npm workspace packages** (`@gt/catalog < domain < kernel < producers`; `@gt/ui` may import `@gt/domain`, which is pure and sits below it, and nothing else), each with its own strict tsconfig and `exports` map. The app, CLIs and workers consume them as libraries | One package with lint-enforced folders: its boundaries hold only while a gate is alive |
| Validation | **zod 4 at one door per boundary** (`@gt/domain/door`): a schema is the type, the runtime check, and the JSON Schema for structured LLM output | Hand validators: every schema kept in sync by hand, as the 53 in v1 are |
| Test ladder | **Vitest** unit and integration rungs (template-copy SQLite fixtures, commit rung under a minute) plus a small serial **Playwright live** lane for screens and legibility | node:test (no watch or coverage); Playwright-only (the registry's named anti-pattern) |
| Data access | **Server Components + Server Actions + SSE** from the event ledger; route handlers only for CLIs, agents and files | API routes plus a client fetch cache: more client code and a cache to own |
| Styling | **CSS Modules over generated token variables**; an allow-list gate rejects raw values | Tailwind semantic utilities: about 2,000 px values become utility names, and drift follows |

### 9.3 Conventions (decided by the registry, not asked)

- **Strictness floor** (`tsconfig.base.json`):
  - flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
    `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
    `verbatimModuleSyntax`, `erasableSyntaxOnly`;
  - target ES2023 with `@types/node` 24;
  - packages run under Node 24 native type stripping, so CLIs and workers need no build or `tsx`.
- **Absent is omitted.** An optional field is an absent key, never `undefined` or `null`, unless
  null is a real state (as a verdict "not judged yet" is). `parseAt` strips undefined keys so
  zod's output type tells the truth.
- **Ids are branded,** minted only at a schema door. A brand is assignable to `string`, never from
  it. Lease validity is never a type: it has a clock and stays a runtime check.
- **One error taxonomy:** `AppError` codes `invalid | not-found | conflict | refused | unavailable
  | budget | internal`, each a code some consumer branches on. One `Result<T>`, one envelope
  `{error, code, detail?}`. Every failure reaches a door (user, telemetry or log), and swallowed
  catches are a gate.
- **State machines are data:** `defineMachine(table)` infers the state union from the table, and
  the same table runs on server and client.
- **IO-free kernel cores:** each kernel module is a pure transition function, with time and
  randomness as parameters, plus one driver that does the I/O. The store sits behind a seam with
  one contract suite run against both the SQLite and the in-memory adapters.
- **Small, deep modules:** 400 lines per file, hard. A file is split by what each part must know,
  not by when it runs. No pass-through layers: a seam with one implementation and no substitution
  is collapsed.
- **One keymap registry** declares every binding per mode and runs a conflict report as a check.
  The design's bindings are kept unless the owner rules otherwise.
- **Migrations** are append-only. The ledger bump is the last write in each step's transaction.
  Snapshots before a migration include the WAL sidecars. A fresh store is tested against one
  migrated from the oldest version.
- **Tokens are a derived artifact.** `packages/ui/tokens/source.json` (primitives → roles,
  admission tests recorded in `ADMISSION.md`) → `npm run tokens:gen` → `tokens.css` +
  `tokens.ts`, each with a generated header. Values stay byte-equal to the prototype.

### 9.4 The governance skeleton (live before Phase 1)

| Gate | Checks | Starts at |
|---|---|---|
| `next-structure` | boundaries (no reach into `app/`, `lib/`, `components/`, `pipeline/` or `@/`; layer order; ui imports only domain), cycles, hygiene (no `as unknown as`, `any`, `JSON.parse` outside the door, raw `keydown`, swallowed catch), file size 400 | 0 |
| `next-typecheck` | `tsc -b` over every package under the strictness floor | 0 errors |
| `next-unit` | Vitest over `packages/*/test` and the gates' own liveness tests | green |
| `next-tokens` | generated outputs match `source.json` (drift); no raw colour or px value in `*.module.css`; every `var(--x)` names a token | 0 |

Each gate:
- prints its denominator (walked / checked / skipped);
- exits 2 when it walked nothing it should have;
- was **proven red once on a seeded violation** (`tests/next-gates/`, `packages/ui/test`).

v1 keeps its own gates as a two-way ratchet: a drop below baseline needs a re-baseline whose
message names the cause.

### 9.5 Performance contract

Performance is gated by counts, never by timings; timings are reported:
- a **first-load JS budget per route**, gated by a deterministic byte count (`check-bundle` extended
  per route);
- every list that can exceed one screen is **virtualised**, and proven at 10× the prototype's
  volume (the Library at 50,000 items, search p95 measured);
- **no per-tick DOM churn**: a view rebuilds only when its inputs change;
- **event-driven invalidation** over SSE, with polling only as a slow backstop;
- **media facts computed at ingest** (decodability, poster, duration, brightness).

### 9.6 Definition of done for every cutover

A cutover is done only when all of these hold:
1. **Fidelity:** the style contract against the prototype reads 0 deviations on the named roles,
   and every named interaction has been driven.
2. **Quality:** every §9.4 gate is green at zero.
3. **Performance:** the §9.5 budgets hold, with the measurement command named.
4. **Characterisation:** the old behaviour the cutover keeps was pinned first, at the cheapest rung
   that sees it.
5. **Deletion:** the v1 code it replaced is deleted in the same change, and a reachability check
   shows nothing still reaches it.
6. **Docs:** the doc surfaces it touches are updated in the same change.
