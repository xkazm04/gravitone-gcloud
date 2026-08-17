# Knowledge-Library Field Report — gravitone-gcloud

**Headline:** 70 physics clauses scored across 12 leaves — **28 holds / 6 violates / 13 partial / 23 n/a.**
The repo is a young, single-locale Next.js imaging studio with **no CI, no git hooks, no linter, no
i18n, no React error boundary, and no `Intl`** — which drives most of the 23 n/a and the small V
count. Where a subject *does* exist, the repo is unusually disciplined: its error-handling,
dead-reference handling, secret-redaction and design-token layers are **positive exemplars that
exceed the corpus's own siblings** — including a concrete implementation of the one affordance
`entity-picker` P4 reports as unmet across six codebases. The genuine gaps are structural: valuable
gates that exit non-zero but are wired to no boundary, and zero crash-containment for an unexpected
render throw.

---

## 0. Orientation

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4 · Firebase (auth) ·
client-side IndexedDB + localStorage persistence. No test framework (`package.json` has only
`dev/build/start/check:notebook`); Playwright is a dev dep but no runner is scripted.

**Size (tracked, by ext):** 81 `.tsx`, 71 `.ts`, 132 md, 43 json, 23 mjs, 8 mts, 6 py. Source under
scope: **132 files** in `app/` + `lib/` + `components/` (`git ls-files` count, executed). App is a
five-step video-production "studio" (script · frames · motion · score · cut) over an imaging
pipeline that routes across Google/Leonardo/Qwen vendors with cross-vendor re-route on refusal.

**Governance artifacts present:** `context-map.json` (Personas-generated, 10 contexts/6 groups) ·
`CLAUDE.md` (rich, its own conventions — context-map refresh protocol, focus-ring rule, colour-literal
rule) · `AGENTS.md` (Next.js agent block) · `.claude/patterns/` (Personas workspace pattern-fabric
projection, 284 patterns, all `state_here: proposed` — this is the corpus projected *in*, not a native
gravitone practice, so it is excluded from enrichment). **Absent:** `.github/workflows` (none),
`.husky`/`lefthook.yml` (none), git hooks (none non-sample), any `eslint`/`prettier`/`biome` config
(`git ls-files` exit 1, executed).

**Instruments:** `rg` CLI is **not on PATH** (`rg: command not found`) — all counts below were run with
`git grep` as the primary implementation and the ripgrep-backed Grep tool / manual enumeration as the
second. No live DB was opened.

---

## 1. Scorecard

Verdict key: `holds` / `violates` / `partial` / `n/a`. "exec" = measured by running a command/read;
"read" = judged from reading the cited source.

### Universal core

