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
