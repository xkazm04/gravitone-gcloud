---
name: uat
memory: none
category: Testing
description: Simulated User Acceptance Testing for Gravitone Studio, driven by Characters (representative users with jobs-to-be-done) rather than feature/code coverage. A capable LLM verifies each user journey in two chronological certification levels — L1 theoretical (over a code-derived surface model, cheap + mass-parallel) then L2 empirical (the live app driven in a real browser, serial) — judging through each Character's own consistent lens (time saved vs the manual way, and senior-in-role quality). Gravitone-specific: L1 reads context-map.json + the React source; L2 drives `next dev` in a browser, and because every surface renders MOCKED fixtures, L2 judges the interface, never model output. Per-run specifics live in the repo's uat/ overlay. Invoke with `/uat init|update|run|promote [args]`.
argument-hint: "[flow]"
---

# Simulated UAT — Character-driven acceptance (Gravitone Studio)

This is **evaluative** testing (is the product good enough for a real user to finish their job?), not
**verification** testing (does the code do what we told it to?). This repo has **no test suite at
all** yet, so there is nothing to double-count against — but that also means UAT must not be mistaken
for one. It answers "could a real creator run a production through this?", not "does the code work".

Gravitone Studio is a **content-production studio**: one production walked through five phases —
Script, Frames, Motion, Score, Cut — over a Library that knows every asset's lineage. So the
acceptance question is never "does phase X render" but "can *this kind of person* get *their*
production through, and would they trust it with real work?"

> ## THE ONE RULE THAT CHANGES EVERYTHING HERE: the product is mocked.
>
> Every surface reads fixtures from `app/_studio/`. Nothing calls a model, a backend or a service, and
> that is deliberate at this stage. Therefore:
>
> - **L2 judges the INTERFACE, never the output.** "Is the generated shot any good?" is not a question
>   this app can answer yet — there is no generation. A Character who complains the take is bad is
>   reviewing a fixture, and that finding is void.
> - **What IS testable, and is the whole point right now:** can the Character understand where they
>   are in the production, decide what to do next, see why something is blocked or refused, find an
>   asset again later, and trust what the screen claims? Those are interface questions, and they are
>   exactly what is cheap to fix now and expensive to fix after a backend lands.
> - **The senior-quality bar is re-pointed accordingly**: not "would a senior accept this output" but
>   "would a senior accept this as the instrument they run a production on".
> - Any finding whose evidence is the *content* of a fixture is a `fixture` finding at most (the mock
>   is unrealistic / self-contradicting), never a product defect. Say which it is.

Method backbone (established inspection methods, automated by an LLM): **Nielsen heuristic evaluation** + **cognitive walkthrough** (task-based, new-user POV, prescribed per-step questions) + **jobs-to-be-done** acceptance. See `uat/rubric.md` for the operational lens.

> Terminology: a **Character** is a durable, repo-committed *human* representative user with goals,
> context, expectations, pet peeves — and their own judgement profile. Do not confuse a Character
> (who uses the studio) with a *scene*, *take* or *cue* (what the studio makes).

> This is a **deliberate periodic pass, never a per-commit gate.** L2 is cheap here (a dev server and
> a browser, no model latency, no data dir) — the cost is the reading and the judgement, not the run.

> This skill binds this repo's real surfaces (`context-map.json`, the five phases + Library, the dev
> server) directly. The engine/overlay split is preserved for what varies per run — Characters,
> journeys, accepted gaps.

## Two-level certification (chronological)

Each journey is verified in two chronological passes; passing each grants a certification level. Cheap-and-broad first, expensive-and-deep second.