| leaf | clause | verdict | evidence (file:line, count, executed?) |
|---|---|---|---|
| swallowed-error-telemetry | Swallowed failure leaves a structured, identifying trail | **holds** | exec: 26 `try/catch` + 11 `.catch` sites enumerated (`git grep`); **0 empty catches** (`git grep 'catch(){}' ` exit 1); every body binds+routes. Typed `StorageTrouble` `stepStore.ts:65-72`; typed `CallLog` `log.ts:82-127` |
| swallowed-error-telemetry | One chokepoint, so the call site cannot decide | **holds** | read: imaging log written from the router chokepoint `router.ts:159` → `logCall`; storage failures funnel through one `report()` `stepStore.ts:136-140` |
| swallowed-error-telemetry | Stable call-site tag naming the operation | **holds** | read: `cap`/`kind` on every imaging line `log.ts:102-127`; `op`+`phase` on every storage trouble `stepStore.ts:65-72` (functional identity, not a `module:op` literal) |
| swallowed-error-telemetry | User door vs operator door = different door, not an `if` | **holds** | read: user door = trouble channel → `NotificationBell.tsx:147-171`; operator door = `console.error`/`logCall` `log.ts:129-140`. Distinct sinks, not a call-site branch |
| swallowed-error-telemetry | Swallows are counted and rolled up | **partial** | read: `unpriced` renders counted `Playground.tsx:215-219`; but **no aggregate error counter and no durable operator sink** (0 Sentry — `git grep -li sentry` exit 1). Client crashes reach the bell (screen) but nothing persistent |
| secret-leak-scanning | Tool-vs-control decided explicitly in code | **partial** | read: no scanner tool exists, so the "what does the build do when the tool is absent" decision is moot; the `.env` decision *is* documented (`.gitignore:33-38`, "the template IS the opt-in… holds no secrets") |
| secret-leak-scanning | Blocking control sited at the last reversible moment (push) | **n/a** | exec: no pre-commit/pre-push/CI exists at all (`ls .github/workflows` → no such dir; no hooks) |
| secret-leak-scanning | Allowlist as narrow as its claim; stale exemption fails | **n/a** | no scanner, no allowlist |
| secret-leak-scanning | Name-based (`.gitignore`) AND content-based defence, both | **partial** | exec: name-based **holds** — `.env*` + `*.pem` ignored, only `.env.example` tracked (`git ls-files`), 0 committed secret-shaped strings (`git grep 'sk-…\|AIza…\|BEGIN…PRIVATE KEY'` → 0 files). Content-based scanner for *commits* absent; content-based redaction for *logs* present (next row) |
| secret-leak-scanning | Redaction reach is measured and central | **holds** | read: single reach point `scrub()` `log.ts:64-74`; redacts by **live secret VALUE** (`liveSecrets()` `log.ts:50-59`), not by guessing the field; `Bearer`/userinfo/`key=` fallbacks |
| secret-leak-scanning | Exclusion list = inventory of what must never appear | **holds (exemplary)** | read: `log.ts:17-40` audits *what a log line MAY carry* before the first line; `ImagingError.detail` (raw ≤600-char vendor body / user prompt) is **never logged** `log.ts:29-32`. Pre-empts the exact clause-6 failure the corpus paid for |
| commit-path-gates | The failure arm exits non-zero | **holds** | read: `check-notebook.mts:48` `process.exit(issues.length?1:0)`; `gate-regression.mts` exits on `bad`; correct exit codes throughout `pipeline/*.mts` |
| commit-path-gates | Check sited on a hook where its verdict changes the outcome | **violates** | exec: **zero hooks, zero CI**; only `check:notebook` is even an npm script (`package.json`); `gate-regression`/`integration-imaging`/`assets-tree-regression` are manual `npx tsx`. Every gate's verdict changes nothing automatically |
| commit-path-gates | Never swallow the verdict (no `\|\|true`/`continue-on-error`/`--max-warnings`) | **holds** | read: no CI to contain those; the advisory-vs-failure split is done cleanly — conclusion findings are "advisory, never failures" and excluded from the exit code `check-notebook.mts:38-46` |
| commit-path-gates | Make absence loud | **partial** | read: gates exit loud *when run*, but their absence from any automated boundary is silent — nothing runs them, so a broken notebook graph ships unless a human remembers |
| cross-artifact-drift-gate | Prove freshness by regenerate-and-compare, not diff | **n/a** | read: no generated-artifact freshness gate in this repo's own build. `context-map.json` is generated by the external Personas app; `CLAUDE.md:92-102` documents only a *manual* verify script |
| cross-artifact-drift-gate | Act on the exit code (gate, not advisory) | **holds** | read: `check-notebook.mts:38-48` explicitly separates advisory findings from exit-code-bearing "broken edges" |
| cross-artifact-drift-gate | Pair comparison with an inventory of what should exist | **holds (analogue)** | read: `check-notebook.mts:12-24` validates the id-graph — references to nothing, ids spent twice, untagged facts — which is the "inventory direction" applied to a notebook graph rather than to bindings |
| cross-artifact-drift-gate | Precondition fails loudly on an empty compare set | **n/a** | not exercised — the notebook check is a graph walk, not a parity compare, so the empty-set failure mode does not arise here |

