---
name: perfect
contexts: tracked
memory: vault
category: Development
description: Session-after-session product perfection loop for Gravitone Studio. The strongest available model at xhigh reasoning (currently Fable 5) directs — it walks the repo's context map context-by-context, proposes 5 challenged, high-value directions per context (features, design elevations, significant optimizations), gates them with the user until 10 are accepted, then orchestrates Opus-class builder subagents on ONE shared branch — grouped so their write sets cannot collide — while making every review/merge decision itself. All state lives in the repo's `.vault/` (Obsidian-openable) so any future session resumes the loop exactly where the last one stopped. Invoke with `/perfect [init|propose|build|status|reflect] [context-name]`.
argument-hint: "[init|propose|build|status|reflect] [context]"
version: 1.0
---

# Perfect — the direction-and-delivery loop

> One model configuration is best at *judgment* — seeing what would make a product excellent, challenging its own ideas, reviewing diffs ruthlessly. A well-scoped builder is great at *execution* inside a tight brief. `/perfect` wires the two together in a permanent loop: **the strongest model at xhigh directs, Opus-class builders build, the vault remembers.** Each session moves the product measurably closer to the best UX, architecture, and feature quality it can have; no session ever starts from zero.

## The product

**Gravitone Studio (`gravitone-gcloud`)** — a content-creation studio, prototyped UI-first:

- **Stack**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4. No backend, no
  database, no third-party service. `app/_studio/*` holds the mocked fixtures every surface reads.
- **The product**: one production walked through five steps (Research · Script · Frames · Score · Cut)
  over a Library that knows every asset's lineage. `lib/projects.ts`'s `PHASES` is the ONE source of
  that order; `app/studio/[projectId]/` is the composition root. **Motion was retired as a step on
  2026-08-14** — Frames owns the still and the clip made from it, because they are one art-direction
  decision against one source frame. A direction proposing "the motion step" is proposing a regression;
  a direction deepening Frames' clip half is exactly in season.
- **The design language** came intact from `gravitone/web` (DESIGN.md there is the long form):
  `components/ui/tokens.ts` is the single source of truth and the ONLY file allowed a colour literal;
  `globals.css` consumes the `--gt-*` vars it publishes. A direction that hard-codes a colour is
  wrong however good it looks.
- **The craft knowledge** lives in `knowledge/` — per project template, per production step, with
  evidence labels and sample sizes (`knowledge/README.md`). A direction that touches a step's surface
  MUST be scouted against that step's `PATTERNS.md` and `params.json`; the craft rules are what keep
  a direction from being a nice-looking guess. Where a step has no entry yet, "commission the craft
  research for step X" is itself a legitimate direction — an ungrounded step is the deeper problem.
- **The stage this repo is in**: UI prototyping *before* any backend. Directions that deepen the
  flow, the fixtures' honesty, or the design are in season; directions that assume a live model,
  an API or auth are premature — propose them as the seam to design against, not as work to do.

## Roles — Director and Builders

- **Director (the main session — the strongest available model at xhigh reasoning; currently Fable 5, Opus 5 acceptable fallback).** Owns everything that is judgment: opportunity-scoring contexts, drafting directions, adversarially challenging them before the user ever sees them, running the acceptance gate, writing builder briefs, answering builders' product questions mid-flight, reviewing every diff, deciding merge/redo/drop, running the repo gates, committing, and writing the vault. The Director **never delegates a decision** to a builder and never rubber-stamps a builder's diff.
- **Builders (Opus-class subagents, `model: "opus"`, one per *lot* — see Phase B step 1).** Each receives a tight brief (direction specs + acceptance criteria + an explicit **write set** + repo-convention digest) and implements **in the wave's single shared tree**, alongside its siblings. Isolation is not what keeps them from colliding — disjoint grouping is. Builders return a structured report; when they hit a genuine product ambiguity they **return the question instead of guessing** — the Director answers via `SendMessage` and the builder continues.
- **Scouts (Explore subagents, cheap).** Produce the per-context current-state brief the Director synthesizes directions from. Never used for judgment.

## The Obsidian vault — durable loop state

Resolve the vault root (first hit wins), then use `$VAULT/Perfect/`:

```bash
VAULT="C:/Users/mkdol/dolla/gravitone-gcloud/.vault"   # in-repo, Obsidian-openable; contains Perfect/
# Shared with the other adopted skills: Lessons/ and Patterns/ are cross-skill, everything
# under Perfect/ is this loop's alone. Create the tree on init; it is gitignored.
```

```
Perfect/
  Perfect.md               # HOME / Map-of-Content — always reflects current truth:
                           #   mission, the scored context QUEUE with the CURSOR,
                           #   the ACCEPTED POOL (n/10), shipped ledger headline, link to last session
  config.md                # per-repo overlay: gates to run, wave shape, wave size,
                           #   direction sizing rules, cooldown, + ## Skill improvement log
  contexts/<name>.md       # one per context-map context (long-lived, updated in place)
  directions/<slug>.md     # one per direction (long-lived; the atom of the whole loop)
  sessions/<YYYY-MM-DD[-n]>.md  # immutable run records, each ends with a `next:` pointer
```