**Level 1 — Theoretical (static, code-grounded).** Build a *surface model* from the code: the routes/sections a user sees, the affordances (buttons / inputs / controls / links — their "positions"), the inputs each accepts, the state/data it reads, the navigation between surfaces, and — for AI surfaces — the prompt + grounding that shapes output quality. The Character then walks the journey *theoretically* over this model — a thought experiment: "given exactly these affordances and this flow, can I finish my job, and would it meet my bar?" **No live app.** Catches structural failure — missing features, dead-ends, affordance/flow gaps — and applies the Character's judgement to the *designed* experience. **Pass → Certification L1 ("structurally sound").** Cheap and **mass-parallelizable** (no app instance to serialize) — run it across many Characters at once. This is how a 15-Character roster stays affordable.

**Level 2 — Empirical (the live app).** Only for journeys that earned L1. Drive the *real* running app
in a browser (see *Driver & environment* below) and run the same walkthrough, now (a) confirming the
theoretical path actually holds and (b) catching what the code model can't: real rendering at real
viewport sizes, contrast and legibility against the near-black surface, focus order and keyboard
reachability, motion under `prefers-reduced-motion`, overflow with the fixtures' real string lengths,
and whether the *arrangement* of information actually lets the Character decide. **Pass →
Certification L2 ("confirmed live").** Serial (one dev server, one browser) but fast — there is no
model latency here, so an L2 journey is minutes, not an hour.

Why chronological: L1 is a cheap filter — a journey that fails L1 (a structural gap) never needs live-app time — and it lets you scale Characters massively in parallel, reserving the expensive serial L2 for journeys that already proved sound on paper. A finding L1 raised and L2 confirms is the strongest; one L2 raises that L1 missed flags a **gap in the surface model** worth recording.

**L1's structural blind spot is reachability.** It reads code surface-by-surface and implicitly
assumes every surface is reachable by *this* Character — so it can validate a fix on a surface the
Character can't actually open. Keep three verdicts distinct, never one: **fix *landed* ≠ fix
*reachable* ≠ fix *unblocks the job*.** L1 can honestly speak only to the first.

Concrete on this app: there is no auth, no tier and no feature flag, so reachability is purely
**navigational and data-driven** — a surface is unreachable if no click path leads to it (a drawer
with no trigger, a state no fixture produces) or if the fixture set never puts an item in that state.
A finding about the "blocked shot" panel is mis-attributed if no fixture shot is ever blocked; check
`app/_studio/*` before judging, and if the state is unreachable, THAT is the finding.

## Characters carry their own judgement (the consistency harness)

Two runs of the same Character must apply the same lens — judgement is **externalized into explicit, scored criteria in the Character file**, not re-improvised each run. Beyond JTBD / expectations / pet-peeves, every Character declares:

- **Motivation — why use the app at all (time-saved).** How long the job takes the *manual / current* way (their spreadsheet, their inbox, their VA, their n8n flow, doing it by hand), and the time the app should save. If the flow doesn't save meaningful time — or is *slower* (e.g. waiting 2 min for a build/run you could rough out faster yourself) — that **is a finding**: the Character wouldn't adopt it.
- **Senior-quality bar — the reliability floor.** The app's AI/automation output must be at least as good as this Character would produce *as a senior in their role*. A persona's generated prompt, a triaged email, a drafted reply, a synthesized team, a research summary, a built connector — output a senior would reject (generic, wrong, shallower than their own work) fails the bar even if it technically "worked".
- **Scored acceptance criteria** — a short list of explicit pass/fail checks derived from the above + their JTBD, applied **identically every run**. This is the harness: the same Character judges the same way across runs (and lets gates multi-sample meaningfully).

**Stated once, reused verbatim.** The time-saved baseline (the manual-way minutes) and the senior-quality bar live *only* in the Character file — every run **quotes them verbatim** into its report and judges against them; no run re-estimates, rounds, or "updates" them in-flight. That's what makes scores comparable run-over-run. If reality shows a baseline is wrong, change the Character file in a deliberate `/uat update` (note the change in the run report), never mid-run.

These two dimensions (**time-saved**, **senior-quality**) join the rubric's five (completion, effort, clarity, trust, missing-pieces).

## Portable engine vs. per-run overlay

