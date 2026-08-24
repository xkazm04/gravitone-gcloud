# Registry conformance — software-engineering
contributor: mkdol-dev-box · audited: 2026-08-24 · bundle: `software-engineering` (146 subjects / 930 techniques)

Scope: **software-engineering only.** The `media-generation` bundle this repo also consumes
(`.ai/manifest.yaml` → `knowledge.domains`) is deliberately **out of scope** here and none of its
subjects are judged below.

13 subjects selected against surfaces this repo actually has: the governed imaging chokepoint
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
| cost-metering | spend-observability | partial | counters + window boundary exist (`budget.ts` `budgetStats`); **no surface renders them** — no spend panel, no outlier view |
| cost-metering | usage-ledgers | deviation | the row is `{at,usd}` — no units, model id, outcome or timestamp-of-call; in-memory, per-process, dies with the lambda |
| cost-metering | spend-attribution | deviation | no axis on any ledger row; the *log line* carries cap/provider/model (`log.ts:102`) but the ledger cannot be joined to it |
| cost-metering | reversible-debit-and-settle | n/a | post-hoc metering against a vendor invoice; no prepaid balance. The technique says products that bill after the fact should not build it |
| **codebase-scanning** | verify-after-generate | partial | audit inlined at `CLAUDE.md:91` and each check names its dated incident (`:84`); run today → **5 ungrouped contexts**, unrepaired because the null-group arm is UI-only and the bridge is down |
| codebase-scanning | llm-assisted-scanning | followed | the scan is treated as a model generator with a measured corruption incident, not a deterministic tool (`CLAUDE.md:82-90`) |
| codebase-scanning | incremental-scanning | followed | delta vs subtree modes with a stated floor — "<8 source files will not give you a context; it will merge, and it may duplicate" `CLAUDE.md:148` |
| codebase-scanning | finding-lifecycle | followed | `.vault/map-drift.md` is append-only, names its drainer ("the next session that finds the bridge alive drains it"), and has a `## Resolved` section |
| codebase-scanning | evidence-scoping | partial | the scan glob is `app/**` + `components/**`; `lib/` (26 files incl. the whole imaging engine), `pipeline/` and `tests/` are wholly unmapped, so the map understates where the risk is |
| codebase-scanning | dead-code-detection | n/a | no reachability sensor or orphan detector in this repo; the map's `unmapped` arm is coverage accounting, not dead-code detection |
| **quality-gates** | gate-liveness | partial | probes distinguish pass/fail but not could-not-run; **fixed today** — `npm test`/`npm run typecheck` now exist, so the gate has an invocation. Still no trigger that fires unasked |
| quality-gates | gate-laddering | deviation | there is **no binding rung**: no CI (`.github/` absent), no hooks (`.git/hooks` is stock samples only). Every check is a courtesy |
| quality-gates | hook-hygiene | n/a | no hook system installed, so there is nothing to keep hygienic. The absence is scored under gate-laddering, not here |
| quality-gates | severity-by-construction | deviation | **no linter at all** — no `eslint.config.*`, `.eslintrc*`, `biome.json`, no lint devDependency. `next build`'s `tsc` is the only thing whose exit code can block |
| quality-gates | ratchet-design | n/a | nothing is currently ratcheted; no baseline file exists to judge |
| quality-gates | false-positive-economics | n/a | no detector ships, so there is no precision to measure |
| **test-harness** | negative-control-tests | followed | `sort-stability.probe.spec.ts:53` "Controlled counterfactual … (Synthetic control, not a repo site)"; `imaging-auth.probe.spec.ts:9` records that the probes fail against the pre-fix routes |
| test-harness | suite-partitioning | followed | one real config per suite (`playwright.config.ts` → `tests/golden-path` only); membership by location, not annotation |
| test-harness | isolation-lanes | partial | `integration-imaging.mts:33` "THE TWO HALVES DO NOT SHARE A PROCESS, deliberately" + `sealNetwork()` `:93`; but `fullyParallel: false` carries **no stated reason**, and probes mutate `process.env` in one shared process |
| test-harness | live-app-harness | deviation | 9 ad-hoc `pipeline/drive-*.mjs` browser drivers with no designed control surface, no launcher, no build-time test-only gate — the improvised door the technique names |
| test-harness | fixture-economics | followed | `tests/golden-path/_helpers.ts` builders (`mkProject`) with defaults; no shared mutable fixture; no hand-maintained truncate list |
| test-harness | flake-lifecycle | n/a | no retained run history and no quarantine register exists to judge |
| **data-access** | layering-rules | partial | `lib/studioDb.ts` owns every IDB primitive and is partitioned by aggregate (`projects`/`themes`/`assets`/`stepStore`); but `openDb`/`runTx` are **exported raw handles**, and no gate stops a component importing them (no linter) |
| data-access | row-mapping | followed | `stepStore.ts:58` closed `StorageFailure` union; `classify()` converts DOM exceptions at the seam; corrupt/unavailable reads are reported, not silently skipped |
| data-access | repo-testing | deviation | **nothing tests against the real IndexedDB engine.** The 60 probes are Node-context and never open a DB; the DAL's round-trip fidelity is unasserted |
| data-access | transactions-and-units-of-work | partial | `runTx` is the single boundary implementation and `studioDb.ts:141` captures `error` in the capture phase (measured Chromium bug); no compare-and-set on read-then-write paths |
| data-access | batching-and-n-plus-one | followed | `by-uid` / `by-project` indexes with `getByIndex`/`getKeysByIndex`/`deleteByIndex` — set-shaped reads exist rather than per-id loops |
| data-access | cross-driver-invariant-parity | n/a | one storage backend (IndexedDB). Firestore was deliberately dropped (`lib/firebase.ts:9`) |
| **client-state** | store-slicing | followed | slices are domain-of-change (`jobs`, `stepStore`, `useAuth`), not page-named; ephemeral view state stays local |
| client-state | singleton-lifecycle | followed | `stepStore` + `budget` + `apiAuth` rate limiter are module-scoped services and **each ships a reset hatch** (`__resetBudget`, `__resetRateLimit`) as the technique requires |
| client-state | status-fsms | partial | `SaveOutcome` + `StorageTrouble` are typed outcomes, but no enumerated `idle/loading/loaded/failed/stale` status per operation family; freshness is implicit |
| client-state | async-race-guards | deviation | callers fire `void saveStep(...)` on every keystroke with **no latest-wins token**; two in-flight saves for one `${projectId}:${phase}` key settle in arrival order |
| client-state | identity-scoped-eviction | deviation | no named owner routine wipes user-scoped IndexedDB on sign-out; projects/themes/assets are keyed `by-uid` but survive an account switch on a shared machine |
| client-state | persistence-and-migration | partial | `DB_VERSION = 4` with real IDB upgrade handling and `onversionchange`/`onblocked` (`studioDb.ts:63`); but persisted payloads carry **no in-payload schema version** and rehydration does not validate field-by-field |
| **error-handling** | taxonomy-design | followed | `ImagingErrorKind` closed union with `failed` as the explicit catch-all; transience via `retryable`/`reroutable` getters; `statusFor()` is the single wire mapping (`errors.ts:123`) |
| error-handling | swallowed-error-prevention | followed | the structural fix the technique names: `stepStore.ts:14-29` records that `try{}catch{return fallback}` **was** the bug; `saveStep` now resolves an outcome and every failure reaches the bell channel |
| error-handling | error-doors | followed | two doors — `StorageTrouble` channel → `NotificationBell`, and `logCall`/`logUnexpected` server-side; `GlobalErrorBridge.tsx` closes the unhandled-rejection gap |
| error-handling | crash-capture | partial | `app/error.tsx` + `app/global-error.tsx` cover both App Router levels and `global-error` deliberately depends on nothing from the design system; but no breadcrumb ring, no spool, nothing persists or ships |
| error-handling | user-facing-mapping | partial | `NotificationBell.tsx:30` maps each `StorageFailure` to user terms with a suggestion; the imaging side has no equivalent registry — route errors surface the raw `message` |
| error-handling | structured-propagation | followed | `ImagingError` wraps with `kind`+`provider`+`detail` preserved; the category is decided at the boundary (`http.ts:30`) and never re-derived from prose upstream |
| **browser-credential-boundary** | public-vs-server-env-split | partial | the split is real and documented (`.env.example:20` "UNLIKE the Firebase block above, these are SECRETS … none may ever be" prefixed); but **no gate reads the built bundle** — the rule is prose |
| browser-credential-boundary | broker-proxy-attaches-secret | followed | `app/api/imaging/*` is the one trust boundary; the browser reaches it only via `lib/imagingClient.ts`; keys are attached inside `lib/imaging/` and the caller never holds one |
| browser-credential-boundary | opaque-upstream-errors | followed | `errors.ts:123` derives our own status per kind rather than passing the vendor's through; `ImagingError.detail` (up to 600 chars of vendor body) is **never serialised** — proved at `integration-imaging.mts:611` |
| browser-credential-boundary | omit-the-column-not-the-value | n/a | no client-held database credential and no row-level policy surface; persistence is same-origin IndexedDB |
| browser-credential-boundary | default-deny-plus-defaulted-owner | n/a | Firestore was dropped; there is no public-role database grant to deny |
| **optional-dependency-degradation** | per-variable-blast-radius | followed | `.env.example` carries, per variable, the feature it powers, what breaks without it, the fallback, and the trust class — the artifact this technique asks for, written out |
| optional-dependency-degradation | absent-degrades-malformed-fails-fast | partial | absent degrades correctly (`firebaseReady` at `firebase.ts:45` demands all three — "A partial config is a missing config"); but **malformed does not fail fast** — no boot validator, `keyFor()` throws lazily at call time |
| optional-dependency-degradation | capability-honest-refusal | followed | `no-key` → 503 with the variable named only server-side; distinct from `unsupported` (501) and `no-alternative` (409) — permanent gaps and transient outages carry different codes |
| optional-dependency-degradation | guarded-singleton-accessor | followed | `keyFor()`/`isConfigured()` (`env.ts:34`) are the one door; no client constructed at module scope; no stub and no null returned |
| optional-dependency-degradation | probe-the-grant-not-the-config | partial | `isConfigured` tests key presence, which is a configuration fact; a key present but revoked passes the gate and fails at the vendor as `failed` |
| **repo-manifest-standard** | capability-not-tool-vocabulary | followed | `.ai/manifest.yaml` capabilities are `dev`/`build`/`test`/`typecheck`, each a name → an invocation; no field names the tool behind the command |
| repo-manifest-standard | must-ignore-unknown | followed | stated in the file's own header: "unknown fields MUST be ignored — so this survives tool churn and schema growth" |
| repo-manifest-standard | pointers-not-embeds | followed | `paths:` points at `context-map.json`, `.claude/patterns/`, `knowledge/`, `pipeline/`, `tests/golden-path/` — all committed, all resolving in a fresh clone |
| repo-manifest-standard | generated-from-provenance | partial | `generatedFrom:` records its inputs and `verified:` is now true where the command was actually run; but there is **no synthesizer and no drift check** — the manifest is hand-maintained |
| repo-manifest-standard | semver-additive-evolution | followed | `schema: ai-manifest` + `schemaVersion: 0.1.0` — contract identity as a plain name, not a fetchable address, versioned separately from the repo |
| repo-manifest-standard | spec-ships-with-artifact | deviation | the manifest cites `personas/.ai/manifest.yaml` as its shape reference — a path **outside this repository**, which forfeits the self-describing-clone guarantee |
| **rate-limiting** | metered-step-selection | followed | the metered step is production (`/api/imaging/*`), which is where the harm — a real vendor balance — actually lands |
| rate-limiting | key-design | partial | keyed on client IP (`apiAuth.ts:145`); `unknown` collapses all header-less callers into one bucket and the comment says it "errs safe", but **no cardinality cap, no reaper** on the `buckets` map |
| rate-limiting | refusal-contract | followed | `retryAfterSec` computed from the same arithmetic that refused (`apiAuth.ts:136`), emitted as a real `retry-after` header at `:160` with 429 and a `rate-limited` kind |
| rate-limiting | limit-observability | deviation | the limiter counts nothing — no admitted/refused series, no evictions, no near-limit warning. (The budget ceiling next to it now does; this one still does not) |
| **design-tokens** | token-taxonomy | followed | `components/ui/tokens.ts` is one closed vocabulary published as `--gt-*`; names are roles, not values or call sites |
| design-tokens | token-enforcement | partial | census re-run today: **5 hex literals outside `tokens.ts`, all in `app/global-error.tsx`** — a principled exemption (that file must not depend on the token system that may have failed). But enforcement is discipline + census, **not a gate**, because there is no linter |
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
| toasts-notifications | announcement-accessibility | deviation | the bell is the app's main feedback channel and has **no live region**; the only `role="status"` in the repo is `app/_phases/research/run/controls.tsx` |
| toasts-notifications | queue-discipline | partial | the tray folds `storage-trouble` alerts in with job events, but there is no dedup/cooldown keyed by failure identity — a repeated quota failure enqueues repeatedly |

