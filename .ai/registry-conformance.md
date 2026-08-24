# Registry conformance — software-engineering
contributor: mkdol-dev-box · audited: 2026-08-24 · **wave 2 drained the same day** · bundle: `software-engineering` (146 subjects / 930 techniques)

Scope: **software-engineering only.** The `media-generation` bundle this repo also consumes
(`.ai/manifest.yaml` → `knowledge.domains`) is deliberately **out of scope** here and none of its
subjects are judged below.

14 subjects selected against surfaces this repo actually has: the governed imaging chokepoint
(`lib/imaging/`), the IndexedDB persistence layer, the five-step studio, the probe harness, the
generated context map, and the `.ai` contract itself. Subjects with no surface here (embedded-db,
i18n, packaging, voice-io, p2p-networking, fleet-orchestration, migrations, …) are omitted rather
than padded with `n/a` rows.

Every technique row below was judged after reading that technique's own file. Several judgments
moved on reading — `formatCall` looked covered and was not; `.env.example` looked like boilerplate
and is one of the strongest artifacts in the repo.

## The map

| subject | technique | status | evidence |
|---|---|---|---|
| **cost-metering** | price-tables | followed | `lib/imaging/pricing.ts:94` one table, `source`+`checked` per row; `vendorUsd` short-circuits it `:188`; unknown → `unpriced`, never 0 |
| cost-metering | preflight-estimation | followed | `estimatePerImage` `pricing.ts:274` = dearest declared rate, errs high; gated at `router.ts:164` before any vendor |
| cost-metering | budget-enforcement | followed | one chokepoint, `router.ts:164`; refusals now counted + logged (`budget.ts` `assertWithinBudget`); ceiling defaults bounded, not unlimited |
| cost-metering | spend-observability | partial | the DATA is now complete — `budgetStats()` plus `spendByAxis()` split the window by capability, provider, model and outcome, and `spendRows()` hands out a copy. Still **no surface renders any of it**: the panel is a product decision with no evident intent, left for a human |
| cost-metering | usage-ledgers | followed | the row is `{at,usd,cap,provider,model,outcome,basis}` (`budget.ts` `SpendRow`); calls that reached the vendor and FAILED are booked too, decided by `router.ts` `billedOnFailure` on `ImagingError.dispatched` — evidence from http.ts, not inference from `kind`. Still in-memory and per-process, which is the documented single-instance trade |
| cost-metering | spend-attribution | followed | the row carries the SAME axes log.ts emits, deliberately, so the two describe one call in one vocabulary; `spendByAxis()` answers "which step spent this window". `unattributedUsd` is the honesty field — nothing writes it today, and a future path that omits axes shows up as a number rather than a smaller total |
| cost-metering | reversible-debit-and-settle | n/a | post-hoc metering against a vendor invoice; no prepaid balance. The technique says products that bill after the fact should not build it |
| **codebase-scanning** | verify-after-generate | partial | audit inlined at `CLAUDE.md:91` and each check names its dated incident (`:84`); run today → **5 ungrouped contexts**, unrepaired because the null-group arm is UI-only and the bridge is down |
| codebase-scanning | llm-assisted-scanning | followed | the scan is treated as a model generator with a measured corruption incident, not a deterministic tool (`CLAUDE.md:82-90`) |
| codebase-scanning | incremental-scanning | followed | delta vs subtree modes with a stated floor — "<8 source files will not give you a context; it will merge, and it may duplicate" `CLAUDE.md:148` |
| codebase-scanning | finding-lifecycle | followed | `.vault/map-drift.md` is append-only, names its drainer ("the next session that finds the bridge alive drains it"), and has a `## Resolved` section |
| codebase-scanning | evidence-scoping | partial | the scan glob is `app/**` + `components/**`; `lib/` (26 files incl. the whole imaging engine), `pipeline/` and `tests/` are wholly unmapped, so the map understates where the risk is |
| codebase-scanning | dead-code-detection | n/a | no reachability sensor or orphan detector in this repo; the map's `unmapped` arm is coverage accounting, not dead-code detection |
| **quality-gates** | gate-liveness | followed | a trigger that fires unasked (`.github/workflows/gates.yml`, push + PR), and every checker this wave added has THREE outcomes and three exit codes — `lint-ratchet`, `check-manifest` and `check-bundle` each exit 2 for could-not-run, each asserts its own instrument (short file walk / unparsed manifest / missing positive control) and each resolves the repo root from its own location, not cwd |
| quality-gates | gate-laddering | followed | the binding rung exists: `.github/workflows/gates.yml` runs install → typecheck → lint → manifest → probes → build → bundle on push and PR, green since 2026-08-24. One authority per rule — every job invokes the same npm script a developer runs locally, so there is no CI-only definition to drift. Local rungs are still absent (no hooks), which is a latency choice, not an enforcement gap |
| quality-gates | hook-hygiene | n/a | no hook system installed, so there is nothing to keep hygienic. Now a deliberate absence rather than an unconsidered one: the binding rung exists, and a local rung would only move the moment of discovery earlier |
| quality-gates | severity-by-construction | followed | `eslint.config.mjs` over `eslint-config-next@16.3.0`, and the exit path is traced and written down: at the merge rung ERROR findings fail above 0, and WARNING findings fail on any movement from `lint-baseline.json` in either direction. Not a threshold flag left off — a ratchet whose semantics are stated in the workflow header |
| quality-gates | ratchet-design | followed | `lint-baseline.json` is a plain committed file with per-RULE buckets, names its counter (`npm run lint:ratchet`) and its predicate, refuses in BOTH directions (a drop is actionable divergence, since fixed / deleted / matcher-broke produce an identical diff), never auto-updates, and states its graduation rule. Earned its keep the day it shipped: it caught a `react-hooks/immutability` staleness bug in five-minute-old code |
| quality-gates | false-positive-economics | partial | detectors now ship, and one measured false positive was found and fixed at birth — `check-bundle` flagged `NEXT_PUBLIC_IMAGING_ACCESS_SECRET` as the server-only name it ends with, on the one variable the design says is public. Precision over the lint rules themselves is still unmeasured; there is no finding population to score yet |
| **test-harness** | negative-control-tests | followed | `sort-stability.probe.spec.ts:53` "Controlled counterfactual … (Synthetic control, not a repo site)"; `imaging-auth.probe.spec.ts:9` records that the probes fail against the pre-fix routes |
| test-harness | suite-partitioning | followed | one real config per suite (`playwright.config.ts` → `tests/golden-path` only); membership by location, not annotation |
| test-harness | isolation-lanes | partial | `integration-imaging.mts:33` "THE TWO HALVES DO NOT SHARE A PROCESS, deliberately" + `sealNetwork()` `:93`; but `fullyParallel: false` carries **no stated reason**, and probes mutate `process.env` in one shared process |
| test-harness | live-app-harness | deviation | 9 ad-hoc `pipeline/drive-*.mjs` browser drivers with no designed control surface, no launcher, no build-time test-only gate — the improvised door the technique names. **The one deviation left after wave 2**, and the only backlog item that is a design job rather than a contained fix |
| test-harness | fixture-economics | followed | `tests/golden-path/_helpers.ts` builders (`mkProject`) with defaults; no shared mutable fixture; no hand-maintained truncate list |
| test-harness | flake-lifecycle | n/a | no retained run history and no quarantine register exists to judge |
| **data-access** | layering-rules | partial | `lib/studioDb.ts` owns every IDB primitive and is partitioned by aggregate; `openDb`/`runTx` are still **exported raw handles**. The blocker changed rather than the state: a linter now exists, so an import-boundary rule is finally POSSIBLE — none is written |
| data-access | row-mapping | followed | `stepStore.ts:58` closed `StorageFailure` union; `classify()` converts DOM exceptions at the seam; corrupt/unavailable reads are reported, not silently skipped |
| data-access | repo-testing | followed | `dal-real-engine.probe.spec.ts` drives `fake-indexeddb` — a real implementation of the spec, not a mock of our calls: round-trip fidelity (structured clone, Date survives), the `by-uid` and `by-project` predicates including the `p1`/`p10` prefix case, `deleteByIndex`'s reported-equals-acted count, all-or-nothing multi-store aborts, and the load-bearing `"another tab"` string coupling. Chrome's quota behaviour stays out of reach and the probe says so |
| data-access | transactions-and-units-of-work | partial | `runTx` is the single boundary and the capture-phase error grab is unchanged; the all-or-nothing guarantee is now ASSERTED against a real engine, and `evictIdentity` uses one transaction across four stores for exactly that reason. Still no compare-and-set on read-then-write paths — the step-save race is closed by a latest-wins token instead |
| data-access | batching-and-n-plus-one | followed | `by-uid` / `by-project` indexes with `getByIndex`/`getKeysByIndex`/`deleteByIndex` — set-shaped reads exist rather than per-id loops |
| data-access | cross-driver-invariant-parity | n/a | one storage backend (IndexedDB). Firestore was deliberately dropped (`lib/firebase.ts:9`) |
| **client-state** | store-slicing | followed | slices are domain-of-change (`jobs`, `stepStore`, `useAuth`), not page-named; ephemeral view state stays local |
| client-state | singleton-lifecycle | followed | `stepStore` + `budget` + `apiAuth` rate limiter are module-scoped services and **each ships a reset hatch** (`__resetBudget`, `__resetRateLimit`) as the technique requires |
| client-state | status-fsms | partial | `SaveOutcome` + `StorageTrouble` are typed outcomes, but no enumerated `idle/loading/loaded/failed/stale` status per operation family; freshness is implicit |
| client-state | async-race-guards | followed | a monotonic ticket per key, taken at CALL time and checked in the same synchronous block as the `put`, so nothing can be issued between them (`stepStore.ts` `claimSaveSlot`). Abandoning is a SUCCESS (`superseded`), not a failure. Per key, not global — asserted, because one global token would let Frames cancel Script |
| client-state | identity-scoped-eviction | followed | `lib/identityEviction.ts` is the one owner, below both the identity layer and the stores. Triggers enumerated at the owner (`transitionFor`) with the deliberate exclusion recorded — a credential refresh is not a flip, which is why useAuth subscribes to `onAuthStateChanged` and not `onIdTokenChanged`. Wipes IDB and the persisted localStorage half in one pass, in a `finally` so a failed remote sign-out cannot skip it, and carries the REASON so "you signed out" and "your session ended" read differently |
| client-state | persistence-and-migration | partial | `DB_VERSION = 4` with real IDB upgrade handling and `onversionchange`/`onblocked` (`studioDb.ts:63`); but persisted payloads carry **no in-payload schema version** and rehydration does not validate field-by-field |
| **error-handling** | taxonomy-design | followed | `ImagingErrorKind` closed union with `failed` as the explicit catch-all; transience via `retryable`/`reroutable` getters; `statusFor()` is the single wire mapping (`errors.ts:123`) |
| error-handling | swallowed-error-prevention | followed | the structural fix the technique names: `stepStore.ts:14-29` records that `try{}catch{return fallback}` **was** the bug; `saveStep` now resolves an outcome and every failure reaches the bell channel |
| error-handling | error-doors | followed | two doors — `StorageTrouble` channel → `NotificationBell`, and `logCall`/`logUnexpected` server-side; `GlobalErrorBridge.tsx` closes the unhandled-rejection gap |
| error-handling | crash-capture | partial | `app/error.tsx` + `app/global-error.tsx` cover both App Router levels and `global-error` deliberately depends on nothing from the design system; but no breadcrumb ring, no spool, nothing persists or ships |
| error-handling | user-facing-mapping | partial | `NotificationBell.tsx:30` maps each `StorageFailure` to user terms with a suggestion; the imaging side has no equivalent registry — route errors surface the raw `message` |
| error-handling | structured-propagation | followed | `ImagingError` wraps with `kind`+`provider`+`detail` preserved; the category is decided at the boundary (`http.ts:30`) and never re-derived from prose upstream |
| **browser-credential-boundary** | public-vs-server-env-split | followed | `pipeline/check-bundle.mjs` reads the emitted browser chunks for server-only variable NAMES, live secret VALUES and server-module fingerprints, after `build` in CI. It asserts a positive control before reporting clean, so a grep over the wrong directory is could-not-run rather than success. Proved red through a real build with a seeded client import of `lib/imaging/budget` |
| browser-credential-boundary | broker-proxy-attaches-secret | followed | `app/api/imaging/*` is the one trust boundary; the browser reaches it only via `lib/imagingClient.ts`; keys are attached inside `lib/imaging/` and the caller never holds one |
| browser-credential-boundary | opaque-upstream-errors | followed | `errors.ts:123` derives our own status per kind rather than passing the vendor's through; `ImagingError.detail` (up to 600 chars of vendor body) is **never serialised** — proved at `integration-imaging.mts:611` |
| browser-credential-boundary | omit-the-column-not-the-value | n/a | no client-held database credential and no row-level policy surface; persistence is same-origin IndexedDB |
| browser-credential-boundary | default-deny-plus-defaulted-owner | n/a | Firestore was dropped; there is no public-role database grant to deny |
| **optional-dependency-degradation** | per-variable-blast-radius | followed | `.env.example` carries, per variable, the feature it powers, what breaks without it, the fallback, and the trust class — the artifact this technique asks for, written out |
| optional-dependency-degradation | absent-degrades-malformed-fails-fast | partial | absent now genuinely degrades — it did NOT before: `firebaseReady` said the right thing and the next line constructed the client anyway. Asserted by `firebase-absent-env.probe.spec.ts`, whose first test could not even have reached an assertion against the old module. **Malformed still does not fail fast** — no boot validator, `keyFor()` throws lazily |
| optional-dependency-degradation | capability-honest-refusal | followed | `no-key` → 503 with the variable named only server-side; distinct from `unsupported` (501) and `no-alternative` (409) — permanent gaps and transient outages carry different codes |
| optional-dependency-degradation | guarded-singleton-accessor | followed | **this row was wrong on 2026-08-24 and is corrected here.** `lib/imaging/env.ts` was compliant; `lib/firebase.ts` was not — it built the auth client at MODULE SCOPE, so `getAuth` threw `auth/invalid-api-key` at import time with the variables absent and killed an env-less `next build` while prerendering `/_not-found`. Now `authClient()`: a factory, success memoised and failure not, a typed `FirebaseNotConfiguredError` naming all three variables, never null and never a stub |
| optional-dependency-degradation | probe-the-grant-not-the-config | partial | `isConfigured` tests key presence, which is a configuration fact; a key present but revoked passes the gate and fails at the vendor as `failed` |
| **repo-manifest-standard** | capability-not-tool-vocabulary | followed | `.ai/manifest.yaml` capabilities are `dev`/`build`/`test`/`typecheck`, each a name → an invocation; no field names the tool behind the command |
| repo-manifest-standard | must-ignore-unknown | followed | stated in the file's own header: "unknown fields MUST be ignored — so this survives tool churn and schema growth" |
| repo-manifest-standard | pointers-not-embeds | followed | `paths:` points at `context-map.json`, `.claude/patterns/`, `knowledge/`, `pipeline/`, `tests/golden-path/` — all committed, all resolving in a fresh clone |
| repo-manifest-standard | generated-from-provenance | partial | `generatedFrom:` records its inputs and every `verified: true` names a run. A DRIFT CHECK now exists (`npm run check:manifest`, blocking in CI) and caught real drift on its first run — a capability naming a script nobody had added. There is still **no synthesizer**: the file is hand-maintained and gated, not generated |
| repo-manifest-standard | semver-additive-evolution | followed | `schema: ai-manifest` + `schemaVersion: 0.1.0` — contract identity as a plain name, not a fetchable address, versioned separately from the repo |
| repo-manifest-standard | spec-ships-with-artifact | followed | `.ai/SPEC.md` ships in this repository and resolves in a clone with no network. It carries the reimplementation clause (any implementation performing its checks is conformant; `check-manifest.mjs` is a runner, not the definition) and gives every check an id, so the runner's output and the spec read side by side |
| **rate-limiting** | metered-step-selection | followed | the metered step is production (`/api/imaging/*`), which is where the harm — a real vendor balance — actually lands |
| rate-limiting | key-design | followed | keyed on client IP, `unknown` still collapsing header-less callers (errs safe). The map is now BOUNDED: an idle pass drops full-and-idle buckets (information-free — the recreated bucket admits exactly what a survivor would, asserted), and a pressure pass at `IMAGING_RATE_KEY_CAP` evicts in the order that loses least and is counted APART, because unlike the idle pass it can cost enforcement |
| rate-limiting | refusal-contract | followed | `retryAfterSec` computed from the same arithmetic that refused (`apiAuth.ts:136`), emitted as a real `retry-after` header at `:160` with 429 and a `rate-limited` kind |
| rate-limiting | limit-observability | followed | `rateStats()` returns admitted, refused, nearLimit, both eviction counts and peakKeys, with the CONFIGURED BOUNDS beside them. Pressure is announced once per approach, before refusal. Two bugs were caught by the probes while being written: the idle pass compared the stale stored token count, and the pressure pass fired above the cap rather than at it, settling the population at cap+1 |
| **design-tokens** | token-taxonomy | followed | `components/ui/tokens.ts` is one closed vocabulary published as `--gt-*`; names are roles, not values or call sites |
| design-tokens | token-enforcement | partial | census unchanged: 5 hex literals outside `tokens.ts`, all in `app/global-error.tsx`, a principled exemption. A linter now exists so a no-hex-literal rule is finally possible — none is written, so enforcement is still discipline + census |
| design-tokens | theme-architecture | n/a | single-idiom dark studio by deliberate choice; no light/dark switch and no follow-platform state to prove complete |
| design-tokens | motion-tokens | followed | motion presets are named roles in `tokens.ts`; blanket reduced-motion reset at `globals.css:273`, and no JS animation library to escape it |
| design-tokens | cross-language-token-parity | followed | one source; `GravitoneTokens.tsx` publishes the CSS variables from the same `tokens.ts` the TS side reads — no hand-maintained second copy |
| **async-ui-states** | state-model | partial | per-region models exist (`useResearchRun`, `useFrames`); but the four-input derivation is hand-rolled per hook rather than shared, and there is no sticky `settled` bit |
| async-ui-states | action-busy-states | followed | `lib/jobs.tsx:70` carries a `measured` bit gating `progress`, so a driven job draws elapsed time rather than inventing a fraction — "Meaningless unless `measured` — read that first" (`:60`) |
| async-ui-states | failure-states | followed | failure is a first-class destination, not an empty result: `StorageFailure`'s five kinds each map to a different user action in `NotificationBell.tsx:30` |
| async-ui-states | empty-state-design | partial | empty states exist across the studio steps but are not branched on cause — no distinction between "nothing yet", "nothing matches", and "prerequisite unmet" |
| async-ui-states | arrival-choreography | followed | entrances are mount-bound single-element `gt-rise`; no per-row cascade exists, so no replay guard is owed |
| **toasts-notifications** | durable-notification-ledger | followed | the repo chose a durable unread tray over toasts on purpose — `NotificationBell.tsx:3` "Shows UNREAD events only … Once you have looked, it is history"; survives reload |
| toasts-notifications | severity-taxonomy | followed | `StorageFailure`'s five kinds drive distinct copy and distinct suggested actions rather than one generic alert |
| toasts-notifications | announcement-accessibility | followed | `lib/announcer.tsx`: two regions mounted EMPTY with the app shell above the whole tree, one writer, politeness derived from severity in one exported function, keyed on event identity so renders are inaudible, serial drain with clear-before-write, assertive jumping the queue without erasing it, oldest-polite shed under storm, and focus never touched |
| toasts-notifications | queue-discipline | partial | the ANNOUNCEMENT queue now has all of it — dedup by event key, serial drain, bounded shedding. The VISUAL tray still has none: it folds `storage-trouble` in with job events with no dedup or cooldown keyed by failure identity |