**This skill is the engine.** Everything that varies per run — who the Characters are, which journeys, which fixtures, the accepted-gaps baseline — lives in the repo's **`uat/` overlay** (at the repo root, like ESLint engine vs `.eslintrc`). The skill names the app's stable surfaces directly (harness, sections, `context-map.json`); the overlay holds the variable cast.

```
uat/
  README.md            # what this is, how to run, the Character template
  characters/*.md      # durable users (JTBD, expectations, pet peeves, MOTIVATION, SENIOR-BAR, scored criteria, SURFACE-BINDING, language, background/voice)
  journeys/*.md        # goals (NOT scripts) + user-POV definition-of-done
  rubric.md            # evaluation lens (7 dimensions) + severity + finding types + cognitive-walkthrough questions
  env.md               # how to start the app + which FIXTURE STATES each journey needs to exist
  accepted-gaps.md     # baseline of known-and-accepted issues (won't re-surface)
  driver/drive.mjs     # thin L2 driver — Playwright: goto, click, snapshot text, screenshot
  runs/<date-slug>/    # journals, findings.json, report.md, SUMMARY.md (+ gitignored captures/)
  .gitignore           # ignores runs/*/captures/
```

> **The L2 driver is a browser, and this repo does not ship one.** Playwright is NOT a dependency
> here. The first `/uat init` either installs it as a devDependency (`npm i -D @playwright/test &&
> npx playwright install chromium` — a real change to `package.json`, so **ask the user first**) or
> records in `env.md` that L2 is unavailable. **If no driver exists, run L1 and say plainly that L2
> did not run.** A "verified live" claim with no browser behind it is fabricated evidence, and it is
> the single easiest lie for this skill to tell.

A finding is always:
`{ id, journey, character, cert_level, type, severity, dimension, title, expected, got, evidence[], code_check, verdict, suggested_acceptance }`
- `cert_level`: `L1` (theoretical/structural) | `L2` (empirical/live)
- `type`: `missing-feature | quality-gap | broken-flow | confusion | trust`
- `dimension`: `completion | effort | clarity | trust | missing | time-saved | senior-quality`
- `severity`: `blocker | major | minor | polish`
- `evidence[]`: for L1, `file:line` of the affordance/gap; for L2, a screenshot path, the captured DOM
  text, the URL/viewport, or `file:line`
- `code_check`: `confirmed-absent | present-but-missed | present-broken | by-design | n-a`
- `verdict`: `confirmed | refuted | uncertain` (adversarial pass)
- Optional: `resolution`, `scope_note`, `reachable` (L1: does a click path and a fixture state exist
  that put this Character in front of this surface?), `l2_priority` (for an L1 finding: what L2 must
  verify live — e.g. "does the shelf's caption column actually fit at 1280px"), `mock_bound`
  (**true when the finding is about fixture content rather than the product** — see the one rule above). A finding may also be a **strength** (positive) — those feed "What passed" + the synthesis.

---

## Mode: `init`

Goal: scaffold the `uat/` overlay grounded in **both** the codebase **and real-world references**.

1. **Map the app from `context-map.json`.** Read it at the repo root — 4 groups, 4 contexts, 28
   files, and small enough to read whole. It is **generated by the Personas app** (export-only; never
   hand-edit it, and note that `production-phases` covers all five phases in one context). This is
   the canonical surface inventory. The
   user-facing navigation is trivially small and worth writing down in `env.md` as it stands today:
   one route (`/`), two views (Project | Library), five phase tabs inside Project. **There are no
   `data-testid`s in this codebase** — the driver selects on visible text and roles, which is itself
   a finding waiting to happen (a11y names), so note where selection was hard.
2. **Confirm the run recipe → `env.md`.** L2 needs `npm run dev -p 3177` (never 3000 — the user or a
   sibling session may hold it) and a browser driver (see the callout above; ask before adding
   Playwright). Preflight: `curl -s http://localhost:3177 | head`. Record in `env.md` **which fixture
   states each journey depends on** — a blocked shot, a refused cue, an unpicked scene, a cut with
   gaps — because those states are the whole subject matter and a fixture edit can silently delete a
   journey's premise.
