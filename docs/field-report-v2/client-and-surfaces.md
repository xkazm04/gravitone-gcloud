# Field Report v2 — gravitone-gcloud — shard client-runtime + product-surfaces

**Headline counts (44 leaves scored):**
`holds` **18** · `partial` **10** · `n/a-absent` **14** · `n/a-scope` **2** · `violates` **0** · `holds(self)` **0**.
Coverage: **19 deep** (executed reads) · **6 shallow** (head-only / one glance) · **0 skipped**.
Independence: **all holds are third-party independent** — this repo is not among the corpus's surveyed siblings and keeps no census/rules ledger against Personas, so no verdict is a self-match.

One-line character of the target: a **young (v0.1.0), single-developer, local-first Next.js 16 / React 19 imaging studio** — Firebase auth, IndexedDB + localStorage persistence, no backend DB, no observability stack. It has been through heavy quality passes: nearly every file carries a paragraph of *why*, and the craftsmanship on error-taxonomy, provenance, and storage-honesty is **above the corpus's own median**. It has none of the observability/dashboard subsystems half of the product-surfaces shard describes — those are correctly `n/a-absent`, a maturity signal, not a failure.

---

## 0. Orientation + independence declaration

- **Stack:** Next.js 16 (App Router) · React 19 · TS 5 · Tailwind 4 · Firebase (auth + `browserLocalPersistence`). No zustand, no Redux, no server database. Client state = React Context (`JobsProvider`, `NotesContext`), module-scope stores read via `useSyncExternalStore`, and two durable stores: **IndexedDB** (`lib/studioDb.ts` — projects, steps, themes, assets) and **localStorage** (jobs ledger, seed flags).
- **Server surface:** three `/api/imaging/*` routes + `/api/frames`, `/api/recalibrate`, all funnelling through one chokepoint (`lib/imaging/router.ts`). API keys are server-only; the client module (`lib/imagingClient.ts`) deliberately knows no vendor.
- **Entanglement with the corpus:** **none.** The Personas golden-path corpus was authored from Personas + `personas-web`/`brainiac`/`personas-cloud`. `gravitone-gcloud` is not in that set and holds no `situation-spine`/census artifact of its own. Every `holds` below is therefore an **independent reinvention** of the physics clause — the strongest kind of evidence per v2 rule 2. No `holds(self)` was recorded.
- **What this repo does NOT have** (drives the `n/a-absent` column): zustand, error boundaries, bulk multi-select, observability dashboards (charts/metrics/alerts/anomaly/usage/audit-trail/live-console-with-filters), onboarding/consent/tour/checklist, streaming chat, long virtualized lists, a graded scoring system, a shared table primitive.

---

## 1. Scorecard

Clauses scored per leaf = the physics clauses in the leaf's `## The one way` / `## 0. headline`, minus anything tagged *local calibration*. Several corpus leaves are dominated by Personas-specific census; where the transferable physics is a single prose rule I score at leaf level (noted "1 (prose)").

### Client-runtime (22)