### Frontend lane

| leaf | clause | verdict | evidence (file:line, count, executed?) |
|---|---|---|---|
| metric-tile | P1 — three-state (unmeasured/none/some) in the tile's own contract | **partial** | read: the distinction is honored rigorously but lives in **caller/domain types, not a tile primitive** — `unpriced` field `frames.ts:156-167`, `"cost not reported"` `versions.ts:205-207`. Behavior holds; the mechanism the leaf prescribes (put it in the tile's type) is absent because there is no tile |
| metric-tile | P2 — the unmeasured case is a property of the grid | **holds** | read: `unpriced` threaded consistently across every spend surface (`frames.ts`, `Playground.tsx:167,215-219`, `versions.ts`); no measured-0 sits beside a fabricated-0 |
| metric-tile | P3 — value not stringified before it reaches the tile | **partial** | read: values *are* stringified at call sites (`usd()`, `$${…toFixed}`), but the absence signal (`unpriced`) travels as structured data alongside, so absence is not spent even though the number is |
| metric-tile | P4 — a delta names its second population | **n/a** | exec: no delta / percent-change / "+12%" tiles found (`git grep 'delta\|percent change'`) |
| metric-tile | P5 — refusing to render a number is legitimate and available | **holds** | read: `"not measured on this render. Shown as unmeasured rather than as [zero]"` `HypothesisColumn.tsx:114`; `"cost not reported"` `versions.ts:205` |
| metric-tile | P6 — up-is-not-good (polarity) | **n/a** | no green-up/red-down metric coloring found |
| metric-tile | P7 — sparkline anchored, not fit-to-sample | **n/a** | no auto-scaled trend sparklines of the metric kind (matrix bars are domain viz, not metric tiles) |
| metric-tile | P8 — loading shows geometry, not numbers | **partial** | read: `AssetsBrowser.tsx:78-83` loading shows a text line, not a geometry-matched ghost — but it renders **no fabricated zeros** (the worse failure mode is avoided); the calm skeleton is simply not built |
| metric-tile | P9 — a shared tile primitive, not a per-concept copy | **violates** | read: no shared `Stat`/tile; spend tiles are inline in `FramesAssembly.tsx:52-70`, `Playground.tsx:287`, `versions.ts`, `parts.tsx:332`. The absence rules are re-earned per copy (they currently hold only by discipline) |
| long-list-rendering | P1 — the container is told how many rows it may render | **partial** | read: `AssetsBrowser.tsx:123` `shown.map(...)` is **unbounded and growable** (assets accrete with every approved plate), no windowing anywhere in the repo (no virtualization dep, exec exit 1). All *other* lists are domain-bounded (≤ ~30: 16 frames, ~21 presets, a handful of projects) |
| long-list-rendering | P2 — bounding the fetch ≠ bounding the render | **n/a** | no fetch limits — data is a whole-store IndexedDB read |
| long-list-rendering | P3 — a sort over a window must not look like a claim about the corpus | **n/a** | no client-sort-over-paged-list; no pagination |
| long-list-rendering | P4 — appending a page must not move rendered rows | **n/a** | no load-more pagination anywhere |
| long-list-rendering | P5 — a truncated surface says so, where the rows stop | **holds** | read: nothing is truncated, and the count is disclosed anyway — `· {shown.length}` `AssetsBrowser.tsx:109`, `total={rows.length}` to the folder tree `:95` |
| long-list-rendering | P6 — one windowing threshold everywhere | **n/a** | no thresholds (no windowing) |
| long-list-rendering | P7 — the bound survives a redesign (lives in the primitive) | **n/a** | no windowing primitive to survive |
| error-boundary | P1–P5, P8 — boundary is a latch / blast radius / safe fallback / retry-only-for-nondeterministic / escapes leave / report-from-captured-state | **n/a** | exec: **0 React error boundaries** (`git grep 'componentDidCatch\|getDerivedStateFromError\|ErrorBoundary'` exit 1), **0 Next.js `error.tsx`/`global-error.tsx`** (`git ls-files` grep empty). No boundary exists, so its behavioral clauses have no subject |
| error-boundary | P6 — a boundary that catches is a boundary that hides | **n/a** | no boundary |
| error-boundary | P7 — a boundary catches render/lifecycle only; the rest needs a global mechanism | **violates** | exec: **neither a boundary NOR a global handler** exists (`git grep 'window.onerror\|unhandledrejection'` → only IndexedDB `req.onerror`, no window-level). A single unexpected render throw unmounts to Next's default page; async/handler failures reach nothing except per-catch routing |
| view-state-persistence | P1 — view state has a chosen home | **holds** | read: deliberate homes — IndexedDB (`stepStore.ts`), localStorage (`jobs.tsx:157`), URL `?step=` (`StudioView.tsx:70`) |
| view-state-persistence | P2 — layout decides lifetime, so decide it | **holds** | read: drafts/steps live durably in IndexedDB; ephemeral UI (menu, selection) in component state — the assignment is reasoned in comments (`stepStore.ts:14-29`) |
| view-state-persistence | P3 — three lifetimes, and the choice is written down | **holds** | read: choices annotated (`jobs.tsx:148-161`, `stepStore.ts:23-29`) |
| view-state-persistence | P4 — a restored value was written by a previous program version | **holds** | read: legacy `measured ?? true` remap `jobs.tsx:172-173`; running→interrupted remap on reattach `readStore` `jobs.tsx:193-198` |
| view-state-persistence | P5 — check the restored value against what exists now, not its shape | **partial** | read: **holds** for `PHASES.includes(wanted)` `StudioView.tsx:98` and the status remap; **but** `parseStore` casts `JSON.parse(raw) as Persisted` `jobs.tsx:170` without validating the `kind`/`status` enums against current unions |
| view-state-persistence | P6 — declaring durable ≠ deciding survivable (separate places) | **holds** | read: small repo, both concerns co-located and reasoned per store |
| view-state-persistence | P7 — memory via an optional identity arg reaches few callers | **n/a** | no shared opt-in memory API of that shape |
| view-state-persistence | P8 — a restore key names the view, not just the place | **holds** | read: `?step=` keyed to project+step and falls back to the parked step on an unknown value `StudioView.tsx:69-101` |
| view-state-persistence | P9 — a versioned migration, not a permanent rewrite rule | **partial** | read: `STORE_KEY = "gravitone.jobs.v1"` `jobs.tsx:157` (key-name version) + an ad-hoc legacy remap, but **no formal `version` field + `migrate` ladder** — the remap runs forever with no way to learn its cause is gone |
| view-state-persistence | P10 — authored state and inferred state get different policies | **holds** | read: authored research topics/notes persisted durably in IndexedDB; ephemeral inferred UI state is not persisted |
| view-state-persistence | P11 — a restored narrowing announces itself | **holds** | read: folder narrowing is always visible (breadcrumb + count `AssetsBrowser.tsx:108-109`), and selection is not persisted across reload, so the silent-restored-narrowing hazard does not arise |
| translation-completeness | P1–P8 (entire leaf) | **n/a** | exec: **no i18n system** — no `next-intl`/`useTranslation`/catalog; the only `locale` hits are `localeCompare` and one comment (`git grep` verified). Single-locale English app; every clause is untested here, honestly |
| design-token-usage | P1 — write in the system's name, not the raw scale | **partial** | read: chrome colours go through tokens (`tokens.ts` → CSS vars), but Tailwind colour utilities (`text-cyan-300`, `bg-white/5`) are used deliberately as "the rendered form of the accents" `tokens.ts:20-24` — raw-scale-class in the corpus sense, though a *documented* decision, not drift |
| design-token-usage | P2 — re-pointing a scale in place turns raw classes into lies | **holds (hazard avoided)** | exec: no in-place `--radius-*`/colour scale override (`git grep '--radius'` empty); radii are `rounded-xl`/`rounded-[3px]` arbitraries, so `rounded-lg` still means Tailwind's `rounded-lg`. The exact hazard the corpus's two siblings hit is absent here |
| design-token-usage | P3 — the defining layer uses tokens most rigorously | **holds (exemplary)** | read: `tokens.ts` is the single source of truth; `<GravitoneTokens>` emits once; `globals.css` + components consume the vars; the file documents killing the prior duplicate-and-drift (`tokens.ts:5-9`) |
| design-token-usage | P4 — a token is a decision made once; dead tokens are lost | **holds (exemplary)** | read: **"EVERY TOKEN BELOW HAS A READER"** entry-condition `tokens.ts:80-92`; dead tokens deleted with rationale (chart trio, `--gt-hue`, slider tokens `tokens.ts:120-127,177-186`) |
| design-token-usage | P5 — a composite token owns all its properties | **holds** | read: complete box-shadows shipped as tokens (`--gt-shadow-float`/`--gt-shadow-glow` `tokens.ts:141-166`) precisely to stop per-site re-typing of the pieces |
| design-token-usage | P6 — ship tokens in the same notation as what they replace | **holds** | read: tokens are CSS custom properties consumed by both CSS and TS; most colour is typable Tailwind classes |
| design-token-usage | P7 — an allow-list gate, not a deny-list | **violates** | exec: **no lint gate at all** (no eslint config). The colour-literal rule is enforced by prose + a manual audit ("chrome is clean as of 2026-08-14" `tokens.ts:38-42`) — inspection, not an allow-list gate |
| design-token-usage | P8 — every exemption names the gap it stands in for | **holds** | read: the three documented exceptions (Tailwind utilities, preset *content*, prose measurements) each carry their rationale `tokens.ts:18-40` — but no mechanical gate to shrink them |
| number-and-cost-formatting | P1 — hand the number to a locale-aware layer | **violates (latent)** | exec: **`Intl` appears 0 times** (`git grep 'Intl\.'` exit 1); every number is formatted at the call site. No user-visible bug today (single locale) but structurally locale-blind |
| number-and-cost-formatting | P2 — rounding is a contract about loss | **partial** | read: `usd()` scales precision by magnitude to avoid sub-cent→0 `versions.ts:183`, but `toFixed(2)`/`toFixed(3)` concat sites elsewhere can still round small money down; mitigated by `unpriced` (missing ≠ 0) not by precision floors |
| number-and-cost-formatting | P3 — a unit welded by concatenation cannot be re-ordered/re-signed | **violates** | exec: **12 `$${…toFixed}` concat sites** (`git grep`); the unit is welded as a string across the app |
| number-and-cost-formatting | P4 — zero, unknown, and too-small are three different facts | **holds (exemplary)** | read: `unpriced` is a first-class FLOOR distinct from 0 — "a missing figure must not print as free / as zero", counted and propagated (`frames.ts:156-167`, `log.ts:114-115`, `Playground.tsx:80,215-219`). The single strongest clause in the sweep |
| number-and-cost-formatting | P5 — a formatter that defaults a locale is locale-blind with extra steps | **n/a (latent)** | no shared locale-accepting formatter exists to mis-default; single locale |
| number-and-cost-formatting | P6 — a gate keyed on syntax narrows to zero | **n/a** | no formatting gate exists |
| number-and-cost-formatting | P7 — two primitives disagreeing on the locale source disagree on screen | **partial** | read: the reinvented-ladder form of this hazard is live — `mmss` defined **3×** (`frames.ts:174`, `editPlan.ts:100`, `renders.ts:167`), plus `secs()` ×2 and 4 distinct `toFixed` precisions; they disagree with each other even without a locale axis |