**Context note** (`contexts/<name>.md`):
```markdown
---
name: <context-map name>        type: perfect/context
group: <group>                  category: ui|api|lib|data|config
opportunity: <0-10>             # value reach × headroom × strategic fit (Director's judgment)
last_proposed: <YYYY-MM-DD|never>   cooldown_until: <date|—>
directions: ["[[<slug>]]", …]
---
## Current state   (scout brief digest + file:line evidence — refreshed each proposal pass)
## Direction history   (proposed / accepted / REJECTED-and-why — rejections are memory too)
## Shipped   (direction → commit SHA → observed effect)
```

**Direction note** (`directions/<slug>.md`):
```markdown
---
slug: <kebab, stable>           type: perfect/direction
context: "[[<context-name>]]"   lens: feature|ux|optimization|robustness|wildcard
status: proposed | accepted | building | shipped | failed | dropped | rejected
size: S|M|L                     # must fit ONE builder session (≲15 files, no cross-context schema break)
proposed: <date>  accepted: <date|—>  shipped: <date|—>  commit: <sha|—>
---
## What & why   (the user value, one paragraph, no fluff)
## Evidence   (file:line of the gap/opportunity in today's code)
## Acceptance criteria   (3-6 checkable bullets — the builder's contract AND the review checklist)
## Risks / non-goals
## Build record   (builder report digest, review verdict, gate results — filled during build)
```

**Session note**: phases run, contexts covered, accept/reject tallies, build outcomes with SHAs, deltas, and **`next: <the exact resumption instruction for the following session>`**.

Vault hygiene: slugs are stable; **update notes, never duplicate**. Subagents may fail to write files in some harnesses — after any parallel phase the Director MUST `ls` the target dir and **backfill missing notes from the agents' returned content** before trusting "written".

**The vault is NOT version-controlled and Obsidian's file-recovery never sees agent writes** (it only snapshots edits made in the app). A clobbered note is gone. Therefore, every write obeys these three rules — learned 2026-07-29, when this session destroyed a sibling session's note:

1. **Never `open(path,'w')` a session note.** `sessions/<date>.md` is NOT unique — two `/perfect` sessions on one day collide. Check existence first and take the next free `-2`, `-3` suffix. Same for any note you did not create this session.
2. **Re-read `Perfect.md` immediately before writing it, never patch the Phase-0 copy from memory.** A sibling session that wraps mid-run rewrites the cursor, `pool`, `shipped_total`, and `last_session` — a regex written against the Phase-0 text silently no-ops against the new text while your other replacements land, producing a self-contradicting header (this is exactly how the 2026-07-29 damage went unnoticed for several minutes).
3. **An operator's "that session is finished" means it finished — including its wrap.** It does NOT mean the vault still matches what you read before it wrapped. Re-read; do not assume.