## Deviations backlog

Ranked by value — what a future wave should drain, hardest-hitting first.

1. **No binding rung: no CI, no hooks, no linter.** (quality-gates / gate-laddering, severity-by-construction) The
   probes that guard *money* (`imaging-budget`) and *auth* (`imaging-auth`) now have an invocation
   (`npm test`, added by this pass) but still nothing that fires unasked. One workflow file running
   `typecheck` + `test` on push converts 60 courtesy checks into a gate. **Highest value in the list**
   — every other deviation here is unenforceable until this exists.
2. **The five ungrouped contexts.** (codebase-scanning / verify-after-generate) `frames-step`,
   `production-phases`, `research-step`, `script-step`, `shared-notebook` all sit with `group: null`
   while the `Production Lifecycle` group owns zero contexts. Not repairable by an agent: `CLAUDE.md`
   makes null-group a **UI-only** repair and the bridge is down. Recorded in `.vault/map-drift.md`
   with proposed assignments; needs a human in Dev Tools → Context Ledger.
3. **Success-only spend metering.** (cost-metering / usage-ledgers) `router.ts:234` books spend only
   on the success branch. A call that reached the vendor and then timed out or returned a bad
   response consumed units the vendor will bill and books nothing — and it underbills worst exactly
   during an incident. Needs care: `no-key`/`unsupported`/`constraint` drop-outs never reached the
   provider and must stay unbooked, so this is a judgment about the inner catch at `:246`, not a
   one-liner.