**Summary line: 70 clauses scored — 28 holds / 6 violates / 13 partial / 23 n/a.**

---

## 2. Deviations (APPLY lane — nothing applied, no source touched)

Ordered by severity. Each is a *deviation note*, not a change.

- **P0 — no crash containment (`error-boundary` P7).** A five-step studio has 0 React error
  boundaries, 0 `error.tsx`, and 0 global `window.onerror`/`unhandledrejection` handler. **Fix:** add a
  Next.js `app/error.tsx` (segment boundary) + one `app/global-error.tsx`, and register a global
  unhandled-rejection handler that routes into the existing trouble channel (`stepStore.ts`). Severity
  high: today an unexpected render throw blanks the studio with no report and no recovery.
  *No behaviour change to existing paths — this is pure addition.*

- **P1 — valuable gates wired to no boundary (`commit-path-gates` violates).** `check-notebook.mts`,
  `gate-regression.mts`, `integration-imaging.mts` all exit non-zero correctly but run only by hand.
  **Fix:** a `lefthook.yml` pre-push (or a minimal `.github/workflows/ci.yml`) that runs the three;
  glob the notebook check to `app/_phases/_shared/notebook/**` (the files it *reads*). Severity high:
  the gate that proved a shipped defect (`gate-regression.mts:5-9`) protects nothing between runs.
  **Held reasoning:** wiring a hook is a workflow change the maintainer should choose; the note is the
  deliverable.