| leaf | clauses | holds | violates | partial | n/a-absent | n/a-scope | notes (file:line) |
|---|---|---|---|---|---|---|---|
| client-state-persistence | 4 | 3 | 0 | 0 | 0 | 1 | localStorage/IDB are the *deliberate* authority (web, no backend); lifetime documented `jobs.tsx:148-200`; **secrets never in storage** — keys server-only, `log.ts:64` scrubs. "backend `app_settings` is authority" = WebView2 local-calibration → n/a-scope |
| client-rule-mirroring | 1 (prose) | 1 | 0 | 0 | 0 | 0 | **best rung of the corpus ladder**: client refuses to mirror the vendor roster, server sends the verdict (`imagingClient.ts:31-34`, `:40-50`); unknown id = 400 not silent fallback |
| view-state-persistence | 1 (prose) | 0 | 0 | 1 | 0 | 0 | step content persisted with intent; ephemeral view state (`selectedId`, matrix `sort`, score `focus`) is `useState` and resets on remount — deliberate & low-stakes; staged candidate *intentionally* not persisted (`useVersions.ts:36-47`). No scroll restoration |
| hmr-safe-singletons | 3 | 3 | 0 | 0 | 0 | 0 | module-scope registry, **refcounted** subs (`useResearchRun.ts:63-83`), no `globalThis`, no `import.meta.hot`. Next Fast-Refresh caveat is n/a-scope |
| zustand-domain-slices | — | 0 | 0 | 0 | 0 | 1 | no zustand at all; coherent alt = Context + `useSyncExternalStore` module stores. Slice mechanics are stack-specific → n/a-scope |
| polling-loop | 2 (steady/terminal) | 1 | 0 | 1 | 0 | 0 | **terminal poll holds**: `leonardo.ts:176-209` bounded (`MAX_POLLS`), stops on COMPLETE/FAILED/NSFW, skips transient, cleanup in `finally`. No client steady-freshness poll (event-driven) → coordinator clauses n/a-absent |
| stale-response-guard | 2 (prose) | 2 | 0 | 0 | 0 | 0 | three correct forms: `let alive` keyed on projectId (`useFrames.ts:70-82,108-131`), real `AbortController` on cancellable fetch (`useVersions.ts:71,165,208`), **generation guard** `done !== i` drops stale tick (`useResearchRun.ts:126`), plus `ownerTab` identity (`jobs.tsx:204-228`) |
| partial-failure-read-envelope | 1 (prose) | 1 | 0 | 0 | 0 | 0 | **corpus's best case, native**: `router.ts` "no elimination is silent" `trail`→`reroutedFrom`; `useFrames.direct` applies-what-survived + per-row `rejected`/`missing` (`:386-409`) |
| shared-fetch-cache | 1 (prose) | 0 | 0 | 0 | 1 | 0 | no module fetch caches → the corpus stale-key hazard is *absent*; each op does `openDb`/`close` (`projects.ts:242-262`). No dedup either — a benign perf gap, correctness-safe |
| entity-draft-editing | 1 (prose) | 1 | 0 | 0 | 0 | 0 | hydrate-per-entity, draft (notes) vs committed (accepted), staged-not-persisted by design (`useVersions.ts:36-96`); patch-by-id (`useFrames.ts:155-157`) |
| debounced-autosave | 1 (prose) | 1 | 0 | 0 | 0 | 0 | **textbook**: 600ms debounce gated on `stepLoaded` (never write empty over stored cut), cleanup clears timer (`useFrames.ts:133-153`) |
| optimistic-update | 1 (prose) | 1 | 0 | 0 | 0 | 0 | holds *by avoidance*: writes `await` then set (no rollback hazard, `useProjects.ts:138-196`); where it paints ahead it reconciles patch-by-id/`settle` not snapshot-replace — sidesteps the corpus's central defect |
| bulk-selection-actions | — | 0 | 0 | 0 | 1 | 0 | no bulk multi-select surface exists |
| error-message-resolution | 1 (prose) | 1 | 0 | 0 | 0 | 0 | `kind`→`statusFor` one place (`errors.ts:107-127`); human messages authored at throw; client `ImagingRequestError` carries `code`/`status` |
| error-surfacing-policy | 1 (prose) | 1 | 0 | 0 | 0 | 0 | **two doors, not an `if`**: user banner + operator channel; `failed()` hits both (`useProjects.ts:94-101`) |
| error-boundary | 1 (prose) | 0 | 0 | 0 | 1 | 0 | **no React error boundary anywhere** (grep empty). See Deviation D1 — flagged despite `n/a-absent` because a render throw crashes the whole tree |
| swallowed-error-telemetry | 3 (bind / chokepoint+tag / two-door) | 2 | 0 | 1 | 0 | 0 | binds & reports, never silent-swallow; **chokepoint+scrub** (`log.ts`); `onStorageTrouble` channel (`stepStore.ts:85-140`). Partial: **no durable operator sink** (Sentry) — client channel is ephemeral, corpus says screen-only ≠ recorded (D2) |
| multi-step-flow | 1 (prose) | 1 | 0 | 0 | 0 | 0 | 5-phase studio (`PHASES` single source, `parkAt` bookmark ≠ progress, `migrateProject` retired-phase heal, `aria-current`) `projects.ts:39-107`, `Stepper.tsx` |
| first-use-consent-gate | — | 0 | 0 | 0 | 1 | 0 | no consent gate (demo seed is not consent) |
| first-run-onboarding | 1 (prose) | 0 | 0 | 1 | 0 | 0 | light: demo shelf seeded on first visit; seed flag **survives delete** so an emptied shelf never silently refills (`useProjects.ts:40-71,105-127`). No tour |
| setup-checklist | — | 0 | 0 | 0 | 1 | 0 | none |
| guided-tour-step | — | 0 | 0 | 0 | 1 | 0 | none |

### Product-surfaces (22)