3. **Understand the target group, then research it (required — this is what keeps Characters real).**
   This studio serves people who *make things*: solo creators, small production teams, agencies, and
   the clients who approve their work. Derive the segments from the product itself (five phases, a
   lineage-carrying library, a production that can be partly blocked) — then `WebSearch`/`WebFetch`
   to ground each: how that role actually runs a production today (Premiere/Resolve + a spreadsheet,
   Frame.io for review, a shot list in Notion, a Discord thread of takes), what the real approval
   loop looks like, what a shot costs in time and money, **and how long the job takes the current
   way** (anchors time-saved). Record deciding references in `references:`. Offline → training data,
   mark it.
   > **Span the real spread.** Cross **maker ↔ approver**, **solo ↔ team**, and **craft-first ↔
   > deadline-first**. Always include at least one **client/approver** (they surface trust and
   > legibility gaps makers are blind to) and one **first-timer** (the phase model is a strong opinion
   > — someone has to meet it cold). An all-editor roster tests a fiction.
4. **Offer a Character count.** Ask how many Characters — **3** (smoke: a solo creator, a producer, a
   client), **8** (standard: the main craft roles + a client + a first-timer), **15** (thorough: the
   full span — see roster below). Default 8.
5. **Draft Characters** (`uat/characters/*.md`, template in `uat/README.md`): each a real role, with JTBD, `What good looks like`, pet peeves, **Motivation (time-saved)**, **Senior-quality bar**, **Scored acceptance criteria**, a **Surface binding** (which sidebar sections / tier / `dev`-or-not this Character actually uses — so findings are tested only on surfaces this Character can reach), a **Language** (e.g. `en`, `es`, `ja` — drives the i18n dimension at L2), and a **Background / lived experience** + **Voice** (their history, the tools they've been burned by, who they answer to, what's at stake, how they actually talk) — the texture that makes feedback authentic. All grounded in the research.
6. **Draft Journeys** (`uat/journeys/*.md`): goals with a user-POV definition-of-done, NOT step
   scripts. Anchor them on this product's real high-value flows: *know where the production stands
   and what is blocking it*; *pick the frame for a scene and know why the others lost*; *find out why
   a shot never rendered*; *understand what the cut is missing before showing a client*; *find an
   asset weeks later and prove where it came from*; *hand the project to someone else without
   explaining it*. Mark each `promotion: discovery`.
7. **Scaffold** `rubric.md`, `accepted-gaps.md`, `driver/drive.mjs`, `.gitignore` if missing.

Output: a short summary + open env questions. Do not run journeys in `init`.

## Mode: `update`

Diff-aware refresh (read `git diff` / recent commits, re-read `context-map.json`). For changed contexts: add/adjust journeys, refresh Character expectations + scored criteria, targeted re-research only for genuinely new capabilities. Never silently drop a journey — mark removed-surface journeys `retired`. Report what changed and why.

## Mode: `run`

Verify a `character × journey` selection through the two levels. Selection: all `promotion: discovery|candidate` journeys; those named in args; `--surface <name>` to scope to a phase or view (e.g. `--surface motion`, `--surface library`).
Flags: `--l1` (theoretical only — fast, cheap, mass-parallel), `--l2` (live only, assumes/forces past L1), `--acceptance` (re-run `promotion: acceptance` gates at L2). Default = L1 then L2 on survivors.