- **P1 — no content secret-scan on commit (`secret-leak-scanning`).** Name-based defence is clean, but
  a secret arriving under an unanticipated filename has no content-based catch at the commit boundary.
  **Fix:** a pre-commit `gitleaks`/`trufflehog` (or a 20-line staged-diff regex over the `scrub()`
  patterns already written in `log.ts:64-74`). Severity medium (small team, keys are `NEXT_PUBLIC_*`
  or server env, none committed today).

- **P2 — one unbounded render (`long-list-rendering` P1).** `AssetsBrowser.tsx:123` renders every asset
  with no window; assets grow with every approved plate. **Fix:** window past ~1–2 viewports (a fixed
  threshold, applied in one place), keep the existing count disclosure. Severity low-medium: invisible
  until a heavy user's shelf outgrows a screen, then degrades in proportion to success (the corpus's own
  scale note).

- **P2 — precision can round small money to a displayed zero (`number-and-cost-formatting` P2/P3).**
  The `usd()` magnitude-aware helper (`versions.ts:183`) is correct but not universal; `$${x.toFixed(2)}`
  concat sites can print `$0.00` for real sub-cent spend. **Fix:** route the 12 concat sites through
  one `usd()`-style formatter (already exists) and keep the unit un-welded from the number. Severity low
  today (the `unpriced` FLOOR already prevents "unknown → free", the worst case).