## Deviations backlog

Ranked by value — what a future wave should drain, hardest-hitting first.
**Wave 2 (2026-08-24) drained 11 of the 15.** What is left is below; everything
struck is under `## Drained 2026-08-24`, with the commit that closed it, so the
history stays legible rather than disappearing.

1. **No spend surface.** (cost-metering / spend-observability) `budgetStats()` and now
   `spendByAxis()` return totals, the window boundary, the counters and a split by
   capability, provider, model and outcome. Nothing renders any of it. **blocked: a product
   decision with no evident intent** — where the panel lives, who it is for and what it does
   when the ceiling is hit are choices no agent should make for the operator. The data is
   ready; the design is not.
2. **Persisted payloads carry no schema version.** (client-state / persistence-and-migration)
   `DB_VERSION` versions the *database*; the records inside it have no in-payload version key
   and no migration chain, so a shape change has no total, ordered upgrade path. **Not
   attempted:** adding a version key to newly-written payloads is additive and safe, but the
   half that matters is deciding what happens to the millions of already-written records that
   carry no key at all, and getting that wrong strands persisted work. It wants a stated
   policy first.
3. **Browser drivers are an improvised harness.** (test-harness / live-app-harness) 9
   `pipeline/drive-*.mjs` scripts drive a real browser with no control surface, no launcher and
   no build-time test-only gate. **The only remaining `deviation` row in the map.** Out of
   budget for this wave: it is a design job — a control surface has to be invented, not
   applied — and it is worth doing next, because the drivers are the only thing that
   exercises the real UI.