### Phase L1 — theoretical (mass-parallel across Characters)
**Dispatch subagents** (the `Explore` or `general-purpose` agent type, read-only) — each reads the code, builds the surface model, walks the journey in-character, and returns a structured per-Character L1 report; the orchestrator then synthesizes (below). **Agent-count scaling (cost control):** with ≤3 journeys in scope, one agent per `character × journey`; with more, **batch by Character** — one agent per Character walking all its journeys (the surface model is built once and reused, the dominant cost). Cap ~15 concurrent agents; a 15-Character sweep finishes in ~one agent's wall-clock, not 15×. Subagents **write nothing** — they return findings + voice as structured text; the orchestrator writes the artifacts. **Every L1 report must open with a `sources:` list — the actual files the surface model was derived from** (the phase components, the shared primitives, the fixtures they read). A verdict with no sources list is unusable: it can't be spot-checked and can't be diffed against the next run's model.
1. **Build the surface model** from the code — start at the context(s) in `context-map.json` the
   journey touches, then **follow the actual chain from each affordance to the data behind it**
   (button → handler → component state → the fixture in `app/_studio/*` that feeds it); don't guess
   the file. Capture affordances, inputs, state, navigation, and — the local equivalent of a
   "grounding audit" — **what the surface can and cannot say**. Cite `file:line`.
   - **Expressiveness audit — L1's sweet spot for THIS product:** for every state the fixture types
     admit (`app/_studio/types.ts`), can the surface actually render it? A `refused` cue, a `blocked`
     shot, a scene with zero picks, a cut with four gaps, an asset with no caption. A type that
     admits a state no component draws is a hole the user falls into the moment real data arrives —
     and it is fully visible in code. This is the highest-yield L1 check in this repo.
   - **Reachability check (resolve BEFORE judging):** compute the Character's *actually reachable
     surface set* — follow the click path from `/` and check the fixtures for an item in the state
     the surface needs. There is no auth or tier here, so unreachable means "no path" or "no fixture
     ever in that state". Tag `reachable: false` rather than judging the surface, and consider
     whether the unreachability IS the finding.
2. **Walk the journey in-character over the model** — cognitive-walkthrough questions from the rubric,
   plus the Character's own scored criteria (time-saved and the re-pointed senior bar: "would I run a
   production on this instrument?"). No live app.