- **P3 — restored blob shape-cast, not membership-checked (`view-state-persistence` P5).**
  `parseStore` casts `as Persisted` (`jobs.tsx:170`) and validates only `measured`/running-status, not
  `kind`/`status`. **Fix:** filter each restored job through the current `JobKind`/`JobStatus` unions.
  Severity low (bounded local data).

- **P3 — no formal persistence version (`view-state-persistence` P9).** Key-name `.v1` + an ad-hoc
  legacy remap runs forever with no way to retire. **Fix:** a numeric `version` + a `migrate(old, v)`
  step. Severity low.

---

## 3. Enrichment (BRING-BACK lane)

Candidates this repo does that the corpus lacks or under-specifies. `in_corpus` checked against the
leaf set and `index.json` topic names.

1. **The "it's gone" dead-reference affordance, with a shared-machine non-disclosure clause.**
   *file:line (read):* `StudioView.tsx:31-61,86-113` — a URL-addressed `projectId` resolves to a
   four-state `Door` (`opening`/`open`/`absent`/`storage`); `absent` **deliberately merges "no such
   project" and "someone else's project on this browser"** so a shared laptop cannot confirm a
   stranger's work exists. *Physics:* any app addressing a record by id in the URL must handle the id
   resolving to nothing, and on a shared browser the *distinction* between not-found and
   not-yours is itself a disclosure. *in_corpus:* **partial** — `entity-picker` P4 states the affordance
   as **unmet across six codebases** ("Nobody… shows a 'that item no longer exists' affordance",
   `entity-picker.md:366`). Gravitone is the missing positive exemplar **plus** a new privacy sub-clause
   not anywhere in the corpus. *Lane:* frontend.