4. **The five ungrouped contexts.** (codebase-scanning / verify-after-generate) `frames-step`,
   `production-phases`, `research-step`, `script-step`, `shared-notebook` sit with `group: null`
   while `Production Lifecycle` owns zero contexts. **blocked: USER-ONLY.** `context-map.json`
   is `neverTouch` in the manifest, `CLAUDE.md` makes null-group a UI-only repair, and the
   bridge is down. Journalled in `.vault/map-drift.md` with proposed assignments; needs a human
   in Dev Tools → Context Ledger. Untouched by this wave, deliberately.
5. **The context map cannot see `lib/`.** (codebase-scanning / evidence-scoping) The scan globs
   `app/**` + `components/**`, so the entire imaging engine — the repo's highest-risk code — is
   unmapped. **blocked: the glob is not in this repository.** It belongs to the Personas app
   that generates the map, and the map itself is `neverTouch`. Fixing it here would be
   hand-editing a generated artifact, which the next scan erases.

### Still open, smaller

- **A DAL import-boundary rule.** (data-access / layering-rules) `openDb`/`runTx` are exported
  raw handles. Until 2026-08-24 the honest reason nothing stopped a component importing them
  was that there was no linter; there is one now, so the rule is finally writable and simply
  is not written.
- **A token-literal rule.** (design-tokens / token-enforcement) Same shape, same new
  possibility: a no-hex-literal rule with `app/global-error.tsx` as its one exemption.