4. **The ledger row cannot answer any question.** (cost-metering / usage-ledgers, spend-attribution)
   `{at, usd}` carries no capability, provider, model or outcome — so "which step spent this month's
   budget" is unanswerable, and the log line that *does* carry those axes cannot be joined to it.
   Widening the row is cheap; it is listed below the item above because it is additive, not corrective.
5. **No spend surface.** (cost-metering / spend-observability) `budgetStats()` now returns totals,
   the window boundary and the pipeline's own counters, and nothing renders them. The data exists;
   the panel does not.
6. **The DAL is untested against a real engine.** (data-access / repo-testing) Every one of the 60
   probes is Node-context; not one opens IndexedDB. Round-trip fidelity, the `by-uid` predicates and
   the `onblocked`/quota classification paths — including the load-bearing `"another tab"` string
   coupling between `studioDb.ts` and `stepStore.classify()` — are asserted nowhere.
7. **Keystroke saves have no latest-wins guard.** (client-state / async-race-guards) Callers fire
   `void saveStep(...)` per keystroke; two in-flight writes for one `${projectId}:${phase}` settle in
   arrival order, so a slow earlier write can land on top of a faster later one.
8. **No identity-scoped eviction.** (client-state / identity-scoped-eviction) Sign-out leaves
   projects, themes and assets in IndexedDB. Records are keyed `by-uid` so they are not *shown*
   cross-account, but they are not wiped, and no named owner routine exists to wipe them.