2. **Typed storage-outcome + a subscribable "trouble channel"; never-written vs failed-read kept
   distinct.** *file:line (read):* `stepStore.ts:54-120,203-246` — five `StorageFailure` kinds
   (`quota`/`blocked`/`unavailable`/`missing-store`/`failed`), a `ReadOutcome` that separates
   `ok:true,data:undefined` (never written) from `ok:false` (read failed), and fire-and-forget
   `saveStep` that still reports through one `useSyncExternalStore` channel. *Physics:* client
   persistence has failure kinds a surface must act on *differently* (quota → export, blocked → close
   tab), and `undefined` conflates two opposite facts. *in_corpus:* **partial** —
   `swallowed-error-telemetry` covers "two doors" and `client-state-persistence` covers quota, but the
   read-outcome distinction and the report-on-ignored-save are unstated. *Lane:* frontend / code-quality.

3. **Cross-tab serialization of expensive work via a synchronous read-before-claim on a shared
   localStorage record — no `BroadcastChannel`, no leader election.** *file:line (read):*
   `jobs.tsx:37-44,148-157,193-198` — two tabs cannot both start a minutes-long paid LLM call for one
   project because `start` reads the shared record synchronously before claiming a slot; a `running`
   job restored after the tab died is remapped to `interrupted` (the only thing actually known).
   *Physics:* any multi-tab web app with expensive serialized work reinvents this. *in_corpus:*
   **partial** — `client-state-persistence.md` mentions `BroadcastChannel`/cross-tab sync; the
   *serialize-a-paid-call-by-read-before-claim* and *reattach-as-interrupted* angles look novel.
   *Lane:* frontend / code-quality.

4. **"Every token has a reader" as a token entry-condition, with dead-token deletion.** *file:line
   (read):* `tokens.ts:80-92` and the `SIGNAL_DEFAULTS` note `:167-186` — a token is not added until a
   rule/component reads it, and is deleted when its last reader goes (three worked examples with
   rationale). *Physics:* a design token nothing consumes is latent drift; the discipline is the
   orphan-inventory direction applied to a design system. *in_corpus:* **partial** —
   `design-token-usage` P4 says "count distinct values = adoption" and `cross-artifact-drift-gate` has
   orphan inventory, but reader-gated token *entry + deletion* for a design system is not a stated
   clause. *Lane:* frontend.

5. **Redact-by-live-value backstop + "audit what a log line MAY carry before writing the first line" +
   never-log-free-form-detail.** *file:line (read):* `log.ts:17-40,50-74` — a written audit of safe
   vs scrubbed vs never-logged fields; `scrub()` blanks any **live secret VALUE** wherever it appears
   (not by guessing the field), and `ImagingError.detail` (raw vendor body / user prompt) is never
   logged. *Physics:* redaction *reach* + an exclusion *inventory*. *in_corpus:* **yes (exemplar)** —
   `secret-leak-scanning` clauses 5 & 6 state the principle; gravitone is a clean positive
   implementation, and *redact-by-value-as-a-backstop* is a concrete method worth capturing. *Lane:*
   code-quality / security.