| leaf | clauses | holds | violates | partial | n/a-absent | n/a-scope | notes (file:line) |
|---|---|---|---|---|---|---|---|
| filtering-and-search | 1 (prose) | 0 | 0 | 1 | 0 | 0 | small bespoke filters (`MatrixSpend` sort toggle `:38-68`; `ResearchTriageBoard` — **shallow**, not deep-read); no shared filter primitive |
| tables | — | 0 | 0 | 0 | 0 | 1 | no generic data-table; surfaces are hand-built visualizations. "Use `UnifiedTable`" is house-specific → n/a-scope. No reusable table primitive (fine at this scale) |
| long-list-rendering | — | 0 | 0 | 0 | 1 | 0 | no long lists (max ~16 frames), no virtualization needed |
| expandable-row | 1 (prose) | 0 | 0 | 1 | 0 | 0 | click-to-focus detail in `MatrixSpend`/`ScoreSpotting`/notebook `FactRow` — **shallow** |
| proportional-bar-list | 1 (prose) | 1 | 0 | 0 | 0 | 0 | **textbook**: `MatrixSpend` stacked segments, one `peak` scale, baseline ghost, empty rows at 0 not hidden, per-seg title (`:41-157`) |
| metric-definition | 1 (prose) | 1 | 0 | 0 | 0 | 0 | derive-never-retype: `coverageIn`/`totalIn`, `ScoreSpotting` scored/refused/silent (`:26-28`), `useFrames.reported` "derives, never asserts" (`:443-476`) |
| data-provenance-disclosure | 1 (prose) | 1 | 0 | 0 | 0 | 0 | **best-in-class**: `costBasis` (vendor/estimated/unpriced), unpriced≠$0 counted (`useFrames.ts:381`, `log.ts:115`), `reroutedFrom`, `cleanup`, provider kept with proof (`imagingClient.ts:36-50`) |
| scoring-and-thresholds | — | 0 | 0 | 0 | 1 | 0 | no graded numeric score/thresholds (score phase = time coverage, not a grade) |
| chart-component | 1 (prose) | 0 | 0 | 1 | 0 | 0 | only "charts" are `MatrixSpend` bars + `ScoreSpotting` time-spans; bespoke, no lib, no axis/tooltip system |
| metric-tile | 1 (prose) | 0 | 0 | 1 | 0 | 0 | header spend/coverage lines with unpriced-floor honesty (`useFrames.ts:427-436`); no dedicated tile component |
| alert-rule-editor | — | 0 | 0 | 0 | 1 | 0 | none |
| audit-trail-view | — | 0 | 0 | 0 | 1 | 0 | no audit UI (`provenance.reroutedFrom` is a per-asset trail, not a surface) |
| anomaly-marker | — | 0 | 0 | 0 | 1 | 0 | none |
| usage-analytics | — | 0 | 0 | 0 | 1 | 0 | `log.ts` lines are raw material; no analytics surface |
| dev-only-diagnostics | 1 (prose) | 0 | 0 | 1 | 0 | 0 | `planFor`/`orderFor` exported "so a diagnostics surface reports the same truth the router acts on" (`router.ts:92-97,118`); `log.ts`; probe dirs (`imaging-probe-out/`, `gauntlet/`). Holds physics, no in-app surface → partial |
| session-delta-digest | — | 0 | 0 | 0 | 1 | 0 | jobs bell is notification, not a session-delta digest |
| live-event-console | 1 (prose) | 0 | 0 | 1 | 0 | 0 | `RunTrace` = live trace, phase-grouped, failed-step drawn in place, "working" pulse (`RunTrace.tsx`). No filter → the corpus "filter breaks liveness" clause n/a |
| dry-run-preview | 1 (prose) | 1 | 0 | 0 | 0 | 0 | `projectContents` computes "what delete would destroy" **without reading a byte**; `deleteProject` returns what it *actually* took (preview reconciled w/ actual) `projects.ts:393-488`; `ConfirmDeleteStyle` dependents count |
| catalog-browse-and-apply | 1 (prose) | 1 | 0 | 0 | 0 | 0 | `PresetRail`→`startFrom`→`create` an editable copy (`origin:"preset"`, `presetId`); presets are real renders (`LibraryAtelier.tsx:75-93`) |
| node-canvas | 1 (prose) | 0 | 0 | 1 | 0 | 0 | `useFrames` layer canvas (absolute-not-delta moves `:260-273`, resize, z-order reorder within groups `:288-304`) — a *layer* canvas, not a node-graph DAG → graph clauses n/a-scope, editing micro-physics hold |
| canvas-state-persistence | 1 (prose) | 1 | 0 | 0 | 0 | 0 | frames persisted with **`renderId` staleness discriminator** (different render = stale → re-derive), debounced, never-empty-over-stored (`useFrames.ts:46-153`) |
| streaming-chat-transcript | — | 0 | 0 | 0 | 1 | 0 | no chat / token streaming |