3. **Emit L1 findings** (`cert_level: L1`, each that needs live confirmation tagged `l2_priority`) + a per-journey verdict — **three states**: `L1-pass` (structurally sound, no majors → clean to L2), `L1-conditional` (completes structurally but has major findings — still L2-eligible, majors carry forward), or `L1-fail` (a structural gap blocks the job — no live app needed to know it's broken; fix before L2).

### Phase L2 — empirical (serial, live)
Only for `L1-pass`/`L1-conditional` journeys (or `--l2`). **Start from the L1 handoff — don't re-walk
blindly:** pull the L1 report's `l2_priority` items + any `L1-conditional` majors. Those are the
targeted questions L2 exists to answer — which here means **rendering, legibility, reachability and
arrangement**, not output quality (see the one rule at the top).
1. **Reach the start state** per `env.md`: `npm run dev -p 3177`, open `/`, confirm the fixture states
   the journey depends on are actually present.
2. **Roam in-character** in the browser — perceive via the DOM text, the screenshot and the tab title;
   act via clicks and the keyboard. Stay in the Character's head. No script — **getting lost is a
   finding, and with one route and five tabs, getting lost is a serious one**. Keep a first-person
   **journal**.
3. **Drive the real conditions, not just the default one.** At minimum, every L2 journey checks: a
   narrow viewport (1280 and 768), keyboard-only traversal of the phase rail and the library,
   `prefers-reduced-motion: reduce` (the whole design language is motion-aware — `globals.css`
   disables animation under it, so this is a supported mode, not an edge case), and the longest
   strings the fixtures actually contain.
4. **Code cross-check** every "missing/broken" claim before recording (`confirmed-absent |
   present-but-missed → confusion | present-broken | by-design`). Add the local fifth verdict:
   **`mock-bound`** — the behaviour is a property of the fixture, not the product.
5. **Emit L2 findings** (`cert_level: L2`). Note any that L1 missed (→ surface-model gap).
6. **Journey failed ≠ driver failed — never conflate them.** A dev-server crash, a port collision, a
   Playwright timeout on a cold first compile (Turbopack's first paint of a route is slow) is not a
   product finding. Retry once; if it still can't be measured, record **`UNMEASURED (harness)`** with
   the symptom. It never counts as a product failure.
7. **Adversarial verify** each kept finding (refuter pass; default `refuted`/`uncertain` unless the
   evidence holds; "is this the product, the fixture, or my driver?"). Only `confirmed` reach the
   headline.

### Output of a run
- `runs/<id>/findings.json` (schema above), `runs/<id>/report.md` (scorecard: per-journey **cert level reached** + status — `pass | conditional | fail | UNMEASURED (harness)` — confirmed findings by severity/dimension with evidence + suggested acceptance, an appendix of refuted/uncertain, and a **"What passed"** list). Multi-journey → `SUMMARY.md`.
- **Character feedback** (in each `runs/<id>/<character>--<journey>.md`): a candid **first-person review in the Character's voice** — *would I run a real production on this? · what delighted or frustrated me · does it fit how I actually work · can I tell at a glance what is done, blocked and waiting · would I show this screen to a client · what's missing for MY job · would I tell a peer?* Produced at **both** levels (L1 over the *designed* experience, L2 over the *live* one), grounded in the Character's Background/Voice. Findings are the actionable layer; this is the **felt verdict** — and across 15 Characters the voices form a **user panel** that surfaces dimensions (craft-identity, patience-economics, adoption conditions, trust, "is this really for me?") a finding table can't.
- **Synthesis (multi-Character runs — don't skip):** the systemic insight usually lives *across*
  Characters. **Dispatch a final synthesis subagent** that reads all per-Character reports and writes
  `SUMMARY.md`: cross-cutting themes (deduped), a **prioritized backlog** (P0 core-promise / P1
  trust-legibility / P2 polish), the **strengths worth protecting** (as decision-useful as gaps —
  they say what NOT to touch), and a **panel verdict**. For this studio, explicitly call out **which
  phase loses people** (e.g. "Script and Frames land; Motion loses everyone at the blocked shot,
  because nothing says what unblocks it") — the phase model is the product's central bet, and where
  it leaks is the finding that matters most.
- **Feed the loop.** A P0/P1 theme that needs product work, not a patch, belongs in
  `.vault/Perfect/directions/<slug>.md` with `status: proposed` — but only with the user's explicit
  acceptance, exactly as `/research` files directions. `/uat` finds; `/perfect` decides and builds.
- Chat reply: scorecard headline (who reached L1 vs L2, top blockers/majors) + the sharpest Character voices, linking `file:line`/evidence.

### Trust rules
- **Grounding:** no finding without evidence (L1 → `file:line`; L2 → a screenshot path, the captured DOM text with the viewport it was taken at, or `file:line`).
- **Per-character consistency:** judge against the Character's *scored criteria*, identically each run. For gates, multi-sample severity across 2–3 runs and take the majority (model output varies).
- **Scope honesty:** deliberately-not-built → `scope_note`/out-of-scope, not a defect. In this repo
  that category is large and load-bearing: **anything requiring a backend, a model, persistence,
  auth, upload or export is out of scope by design.** "I couldn't actually render the shot" is not a
  finding; "I couldn't tell that the shot would never render" is.
- **Mock honesty (the local trap):** never "fix" a finding by making a fixture flatter — deleting the
  blocked shot to make the phase look clean destroys the only evidence the interface can be tested
  against. Fixtures may grow richer; they may not grow happier.
- **Baseline:** `accepted-gaps.md` suppresses known/accepted issues; append when the user accepts one.
- **No suite to double-count.** This repo has no tests, so nothing is already covered — but that also
  means a UAT finding is the ONLY signal for that behaviour. Write the evidence as if the reader has
  no other way to reproduce it, because they don't.

## Mode: `promote`

Turn a clean journey into a low-variance **acceptance** gate. Take a journey that reached **L2-pass** on a stable path: freeze its happy path + the acceptance criteria it satisfied into the journey file, set `promotion: acceptance`, note the fixture/env + known-accepted frictions. `/uat run --acceptance` re-runs every acceptance journey (L2) against its frozen path → pass/fail vs recorded acceptance. Slow — run deliberately, not on every push.

---

## Driver & environment (L2 — the gravitone-specific how-to)

**This is a web app: L2 drives a real browser against `next dev`.** All per-run values (which fixture
states, which viewports) live in `uat/env.md`; the mechanics below are stable.

- **Start the app:** `npm run dev -p 3177` (background). **Never port 3000** — the user or a sibling
  session may hold it, and adopting someone else's server is how a run "verifies" code that isn't
  yours. Preflight: `curl -s http://localhost:3177 | grep -o "<title>[^<]*"`.
- **Kill only what you started.** Record the PID at start and kill that PID at the end. Never
  `taskkill` by name or by port you didn't open.
- **Drive with Playwright** (see the install callout above; ask before adding it):
  ```js
  import { chromium } from '@playwright/test';
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3177/');
  await page.getByRole('button', { name: 'Motion' }).click();
  const text = await page.locator('main').innerText();          // perceive
  await page.screenshot({ path: 'uat/runs/<id>/captures/motion.png' });
  ```
  **There are no `data-testid`s in this codebase** — select by role and visible text. Where you can't
  (an icon-only control, a div that behaves like a button), that is an accessibility finding: record
  it, then fall back to a CSS selector and say you did.
- **The conditions that matter here** — run each journey through them rather than treating them as
  extras:
  ```js
  await page.emulateMedia({ reducedMotion: 'reduce' });   // supported mode, not an edge case
  await page.setViewportSize({ width: 768, height: 1024 });
  ```
  plus keyboard traversal (`page.keyboard.press('Tab')` in a loop, recording the focus order and
  whether the ring is visible against `--gt-ink`).
- **Verify side-effects in the DOM and in the fixture, not just the screenshot.** Every number on
  screen traces to `app/_studio/*`; when a value looks wrong, diff the rendered text against the
  fixture before recording a finding — that check is what separates a product defect from a mock
  artifact, and it is one grep.
- **Fixture readiness (preflight before driving):** `env.md` enumerates the states each journey needs
  (a blocked shot, a refused cue, an unpicked scene, a cut with gaps, an uncaptioned asset). A
  journey whose state is absent from the fixtures is **untestable, not passing** — and the absence is
  itself worth reporting to whoever last edited the fixtures.

### Hard constraints & gotchas (this app specifically)
- **The product is mocked** — re-read the callout at the top before writing a single finding. It voids
  a whole class of them.
- **Never adopt a server you didn't start.** A `:3000` (or any) dev server may be the parent project
  `arm/gravitone/web`, which serves a *different app* with the same design language — its landing page
  will happily render and a careless run will "verify" the wrong product. Assert the page title and a
  string unique to this app (e.g. the project's name from `app/_studio/scenes.ts`) before trusting the
  connection.
- **Turbopack's first compile of a route is slow** — the first `goto` can take many seconds. Budget for
  it once per server, then expect fast navigation; a timeout on the *first* load is a driver artifact,
  a timeout on the *fifth* is a finding.
- **Don't block on `networkidle`** — the dev HMR socket never idles. Wait on a visible element or a
  text string instead.
- **`MSYS_NO_PATHCONV=1`** when passing leading-slash paths through Git Bash. PowerShell is the primary
  shell here.
- **There is no persistence.** Every reload is a fresh state — which makes L2 wonderfully repeatable,
  and means any journey premised on "come back tomorrow and find it" is currently untestable. Say so
  rather than simulating it.

## Concurrency & parallel-safety (MANDATORY)
- **L1 is mass-parallel** — no app instance to serialize, so run many `character × journey` theoretical passes at once. This is how the 15-Character thorough roster stays cheap.
- **L2 is serial with long runs** — accept it: one live app, queue journeys.
- **Active-runs ledger (Phase 0 / Phase 11):** at run start, read `.vault/active-runs.md` (create if
  absent); if any `## Active` entry overlaps your scope — especially another session running a dev
  server — surface it before proceeding, then append your own entry naming **the port you took**. At
  end, move it to `## Recently completed`. Edit append-only; don't stage it.
- **L2 is serial but cheap.** One dev server, one browser, no model latency. Queue journeys; a full
  roster is minutes.
- **Worktree for multi-file work.** `/uat init` (writes the whole overlay) and any multi-journey `run`
  are multi-file — use a `git worktree` (junction its `node_modules` to the main checkout's on
  Windows and assert `.bin/tsc` resolves before relying on it), never `git stash`, stage path-scoped
  (`git add uat/...`, never `git add -A`), commit atomically.
- **Artifact hygiene:** gitignore `uat/runs/*/captures/`; commit reports path-scoped in a quiet window.

## Suggested 15-Character roster (people who make things, and the people they answer to)

A starting span for the **thorough (15)** tier — adjust to what the product actually serves. The point
is breadth across maker↔approver, solo↔team, craft-first↔deadline-first, and first-timer↔veteran. Each
binds only to the surfaces *they* would reach.

| # | Character | Segment | Job-to-be-done (example) | Reaches |
|---|---|---|---|---|
| 1 | Solo creator / YouTuber | Maker, non-team | Get a 90-second piece from idea to cut without losing track of what's done | All five phases, Library |
| 2 | Producer / project lead | Coordinator | Know at a glance what is blocked, what is waiting, what is approved | Home rail, all phases, Library |
| 3 | Editor | Craft, deadline-first | Assemble the cut and see exactly what is still missing | Cut, Frames, Library |
| 4 | Director / creative lead | Craft, approver | Judge takes against the intent, reject with a reason that survives | Script, Frames, Motion |
| 5 | Screenwriter | Craft, upstream | Keep the script's open questions visible after handoff | Script |
| 6 | Motion / VFX artist | Craft, technical | Find why a shot is blocked and what would unblock it | Motion, Library |
| 7 | Composer / sound designer | Craft, downstream | Spot cues against a cut that keeps moving under them | Score, Cut |
| 8 | Agency account manager | Buyer-facing | Show a client honest progress without over-promising | Home rail, Cut, Library |
| 9 | The client / approver | External, non-technical | Understand what I'm approving and what it will cost to change | Cut, Frames |
| 10 | First-timer creator | Novice | Meet the five-phase model cold and not bounce off it | Home rail, Script |
| 11 | Archivist / asset manager | Librarian | Find a shot from six weeks ago and prove where it came from | Library |
| 12 | Freelancer joining mid-project | Handover | Pick up someone else's production without a call | All phases, Library |
| 13 | Budget owner | Financial | Understand what has been spent and what a re-run costs | Motion, Score, Library |
| 14 | Accessibility user | A11y | Keyboard-only / screen-reader through a core flow | Home rail, all phases |
| 15 | Skeptical veteran editor | Power user, hostile | Push the model until it breaks; would rather use their NLE | All phases, Library |

> **The client and the first-timer are not optional.** They are the two Characters who cannot be
> reasoned into the product's mental model, and this product IS a mental model. If both pass, the
> phase rail is doing its job.

## Using / re-running this skill
1. `/uat init` → reads `context-map.json`, confirms the run recipe, **asks before adding Playwright**,
researches the target group, **asks how many Characters (3/8/15)**, scaffolds `uat/`. 2. Resolve the
open questions in `env.md` (which fixture states each journey needs). 3. `/uat run --l1` → cheap broad
theoretical sweep across the whole roster (no browser). 4. `npm run dev -p 3177`, then `/uat run` for
full L1→L2 on survivors. 5. Fix, file the systemic themes as `/perfect` directions, and `/uat promote`
clean journeys into acceptance gates.