9. **The rate limiter counts nothing and has no reaper.** (rate-limiting / limit-observability,
   key-design) The `buckets` map grows one entry per client IP forever with no cap and no staleness
   rule, and no admitted/refused series exists. The budget ceiling beside it got its counters in this
   pass; this one is the same fix, one file over.
10. **The notification bell is silent to assistive tech.** (toasts-notifications /
    announcement-accessibility) The app's primary feedback channel has no live region, so every
    storage failure and job completion is invisible to a screen reader.
11. **The `NEXT_PUBLIC_` split is prose, not a gate.** (browser-credential-boundary /
    public-vs-server-env-split) The rule is stated well in `.env.example` and honoured in practice,
    but nothing reads the built bundle to prove `lib/imaging/` never inlined into client output —
    and a module imported by both a route and a client component inlines with no line of source
    saying so.
12. **Persisted payloads carry no schema version.** (client-state / persistence-and-migration)
    `DB_VERSION` versions the *database*; the records inside it have no in-payload version key and no
    migration chain, so a shape change has no total, ordered upgrade path.
13. **The manifest points outside the repository.** (repo-manifest-standard / spec-ships-with-artifact)
    `.ai/manifest.yaml` cites `personas/.ai/manifest.yaml` as its shape reference — unresolvable in a
    fresh clone. Vendor the spec with a drift check, or downgrade the line to a human-facing citation.
14. **The context map cannot see `lib/`.** (codebase-scanning / evidence-scoping) The scan globs
    `app/**` + `components/**`, so the entire imaging engine — the repo's highest-risk code — is
    unmapped, and `/perfect`, `/explorer` and `/uat` read that map as truth.
15. **Browser drivers are an improvised harness.** (test-harness / live-app-harness) 9
    `pipeline/drive-*.mjs` scripts drive a real browser with no control surface, no launcher, and no
    build-time test-only gate.

### Recorded, not a deviation

- `app/global-error.tsx`'s 5 hex literals are the design system's one principled exemption: the root
  boundary must render when `GravitoneTokens` is the thing that failed. Counted, not filed.
- `render-budget.probe.spec.ts:63` deliberately asserts a **known defect** (`expect(after.cells).toBe(5 * N)`
  — 1000 cells rebuilt for a one-field change). That is a measurement pinned on purpose, and fixing
  the memoisation is expected to break the probe. It is characterization, not a passing lie — but the
  next reader should know the test will need editing alongside the fix.