**Shard totals:** holds 18 · partial 10 · n/a-absent 14 · n/a-scope 2 · violates 0.
**Coverage:** deep (executed/full-read) 19 files → 30 leaves grounded; shallow 6 leaves (filtering ResearchTriageBoard, expandable-row internals, chart internals, metric-tile component, first-run edge, live-console); skipped 0.

---

## 2. Deviations (nothing applied — read-only run)

No clean `violates`. The repo's real gaps are *absences*, and two are worth a fix despite being `n/a-absent`:

- **D1 — no React error boundary anywhere. Severity: medium.** Grep for `ErrorBoundary`/`componentDidCatch`/`getDerivedStateFromError`/`error.tsx` returns nothing. A render-time throw in any phase surface takes down the whole `<StudioView>` tree with the default Next overlay in dev and a blank screen in prod. *Held: the repo's data layer is unusually throw-safe (every IDB path classifies and reports rather than throwing into render), so the reachable surface for an uncaught render error is small — but "small" is not "none", and App Router gives a one-file fix (`app/**/error.tsx`).* This is the single most defensible thing to add.
- **D2 — swallowed-error-telemetry has no *durable* operator door. Severity: low (by design for a local-first prototype).** `stepStore`'s `onStorageTrouble` channel and `useProjects.failed()` satisfy the corpus's "bind + chokepoint + tag + two doors" clauses *for the session* — but the operator door is an in-memory `useSyncExternalStore` snapshot that dies on reload, and server `log.ts` writes to `console` only. By the corpus's own strict reading ("a failure that only reaches the screen is not recorded, and one that only reaches the console is not recorded either") there is no sink that outlives the moment. *Held: there is no backend and no operator to receive telemetry yet; the design is self-aware ("Silent in the step, visible in the app"). The clause is genuinely satisfiable only once a server exists.* Note it as the seam where a Sentry/ingest call lands when the backend does.
- **D3 (micro) — view-state resets on remount. Severity: trivial.** Matrix `sort`, atelier `selectedId`, score `focus` are `useState`; a remount loses them. Deliberate and low-stakes here; only worth a line because the same discipline the repo applies to *content* (renderId staleness, debounced save) is simply not extended to *view* state — which is exactly the corpus `view-state-persistence` split.

---

## 3. Enrichment — practices the corpus lacks or under-specifies