6. **`unpriced` as a monotonic FLOOR distinct from zero — counted, propagated, rendered "at least $X".**
   *file:line (read):* `frames.ts:156-167`, `Playground.tsx:80,215-219`, `log.ts:114-115` — a missing
   cost figure is counted (`unpriced++`), never summed as 0, and while `unpriced > 0` the displayed
   total is a lower bound shown as "at least $X". *Physics:* a money accounting invariant beyond the
   three-state display principle — the aggregate stays *honest* (a floor) rather than merely *marked*.
   *in_corpus:* **partial** — `metric-tile` P1/P4 and `number-and-cost-formatting` P4 state the
   three-state principle; the floor-with-a-counter invariant for an *aggregate* is a concrete extension.
   *Lane:* frontend / data.

7. **A unit welded to a number INPUT for the screen reader (`aria-describedby`), not a decorative
   span.** *file:line (read):* `Field.tsx:62-93` — `NumberInput` appends the unit id to any caller's
   `aria-describedby` so "300" cannot be announced as a bare number. *Physics:* a bare number input is
   ambiguous to assistive tech exactly where the visual unit disambiguates it for everyone else.
   *in_corpus:* **likely no** — `number-and-cost-formatting` P3 is display-side re-ordering; this is
   input-side a11y. Small but genuine. *Lane:* frontend.

*Convergence confirmation (not a new path):* `gate-regression.mts:5-26` builds a gate whose **must-trip
fixture is the actual shipped defect** and whose must-pass fixture is its fix — an independent
reinvention of `adding-a-ci-gate`'s "break the thing first / prove it can fail". Records as fleet
evidence for that existing leaf, not a bring-back.

---

## 4. Methodics compliance

- **clauses_scored:** 70 (across 12 leaves; `translation-completeness` scored once at leaf level per the
  kit's absent-subject rule).
- **executed vs read:** every *count/absence* verdict was **executed** (git grep / git ls-files / ls,
  exit-code-verified): catch-site enumeration, empty-catch absence, Sentry absence, `Intl` absence,
  i18n absence, linter/CI/hook absence, secret-shape absence, env tracking, `toFixed` distribution,
  concat-trap count, virtualization-dep absence. Every *behavioral* verdict was **read** from cited
  source (12 files read in full or in the cited range: `log.ts`, `errors.ts`, `stepStore.ts`,
  `jobs.tsx`, `StudioView.tsx`, `Field.tsx`, `PresetSelect.tsx`, `AssetsBrowser.tsx`, `tokens.ts`,
  `globals.css`, `check-notebook.mts`, `gate-regression.mts`). Roughly 14 executed measurements, ~12
  source reads.
- **two-implementation counts + disagreements:** counts that mattered were run with `git grep` as
  primary; the second implementation was manual enumeration of the printed hit list (catch sites: 26
  `try/catch` + 11 `.catch`, agreed) or a cross-check across two regexes. **One disagreement, and it was
  a finding:** `toFixed(` total = **17** but the `toFixed([0-9])` distribution summed to **16** — the
  17th is the variable-precision `usd()` helper `versions.ts:183` (`toFixed(n>=1?2:…)`), which a
  digit-only regex cannot see. Reconciled; noted as evidence for `number-and-cost-formatting` P7.
- **self-corrections during the run:** (1) my first `awk` to extract `## Principle` sections mis-scoped
  and returned only one leaf; recovered by grepping heading text per file and reading exact line ranges
  — three of the universal-core leaves carry `## The one way` rather than `## Principle`, and I scored
  those. (2) The initial `i18n|locale` grep returned five files; I did **not** treat that as an i18n
  system — inspection showed every hit was `localeCompare`/a comment, so the leaf is honestly n/a rather
  than "present but incomplete". (3) The `toFixed` count discrepancy above.
- **instrument gaps reported, not fabricated:** `rg` CLI is absent (`command not found`); all ripgrep-
  style work went through `git grep` / the Grep tool. No live database was opened (none exists client-
  side beyond per-browser IndexedDB; nothing to copy). No secret value was printed — only shapes,
  locations, and counts.
- **read-only compliance:** the only file written is this report. No commits, no source edits, no build
  run, no mutating command.