- **Dedup in the visual tray.** (toasts-notifications / queue-discipline) The announcement
  queue got dedup, serial drain and bounded shedding; the tray itself still enqueues a repeated
  quota failure repeatedly.
- **Boot validation for malformed config.** (optional-dependency-degradation /
  absent-degrades-malformed-fails-fast) Absent now degrades correctly. Malformed still fails
  lazily at call time rather than loudly at boot.
- **A manifest synthesizer.** (repo-manifest-standard / generated-from-provenance) The drift
  check exists and blocks; the file is still hand-maintained rather than generated.

## Drained 2026-08-24

Wave 2. Every item below was fixed to the governing technique's standard, and every new gate,
check and assert in this list was **watched going red** on a seeded failure through its real
invocation and then restored — the list of those injections is in each commit message.

| # | Item | Commit | What closed it |
|---|---|---|---|
| 1 | No binding rung: no CI, no hooks, no linter | `14898d2`, `852eca8`, `5f740fb`, `c0485d6`, `c640015` | eslint flat config at 0 errors, a symmetric per-rule warning ratchet with a committed baseline, and a gates workflow on push/PR whose header grades every job on input determinism |
| 3 | Success-only spend metering | `d87f74b` | `billedOnFailure` in the router's inner catch, deciding on `ImagingError.dispatched` — evidence set by http.ts — with an enumerated switch so a new kind cannot land silently |
| 4 | The ledger row cannot answer any question | `d87f74b` | the row now carries cap, provider, model, outcome and basis, in the same vocabulary log.ts emits, plus `spendByAxis()` |
| 6 | The DAL is untested against a real engine | `a74ea39` | 11 probes over `fake-indexeddb`, including the `"another tab"` string coupling — whose first version was vacuous and was caught by its own seeded-failure test |
| 7 | Keystroke saves have no latest-wins guard | `8952733` | a monotonic per-key ticket taken at call time and checked in the same synchronous block as the `put` |
| 8 | No identity-scoped eviction | `8952733` | `lib/identityEviction.ts`: one owner below the stores, an enumerated trigger list with the credential-refresh exclusion recorded, one transaction across four stores, run in a `finally` |
| 9 | The rate limiter counts nothing and has no reaper | `54c09b4` | `rateStats()` plus a two-pass reaper; the probes caught two real bugs in the reaper while being written |
| 10 | The notification bell is silent to assistive tech | `8634545` | `lib/announcer.tsx` — two regions mounted empty in the app shell, one writer, severity-derived politeness, serial drain |
| 11 | The `NEXT_PUBLIC_` split is prose, not a gate | `903178e` | `pipeline/check-bundle.mjs` reads the emitted browser chunks after `build`, with a positive control so a clean verdict cannot be manufactured |
| 13 | The manifest points outside the repository | `08dc2d0` | `.ai/SPEC.md` ships here with a reimplementation clause, and `npm run check:manifest` gates the manifest against it |
| — | (not on the list) Firebase constructed its client at module scope | `4a8bd65` | found by the new gate's env-less build on its first green install: `auth/invalid-api-key` at import time killed the whole build. Replaced with a guarded accessor |
| — | (not on the list) `npm ci` could never have worked on linux | `c0485d6`, `c640015` | the lockfile was missing hoisted @emnapi entries at `b4ec3b9` and earlier. Nothing had ever tried; a clean linux room found it on the first run |

### Recorded, not a deviation

- `app/global-error.tsx`'s 5 hex literals are the design system's one principled exemption: the root
  boundary must render when `GravitoneTokens` is the thing that failed. Counted, not filed.
- `render-budget.probe.spec.ts:63` deliberately asserts a **known defect** (`expect(after.cells).toBe(5 * N)`
  — 1000 cells rebuilt for a one-field change). That is a measurement pinned on purpose, and fixing
  the memoisation is expected to break the probe. It is characterization, not a passing lie — but the
  next reader should know the test will need editing alongside the fix.

### Not touched by wave 2, on purpose

- `app/_phases/frames/alternatives/` — a concurrent session was mid-edit there earlier on
  2026-08-24, around `ImagingRequestError`. Left alone entirely. For the record, it was not
  breaking anything at the time: `tsc --noEmit` was clean at the start of this wave and stayed
  clean through every commit in it, so nothing in this file's verdicts is excused by it.
- `context-map.json` and the `personas:context-map` block in `CLAUDE.md` — `neverTouch` in
  `.ai/manifest.yaml`, and the manifest gate (`npm run check:manifest`, B1) now fails if that
  boundary list is ever emptied.