| candidate | file:line | physics argument | in_corpus | corpus path | lane |
|---|---|---|---|---|---|
| **cost-basis provenance** (`vendor-reported` / `estimated` / `unpriced`; "unpriced ≠ $0", counted into a *floor*) | `imagingClient.ts:40-50`, `useFrames.ts:376-384`, `log.ts:115` | corpus `data-provenance-disclosure` discloses *source*; this adds a typed **confidence of the number itself** and forbids printing `$` without checking it — a strictly stronger honesty clause, independently reinvented | refines-existing | `data-provenance-disclosure.md` | ENRICH |
| **re-route envelope with a reason trail** (`trail`→`reroutedFrom`, "no elimination is silent", 4 named drop-reasons) | `router.ts:17-24,146-269` | corpus `partial-failure-read-envelope` is about *reads*; this is the same physics for a **fallback-chain write**: every eliminated candidate carries a reason to the caller AND onto the persisted asset | refines-existing | `partial-failure-read-envelope.md` | ENRICH |
| **one-chokepoint structured log with an audited scrub allowlist** (secrets masked by *value*, `Bearer` before key/value, userinfo stripped; body/`detail` never logged) | `log.ts:17-140` | corpus `swallowed-error-telemetry` convergence says "reach for a wrapper before a linter" but under-specifies the *safety audit* of what a line may carry; this is that audit made explicit and testable (`formatCall` is pure) | refines-existing | `swallowed-error-telemetry.md` §9 | ENRICH |
| **error `retryable` vs `reroutable` as typed getters** (a refusal is deterministic → never retry, cross-vendor re-route instead) | `errors.ts:46-77` | corpus `error-message-resolution` maps error→message/status; this adds a **recovery-strategy dimension** to the taxonomy, with the reasoning for each exclusion written into the getter | refines-existing | `error-message-resolution.md` | ENRICH |
| **honest read outcome: never-written vs failed-read** (`ReadOutcome` discriminates `{ok:true,data:undefined}` from `{ok:false}`) | `stepStore.ts:79-83,203-218` | a new-key and a failed-read both collapse to `undefined` by default; making them distinct types is the same "the type that expresses the fourth state" argument the corpus `shared-fetch-cache` makes about `SWRResult`, applied to reads | built-elsewhere | `shared-fetch-cache.md` (Q3 "return the type that expresses the state") | ENRICH |
| **dry-run vs actual reconciliation** (`projectContents` previews destruction w/o reading bytes; `deleteProject` returns what it *actually* took) | `projects.ts:393-488` | corpus `dry-run-preview` previews; this closes the loop by making the *actual* op report its real footprint so the confirmation number and the result can be compared, not assumed | refines-existing | `dry-run-preview.md` | ENRICH |
| **cross-tab serialisation over `localStorage` + `storage` events** (synchronous claim-before-return, documented irreducible CAS window, owner-tab identity) | `jobs.tsx:243-300,350-382` | corpus `client-state-persistence`/`hmr-safe-singletons` don't cover **multi-tab coordination of an expensive job** without a lock primitive; the honest window analysis is a portable pattern | absent | (nearest: `client-state-persistence.md`) | ENRICH |
| **`useSyncExternalStore` module-store as the zustand alternative** (refcounted subs, hydration-safe server snapshot constant) | `stepStore.ts:87-120`, `useResearchRun.ts:63-143` | corpus `zustand-domain-slices` is stack-locked to zustand; this shows the same "one store, narrow subscriptions, no churn" physics with a zero-dependency primitive — useful for the non-zustand adopter | built-elsewhere | `zustand-domain-slices.md` | ENRICH |
| **the "never save before first load" autosave guard** (debounce gated on `stepLoaded`, "writing an empty array over a stored cut is the one bug persistence layers reliably ship") | `useFrames.ts:133-153` | corpus `debounced-autosave` (head not published in shard extract) likely covers debounce; the *load-gate* is the specific defect-class this names and prevents | refines-existing | `debounced-autosave.md` | ENRICH |
| **capture-phase IDB error rescue** (`tx.error` is null at `tx.onerror`; a capture listener keeps the request's real `DOMException` so classifiers see the true `name`) | `studioDb.ts:127-153` | not a corpus concept at all — a measured browser-platform hazard whose fix determines whether every downstream error classifier works; portable to any raw-IDB adopter | absent | — | ENRICH (code-quality) |

---

## 4. Methodics

- **Executed vs shallow:** 19 files read in full and reasoned over (jobs, stepStore, useVersions, useFrames, projects, useProjects, imaging/{errors,http,router,log}, imagingClient, studioDb, useResearchRun, RunTrace, LibraryAtelier, Stepper, MatrixSpend, leonardo[partial], ScoreSpotting). 6 leaves rest on a single glance or grep (filtering/ResearchTriageBoard, expandable-row internals, chart internals, metric-tile as-a-component, first-run edge cases, live-console filter behaviour) and are marked `partial`/shallow rather than asserted.
- **Two-implementation checks:** load-bearing counts (localStorage/IDB usage, catch-site census, absence of ErrorBoundary/zustand/SSE/onboarding) were each grepped structurally before verdict; the error-boundary absence was confirmed by an empty grep across four spellings, not inferred.
- **Self-correction:** I initially expected `node-canvas` to hold on the frames canvas — corrected to `partial`/n/a-scope after reading `useFrames`: it is a **layer/position** canvas (absolute moves, z-order), not a **node-graph DAG**, so most corpus node-canvas physics doesn't apply; the transferable editing micro-physics (absolute-not-delta) do. Also reclassified `optimistic-update` from a likely-partial to `holds`: the repo *avoids* optimistic writes (awaits then sets), which sidesteps the corpus's entire rollback-erases-concurrent-writes defect rather than solving it.
- **Instrument gaps / honesty notes:** (1) The corpus `## The one way` head extraction found 6 leaves with a clean stack-free head; the other 38 use a `## 0. headline` census format dominated by Personas-specific measurement — for those I scored the single transferable prose rule and marked "1 (prose)" rather than inventing clause counts. (2) I did **not** run the target's build, `next dev`, or any mutating command (standing rule); verdicts are static + grep, never runtime. (3) `ResearchTriageBoard.tsx`, `MatrixCoverage`/`MatrixTracks`, and the notebook subsystem were not deep-read — `filtering-and-search`/`expandable-row` are honestly shallow. (4) No DB copy was needed (IndexedDB is per-browser and not present as a file to probe read-only); persistence claims rest on code, not a live store read — stated rather than papered over.