When you do clobber something: say so immediately, stop, attempt recovery from the surviving derived sources (`Perfect.md`'s cursor, `directions/*` frontmatter, `git log`, the active-runs ledger), and leave the reconstruction **labelled as a reconstruction** with what is lost stated explicitly. Never quietly write over the gap.

## The loop — a vault-driven state machine

Every invocation starts the same way; the vault decides which phase runs.

### Phase 0 — Recall & register
1. Read `Perfect.md` (+ last session's `next:` pointer). If missing → run **init** (below).
2. Read `context-map.json`; diff against `contexts/*` — new contexts get notes + a queue slot, removed ones get archived (`status: retired` in frontmatter).
   `context-map.json` at the repo root is **generated and owned by the Personas app**
   (project `gravitone`, id `91d8170c-…`): its scan writes the contexts into Personas' own SQLite DB and
   then EXPORTS this file, plus the managed `<!-- personas:context-map -->` block in `CLAUDE.md`. It is
   **export-only — there is no import path.** Three consequences that are not optional:
   
   - **Never hand-edit `context-map.json`.** The next scan overwrites it from the DB, silently. To change
     the taxonomy, change it in the app (Dev Tools → Context Ledger) and rescan, or ask the user to.
   - **Its shape is the Personas schema**, not Vibeman's: `version: 2`, `generator:
     "personas-context-scan"`, a flat `groups[]` and a flat `contexts[]` whose entries carry
     `file_paths` (snake_case), `group`, `category`, `description`, `keywords`, `entry_points`,
     `cross_refs`, `tech_stack`, `pinned`, `last_written_at`, plus top-level `taxonomy`, `provenance`
     and `use_cases`.
   - **Today it holds 4 groups / 4 contexts / 28 files**: `production-phases` (Production Lifecycle),
     `asset-library` (Asset Management), `studio-design-system` (Design System), `app-infrastructure`
     (Application Infrastructure). Personas' scan enforces a 10–30-files-per-context band, so contexts
     here are broad on purpose. Five files are unmapped by design or omission (`README.md`, `AGENTS.md`,
     `CLAUDE.md`, `package.json`, `tsconfig.json`) — note it, don't patch it.

   When the map has drifted from the tree, that is a **rescan request to the user**, not a repair
   you perform. Say which contexts drifted and by which files, and carry on with the map you have.
3. Repo rituals: read `.vault/active-runs.md` (create it if absent), surface overlaps with any sibling session, append this session's entry. Read `README.md` and the auto-memory `MEMORY.md` for signals that veto directions (e.g. "backend deliberately deferred — don't propose one").
4. Announce the resumption point in one sentence, then go where the state machine points: pool < 10 → **Propose**; pool ≥ 10 (or user said `build`) → **Build**.

### Init (first run only)
1. Scaffold the vault tree + `config.md` (record: gates = `npx tsc --noEmit` and `npm run build`
   — the build runs TypeScript too, so a green build is the real gate; wave size = 3; cooldown = 2
   rounds). **There is no test suite in this repo yet.** That is a fact to state at every gate, not
   a hole to paper over: "gates green" here means types + build, and any direction claiming runtime
   behaviour must be verified by driving the dev server. Standing up the first suite is itself a
   legitimate direction for the Platform context.
2. Score every context 0-10 for **opportunity** = user-facing reach × headroom (distance from "perfect", judged from context-map metadata, `docs/features/*`, and memory) × strategic fit (active arcs in memory). Write the ranked **queue** into `Perfect.md` with the cursor at the top. Don't deep-read code yet — scoring is refined per-context at proposal time.
3. Write session note; proceed straight into Propose.

### Phase P — Propose (context by context, until the pool holds 10)
Loop while `pool < 10` and the user hasn't said stop:

1. **Cursor** = highest-opportunity context not on cooldown. **Prefetch**: before presenting context *k*, launch the scout for context *k+1* in the background.
2. **Scout** (Explore, "very thorough", read-only): given the context's `file_paths`, `entry_points`, `db_tables` → return a current-state brief: what exists, what's rough, dead ends, UX seams, perf smells, with `file:line` evidence. **A component only "exists" if it RENDERS — trace every surface the brief describes to an actual mount point** (round 3's smoke pass caught a strip that scout + two builders treated as live while it had zero consumers).
3. **Draft 5 directions** — one per lens by default: **feature** (new user value), **ux** (design/flow elevation), **optimization** (perf/cost/significant simplification), **robustness** (failure modes, observability, architecture), **wildcard** (the non-obvious idea a great PM would pitch). Each sized to ONE builder session; a bigger vision ships as its phase-1 slice.
   **Weight the slate by `config.md → ## User taste`** — the lens spread is a starting point, not a quota. **Learned taste through round 8: the user accepts outcome-value work** (features/optimizations with a visible user payoff) **and rejects cosmetic churn** (e.g. dark-mode remount tweaks). Pre-filter the 5 through that lens and say in the presentation that you did. Default depth is the *engine*, not the chrome: for any context with backend/algorithmic substance, most directions should be architecture-level (data model, algorithms, lifecycle, prompt/recall paths, cost structure); UI surfacing appears at most once-twice unless the user steers otherwise. Scout prompts must match this depth (trace the full pipeline, not just the components).
4. **Challenge before presenting** (the Director argues against itself; a direction that fails any check is replaced, not presented):
   - Does it already exist in code? (scout evidence, not assumption)
   - Was it already proposed/rejected/shipped? (check `contexts/<name>.md` history + memory)
   - Does it conflict with an active arc or a "removed, don't re-suggest" memory?
   - Is the value claim concrete — can I name the user moment it improves?
   - Can one builder session genuinely ship it behind the acceptance criteria?

   **Director self-check before the gate** — a proposal that fails any of these never reaches the user:
   - Names the concrete files it will touch (from scout evidence, not guessed).
   - Names the user-visible outcome in one sentence a non-developer would care about.
   - States why it beats the next-best alternative direction for this context.
   - Survives the taste filter above (outcome-value, not cosmetic churn).
5. **Present** the 5 in chat — numbered, each: title · lens · size · one-paragraph why · evidence · acceptance criteria. Then gate with **AskUserQuestion (multiSelect)** — the tool caps options at 4 per question, so use TWO questions in one call: Q1 = directions 1–3, Q2 = directions 4–5 (labels = `N · short title`, description = one-line value claim + size). The user can annotate via "Other" (e.g. `edit 2: …`, `stop`); selecting nothing in both = none accepted.
6. Record outcomes in the vault (rejected ones too, with the user's implied reason — rejections steer future proposals). Accepted → `directions/<slug>.md` with `status: accepted`, pool counter++, context gets `cooldown_until`. Update `Perfect.md` after every context, not at session end — a killed session must lose nothing.
7. **A `none` gate that carries a steer** (the user says what they wanted instead) is a re-scout order, not a rejection of the context: promote the steer to `config.md → ## User taste` if it generalizes, re-scout at the steered depth/angle, and re-propose the SAME context once before advancing the cursor. Never re-present any rejected direction.

### Phase B — Build (ONE branch, disjoint builders, the Director decides everything)

> **Process efficiency is the first constraint, ahead of defensive isolation.** Rounds 1–4 gave each
> builder its own worktree and its own branch, and the bill came due in round 4: 3 worktree setups +
> 3 junctions, single compiles of **24m05s and 28m29s** because three *different source paths*
> thrashed one shared build cache, a stale artifact that let the typecheck pass while the tests
> failed, siblings clobbering the shared test binary twice, N cherry-picks with
> union-merge hazards that turned main red for two picks, a whole extra cross-builder integration
> phase, and junction-ordered teardown. Every bit of that bought protection against **a collision
> that correct grouping prevents for free**.
>
> **The rule: isolation is not the answer to collision risk — disjoint grouping is. A wave with a
> high collision risk is a wave that is grouped wrong.** Fix the grouping; don't build machinery
> around the mistake.

1. **Partition by write set — the load-bearing step; get this right and the rest is bookkeeping.**
   For each accepted direction derive its **write set**: the files it will actually modify, taken
   from the direction's `## Evidence` (`file:line`) plus a Director read of the call path. *A guessed
   write set is worthless* — if you cannot name the files, the direction is not ready to build, and
   that is the same reachability discipline Phase P step 4 demands.
   Group directions into builder **lots** so write sets are **pairwise disjoint**:
   - Two directions overlap → they go in the **SAME lot** (one builder, sequentially) or one is
     **deferred** to the next wave. Never split an overlap across concurrent builders.
   - No disjoint partition exists → **the wave is one builder.** That is a legitimate, honest
     outcome, not a failure of the plan.
   - ≤ `config.wave_size` lots concurrent; ≤ 3 directions per lot (a 4-direction brief exceeded one
     agent-session budget in round 1).
   - **Rust-touching lots: ≤ 2 concurrent** — round 4 measured why.
   - Lots need not follow context boundaries. Disjointness is the criterion; one context can be two
     lots, and two small contexts can share one.
   Class C files (step 3) are excluded from write-set analysis — nobody but the Director touches
   them, so they cannot create overlap.
   Present the wave plan in one screen — **lot ↔ directions ↔ write set** — and say explicitly which
   directions were merged or deferred to reach disjointness. On user go (or `/perfect build`), execute.

2. **One branch for the whole wave.** No per-builder worktree, no per-builder branch, no per-direction
   merge.
   ```bash
   git switch -c perfect/<YYYY-MM-DD>      # from a clean main
   ```
   Every builder works in this one tree and commits onto this one branch. One source tree means
   one warm Turbopack/`.next` cache and coherent incremental rebuilds — the single largest cost the
   old shape imposed — and it means the wave is **continuously integrated** rather than integrated at the end.
   **Where the tree lives:** the main checkout by default. If `.vault/active-runs.md` shows another
   session live in the main checkout, put the wave in **ONE** worktree (never one per builder) —
   same branch, same protocol — and apply the junction recipe once:
   ```powershell
   $root = "<abs repo root>"; $link = "$root\.claude\worktrees\perfect-wave\node_modules"
   if (Test-Path $link) { Remove-Item $link -Force -Recurse -Confirm:$false }
   New-Item -ItemType Junction -Path $link -Target "$root\node_modules" | Out-Null
   Test-Path "$link\.bin\tsc"    # MUST print True before you brief anyone
   ```
   **Do NOT use `cmd //c mklink //J … "..\..\..\node_modules"`.** `mklink` resolves a RELATIVE target
   against the **current** directory, not the link's — from the repo root it silently creates
   `C:\Users\node_modules` and still prints "Junction created", and the failure only surfaces as a
   builder that cannot find `tsc`. **"Junction created" is not evidence — the `Test-Path …\.bin\tsc`
   assertion is.** Teardown at wrap: `cmd //c rmdir` the junction **FIRST**, then `git worktree remove`.

3. **The shared-resource protocol.** One tree means shared mutable state; each piece gets exactly one
   owner, and this whole block goes verbatim into every brief.
   - **Class A — your own write set.** Yours alone; edit freely.
   - **Class B — append-only registries** (`components/ui/StudioFrame.tsx`'s `MODULES` list, the
     `PHASES` array in `app/page.tsx`, `README.md`). Editing allowed, but
     **re-read the file immediately before each edit and anchor on a string unique to your change**
     — never rewrite one whole.
   - **Class C — Director-only.** `components/ui/tokens.ts` and `app/globals.css` (the design
     language: one owner, or two builders silently redefine the same accent), `package.json` /
     lockfile, and **the git index**. Builders *report* what they need — a new token by name and
     intended value, a new dependency and why — and the Director applies it once at quiescence.
   - **Commits — builders still commit their own work** (never-lose-work beats commit hygiene, and
     builder death is the norm), but through an index-safe form: `git add <only your NEW files>`,
     then **`git commit --only <every path in this commit>`**. `--only` builds the commit from those
     paths alone and *disregards whatever else is staged*, so a sibling's in-flight staging can never
     ride along. **Never** `git add -A` / `git add .` / `git add -u` / bare `git commit` /
     `git commit -a` / `git stash` / `git checkout <path>` / `git restore`. An `index.lock` race fails
     loudly and harmlessly — retry it, never work around it.
   - **Builds:** `next build` writes one `.next/` per tree, so two concurrent production builds in
     the same checkout WILL fight — typecheck with `npx tsc --noEmit` (cheap, no shared output) and
     leave the full build to the Director at quiescence. What no lock protects against is a
     sibling's half-written source. **A compile or type error in a file
     outside your write set is a sibling's transient state: re-run once, then report it — never fix
     it.** Same for a test that fails in a suite you do not own.

4. **Brief** each lot (template below); launch with `model: "opus"`, `subagent_type: "general-purpose"`,
   all briefs in one message so they run concurrently. **Brief quality bar:** the write set, the
   step-3 protocol verbatim, and the exact gates — `npx tsc --noEmit`, plus the Class C
   *report-don't-touch* rule for tokens/globals.css and dependencies. A builder that changed a
   rendered surface must ALSO drive it: `npm run dev` on its own port (`-p 31xx`, never 3000, which a
   sibling or the user may hold) and report what it saw, or say plainly that it could not. Director review time is for judgment, not gate failures.

5. **Mid-flight decisions**: a builder returning `DECISION NEEDED: …` gets an answer from the Director
   via `SendMessage` — product calls, trade-offs and scope cuts are the Director's alone. A builder
   that stops without its final report gets one `SendMessage` nudge.
   **Builder-death recovery (session limits WILL kill builders):** the instant a builder dies, snapshot
   its work as `wip(…)` with **`git commit --only <its write set> --no-verify`** — *not* `git add -A`,
   which was safe only while the tree was private and is now actively dangerous. Then the Director
   either finishes inline or re-briefs a fresh builder with "continue from the WIP commit".

6. **Review — the Director earns its title here.** Per direction: `git show <sha>` (the commits are
   already atomic and already on the wave branch — there is no branch-vs-main diff to get wrong).
   Review against the acceptance criteria, repo conventions (the design language in
   `components/ui/tokens.ts` + `Primitives.tsx` — no colour literals, no hand-rolled primitive that
   already exists; fixtures typed through `app/_studio/types.ts`, never ad-hoc shapes), and taste. Verdict per direction: **keep** /
   **redo with notes** (SendMessage; the builder fixes in place with a follow-up commit) / **drop**
   (`git revert` that commit, `status: failed`, reason recorded). Never accept on "tests pass" alone —
   read the diff. Hold commit messages to the Director's own bar; reword at review if needed.
   **Docs-vs-code check (learned round 1):** when a diff documents a behavior (contract text, formula,
   doc comment), grep for the code that implements it — one builder shipped a beautifully-documented
   decay formula with the implementing SQL never written. A contract describing behavior the code
   does not have is worse than nothing.
   **Mock-honesty check (this repo's version of the same trap):** every surface here renders
   fixtures. A diff that makes a fixture *look* like a working feature — a progress bar that fills on
   a timer, a "rendering" state that always succeeds — is the same defect as documented-but-unwritten
   code. Fixtures may be rich; they may not lie about what the product can do.
   **Any branch-vs-main comparison, for any purpose, is three-dot or it is wrong** — and after a
   squash merge neither form answers "did this land": grep for a signature symbol instead.

7. **Integration gate, once, at quiescence.** After every builder has reported and been reviewed, run
   the `config.md` gates on the wave branch: `npx tsc --noEmit` then one `npm run build` (the only
   place a production build belongs — see the Class C/build rule). This is now confirmation rather than discovery — one branch means the
   builders' work was already compiling against each other all along, which is precisely what round 3
   had to bolt on a separate phase to catch. Reds are fixed inline as Director commits **and the
   output is read BEFORE the next state-changing action** (rounds 4 and 5 both committed while an
   unread test run was showing failures). A departing builder that flags a regression in its final
   report is gate input, not noise.

8. **Land the wave: ONE merge.** Apply Class C (the token/globals edits the builders reported, any
   dependency add) and commit it. Then:
   ```bash
   git switch main && git merge --ff-only perfect/<date>    # or --no-ff if main has moved
   ```
   The per-direction commits *are* the atomic history — no cherry-pick, no squash-per-direction, no
   N-way conflict resolution. If main moved under you, this is one ordinary content merge instead
   of N. Re-run the gates on main after the merge.

9. **Doc-sync in the same turn**: when the shape of the product changed, update `README.md`.
   **Do NOT touch `context-map.json`** — it is a Personas export (see Phase 0). A wave that added or
   moved files leaves the map stale, so end the session by telling the user which contexts moved and
   that a rescan in Dev Tools → Context Ledger will refresh it. The map is the taxonomy `/perfect`,
   `/explorer` and `/uat` all read, so a silent drift degrades three skills at once.

10. **Cleanup**: delete the wave branch once merged; if a wave worktree was used, `cmd //c rmdir` the
    node_modules **junction FIRST**, then `git worktree remove`, then verify the main checkout's real
    `node_modules` is still intact before moving on.

<details><summary><b>Exception path — surgery for a main that moves under you.</b> Not the default any
more; the one-branch shape removes the cherry-pick class entirely. Reach for these only when a
concurrent session dirties or advances a file you must land into.</summary>

- **Union-merge discipline:** both-append conflicts are usually safe to keep-both — but only when each
  side is a complete declaration. NEVER blind-union hunks whose sides end mid-function (a glued test-fn
  and a swallowed closing brace turned main red for two picks in round 4). Read every seam.
- **Concurrent-session DIRTY files:** never stash, never wait — commit *around* them. (a) Dirty
  `en.json`: stage `HEAD + your keys` straight into the index (`git hash-object -w` +
  `git update-index --cacheinfo`) and write `their-working-copy + your keys` to disk. (b) Dirty
  source file: same index trick, content built by `git merge-file` (base=fork, ours=HEAD, theirs=branch),
  plus a second merge-file for the working copy. (c) After re-applying another session's delta, **diff
  the result against the captured patch and require an exact match** — a reverted value edit leaves both
  a clean `git status` and a grep-for-the-key satisfied.
- **Shared append-files** (`MODULES`, the `PHASES` array): never
  wholesale-`checkout` a branch's version across sequential operations — it clobbers earlier ones'
  registrations and tsc catches it too late. Patch-union
  (`git diff branch~..branch -- file | git apply --3way`) or regenerate from source, always.
- **Fixture re-application:** don't hand-merge a fixture file two builders both grew. Re-apply the
  branch's **entry adds/removes** programmatically over main's current fixture (compare the exported
  arrays by id, add/remove on the current copy, write) — a hand-merge of `assetsGenerated.ts` silently
  drops entries that no typecheck will catch, because every shape still compiles.
</details>

### Phase W — Wrap (every session, even interrupted ones)
1. Update every touched vault note; write the session note with the **`next:` pointer** (e.g. `next: propose — cursor at overview-analytics, pool 7/10` or `next: build wave 2 — trigger-system + agent-lab remain`).
2. `Perfect.md` headline refreshed: pool count, queue cursor, shipped-total, last-session link.
3. Move the active-runs ledger entry to Recently completed with SHAs.
4. **Reflect on the skill itself**: 2-4 bullets in `config.md → ## Skill improvement log` — what dragged, what the user overrode, what the next round should change. This log is the input for the between-rounds skill revision.

## Direction quality bar (what earns a slot in the 5)

- **Value-first**: names the user moment it improves; "nice refactor" is not a direction unless it unlocks something.
- **Evidence-backed**: cites today's code (`file:line`), not vibes.
- **One-session-shippable**: ≲15 files, no cross-context schema breaks; else slice it.
- **Novel to the vault**: not shipped, not pending, not previously rejected (unless the world changed — say so).
- **Lens-diverse**: default one per lens; substituting a second entry in one lens requires the Director to say why.

## Builder brief template

```
You are an Opus-class builder for Gravitone Studio (gravitone-gcloud):
Next.js 16 App Router + React 19 + TypeScript + Tailwind v4. UI-first prototype —
every surface reads MOCKED fixtures from app/_studio/. There is no backend, no
database and no third-party service, and adding one is not your call.

YOU ARE NOT ALONE IN THIS TREE. <n> builders are working in this same checkout
on this same branch (`perfect/<date>`) right now. You have been grouped so that
your files and theirs do not overlap — that grouping IS the collision
avoidance, so respecting it is the whole contract.

YOUR WRITE SET — the only files you may modify:
<explicit file list>
Anything outside it requires DECISION NEEDED. A compile error, type error or
failing test in a file OUTSIDE your write set is a sibling's half-written
state, not your bug: re-run once, then report it. Never fix it, never revert it.

SHARED-RESOURCE PROTOCOL (non-negotiable):
- Append-only registries (the MODULES list in components/ui/StudioFrame.tsx, the
  PHASES array in app/page.tsx): you MAY edit, but re-read the
  file immediately before each edit and anchor on a string unique to YOUR change.
  Never rewrite one whole.
- GENERATED, never edit: context-map.json (a Personas export — hand edits are
  erased by the next scan). Report taxonomy drift in your final report instead.
- DIRECTOR-ONLY, do not touch: components/ui/tokens.ts, app/globals.css,
  package.json and the lockfile. REPORT what you need instead — a new token by
  name with its intended value, a dependency and why — and the Director applies
  it once.
- COMMITS: `git add <only your NEW files>` then
  `git commit --only <every path in this commit> -m "..."`.
  `--only` builds the commit from those paths alone and ignores whatever else is
  staged, so a sibling's in-flight staging can never ride along in your commit.
  FORBIDDEN: git add -A · git add . · git add -u · bare git commit · git commit -a
  · git stash · git checkout <path> · git restore. An index.lock collision is
  harmless — retry it, never work around it.

Implement these accepted directions, one atomic commit each, message `feat(<context>): <title>`:
<per direction: What & why · Acceptance criteria · Evidence file:line · Risks/non-goals>

COMMIT EACH DIRECTION THE MOMENT IT IS DONE AND VERIFIED — never batch commits
for the end of the session. An interrupted session must lose at most the
direction in progress, not everything.

RUN COMPILES IN THE FOREGROUND — and if one genuinely exceeds the harness's
600s cap, background it and then IMMEDIATELY BLOCK on reading its result before
doing anything else. NEVER end a turn on a pending gate: no notification will
arrive, you will simply idle until the Director nudges you (this cost 5+ nudges
across waves and stalled two builders for an hour in round 4). Cargo's
target-dir lock wait is normal — waiting is correct, ending your turn is not.

SEARCH BEFORE BUILDING: before implementing any new mechanism, grep for an
existing implementation of the same concept and LAYER ON it rather than
forking a parallel system (round 3's history builder found a load-bearing
back-only nav history this way — unifying beat replacing).

A TEST THAT FAILS ON ITS FIRST RUN HAS DONE ITS JOB. Fix the code, not the
assertion, and pin what you learned — round 4 caught two real defects this way.

NO INTERACTIVE GIT: `git add -p`, `git add -i`, `git rebase -i` HANG this
harness (a round-5 builder stalled 600s on add -p). When directions interleave
in your own files, commit by FILE boundaries and document the shared commit —
never hunk-split interactively.

Repo law (non-negotiable):
- Read README.md § The design language before any UI, and — if your write set touches a step surface
  — that step's knowledge/.../PATTERNS.md + params.json. Defaults and ranges come from params.json;
  never invent a number a component shows.
- Read README.md § The design language before any UI. components/ui/tokens.ts is the ONLY file that
  may contain a colour literal — everything else consumes --gt-* vars or the exported TS constants
  (SURFACE, TEXT, EASE). Reuse Primitives (Eyebrow, Panel, Button, Waveform) and StudioFrame; do not
  hand-roll a panel, a pill or a button that already exists.
- The fixtures in app/_studio/ are the seam a real backend will replace. New data goes through the
  types in types.ts / projectTypes.ts — never an inline ad-hoc shape in a component.
- Honest surfaces: this app renders mocked data, so never draw a state the product cannot actually
  reach. Absence is shown as absence (a scene with no pick, a cue that was refused, a cut with gaps),
  never as a spinner that resolves to fiction.
- Client components need "use client"; keep a surface under ~200 LOC and split by phase, not by tag.
- GATES you must pass before reporting done: npx tsc --noEmit (there is no test suite and no linter
  configured in this repo — do not invent a command; if you added a test, say how to run it). Then
  drive the surface: npm run dev -p 31<your lot number> and report what you actually saw. Report what
  you COULD NOT verify honestly.

If a product decision is ambiguous, STOP that direction and return `DECISION NEEDED: <question>`
with your recommendation — never guess. Final report format:
per direction → status (done|blocked|decision-needed), commits, files, verification evidence, open risks.
```

## Modes

- **`/perfect`** — resume the loop wherever the vault says it stopped (the default; covers init on first run).
- **`/perfect propose [context]`** — force a proposal pass (optionally jump the cursor to a named context).
- **`/perfect build`** — build now with the current pool even if < 10.
- **`/perfect status`** — read-only: queue, cursor, pool, in-flight builds, shipped ledger, last session. No agents.
- **`/perfect smoke`** — live verification pass over recent waves' shipped surfaces: `npm run build` (a green production build is the floor, and it typechecks), then `npx next start -p 3177` and walk every phase and the library — clicking, not reading. Because everything is fixture-driven, the diagnostic is the fixture: when a surface looks wrong, read the fixture it renders before touching the component; a wrong number is usually mocked data, not a bug. Record verified / not-driven / fixes in a `sessions/<date>-smoke` note; small fixes commit inline (gates BEFORE commit). Run after every ~2 waves, and kill the server when done.
- **`/perfect reflect`** — read `config.md → Skill improvement log` + last sessions and propose concrete edits to THIS skill file.

## Guardrails

- **Never stash, never `git add -A`** — per-file staging, staged-count check before every commit; other sessions' work is sacred (parallel-safety primitives in CLAUDE.md apply in full). Inside a wave, `git commit --only <paths>` is the form that makes this safe by construction.
- **Efficiency outranks defensive isolation.** Before adding any protective step to this loop, ask whether the risk it defends against is instead a signal that the *grouping* is wrong. Machinery that exists to survive a bad wave plan should be deleted and the wave plan fixed.
- **Cost discipline**: scouts are Explore-tier; builder-tier model spend goes only to accepted work; the Director never re-runs a scout whose brief is < 1 round old (it's in the context note).
- **Honest ledger**: a direction only reaches `shipped` with gates green AND the Director having read the diff; anything else is `failed` with a reason. No silent drops — every accepted direction's fate is recorded.
- **Interruptibility is a feature**: write the vault incrementally (after every context in P, after every merge in B) so a killed session resumes losslessly.
- **The user is the product owner**: the gate is theirs; the Director challenges but never overrides a rejection, and repeated rejections of a lens/context recalibrate the queue scores.

## App context coverage (Personas-managed repos)

This skill declares `contexts: tracked` — the Personas app measures per-context memory coverage for it. **This repo IS Personas-managed** (`.personas/` exists; project `gravitone`, id `91d8170c-2be4-45ac-b509-256bfa7726f1`). Append JSON lines to `.personas/memory-outbox.jsonl` at the repo root (append, never rewrite) — one node per context you meaningfully worked on:

```json
{"type":"node","kind":"progress","title":"<=200 chars: what you did in this context","body":"optional detail","context":"<a context name the app knows>","skill":"perfect"}
```

**Which name — this is the part that silently fails.** The ingest matches `context` against the names the app actually knows, case-insensitively. An unrecognized name is NOT an error: the node is stored with a null context and never counts toward coverage. In this repo the authority is the app's own DB, and `context-map.json` is its export — same machine, one scan, so the map's `contexts[].name` values ARE the matching set. Confirm through the bridge when it is up (`GET http://127.0.0.1:<17400+>/dev-tools/projects`, then the context ledger) rather than trusting a name you remember; a map that predates the last scan can name a context the DB has since retired.

Always set both `"skill":"perfect"` and `"context":"<name>"` — together they drive the per-skill context-coverage % (last 30 days).

**Append incrementally, not at the end** — same rule as the vault: one line the moment a context's proposal pass closes, one more when a direction from it ships. "Before finishing" loses everything when a session is killed, and this loop's sessions get killed.

**Who ingests it:** the app sweeps the outbox into the Memory Ledger and deletes the file when a *Fleet-spawned* session exits, and whenever the Skills Manager panel (Dev Tools → Skills) is opened for the project. A `/perfect` run in a plain terminal is neither, so its lines sit on disk until the user next opens that panel — that is expected, not a failure. Never hand-write into the ledger DB; the outbox is the only door.

The vault under `.vault/Perfect/` remains the loop's own memory; the outbox is the app's view of it. Both, not either.

---

## Skill Reflection

After the run's real work is done, reflect twice — autonomously, without asking the user. Be honest about volume: most runs produce NOTHING for lane 2. An empty reflection is a valid result; a forced lesson is pollution. Calibration: nothing (common) / one line (sometimes) / a lesson entry (occasionally) / a redesign proposal (rare).

Lane 1 — PROJECT learnings (what the next session in THIS repo needs): write via the MEMORY BLOCK contract if this prompt carries one, else append node lines to `.personas/memory-outbox.jsonl` per the contract above. Project-specific insight only.

Lane 2 — METHOD learnings (what would improve THIS SKILL for every project):
1. If nothing generalizes beyond this repo, stop here.
2. Append an entry to `LESSONS.md` in this skill's directory: `## <version-used> — <YYYY-MM-DD> — <project-name>` followed by `- ` bullets (create the file with a `# Lessons — perfect` heading if absent). Record the version the run USED, not a bump target. Wrap a bullet in a `### Redesign proposal` sub-block when it argues for a methodic redesign you are NOT applying now.
3. Version bump — ONLY when you also edit SKILL.md to apply the improvement in the same change: minor (1.2 → 1.3) for a prompt/step refinement, major (1.x → 2.0) for a methodic redesign. Update the `version:` frontmatter field. Never bump without an applied edit; never edit the method without a bump.
4. Sync ritual (only when you bumped): (a) commit the skill directory as a STANDALONE commit on the current branch — message `skill(perfect): v<new> — <one-line reason>` — containing nothing but this skill's files; (b) copy the updated skill directory to `~/.claude/skills/perfect/` (overwrite) so sibling projects can adopt it. EXCEPTION: read `.personas/skill-registry.json` first — if the library already carries a HIGHER version than yours, do not overwrite it; keep your lesson in LESSONS.md and note the version conflict in the entry.

**Repo-specific caution on lane 2:** this copy is a Gravitone ADAPTATION of the workspace engine (the upstream at `dolla/personas` is Tauri/Rust/i18n-shaped). A lesson that is really about Next.js, `.vault/`, or this repo's gates is lane 1, not lane 2 — pushing it upstream would break the sibling repos that run the same skill.

Sibling awareness: `.personas/skill-registry.json` (repo root) lists this skill's installed version, the workspace library version, and which sibling projects run it at which version with recent usage. Use it to judge whether a lesson is worth a bump (heavily-used siblings raise the bar for majors) and to notice you are BEHIND (library newer than yours → prefer recording the lesson over editing a stale method).
