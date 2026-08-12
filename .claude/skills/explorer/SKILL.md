---
name: explorer
description: Wander one context of Gravitone Studio, surface 10 items worth fixing, triage with the user, then execute the accepted ones in-session. Tuned to a mocked UI-first prototype — design-language violations and dishonest fixtures rank above hardening. Daily low-friction quality sweeps with per-context coverage memory in .vault/.
argument-hint: "[area]"
category: Maintenance
memory: vault
contexts: tracked
---
# Explorer

Wander a logical section of the Gravitone Studio codebase, surface exactly **10 items** worth fixing, let the user triage, then execute the accepted ones in-session. Designed for frequent / low-friction use — daily wandering — and pairs with `/research` (external sources) and `/perfect` (the directional build loop).

This skill is tuned to **gravitone-gcloud**: a UI-first Next.js 16 / React 19 / Tailwind v4 prototype of a content studio, running entirely on mocked fixtures in `app/_studio/`. It uses `context-map.json` at the repo root as the area taxonomy — **a Personas app export, never hand-edited** (see Constants) — and `.vault/` for run records, coverage tracking, and cross-run learning.

**What "worth fixing" means in a prototype.** There is no backend, no test suite and no user in production, so the usual severity ladder skews. Rank up: design-language violations (a colour literal outside `tokens.ts`, a hand-rolled primitive), fixtures that lie about what the product can do, a surface that cannot represent absence or failure, dead props/state, and accessibility. Rank down: hardening against inputs that no code path can produce yet, and performance work on a fixture array of 20 items. Never file "add a backend" as an item — that is a `/perfect` direction, not a sweep item.

## Interaction conventions

Built for parallel CLI control — every user prompt is single-keystroke answerable.

- **Every prompt is a numbered menu.** Numeric input picks the option; **Enter** triggers the default; option `1. other → …` is the deviation lane (free text).
- **Every phase output (intermediate or final) ends with a `Next?` block** of 2–5 numbered next-step actions. Replying with a digit advances the run without typing prose.
- Long free-text answers are still accepted everywhere; the menu just makes the common case instant.

## Input

Ask **two** numbered-menu questions, in this order. Numeric input picks the option; **Enter** picks the default; option `1. other → …` is the deviation lane and accepts free text.

### Q1 — Area

```
Area? (Enter = pick for me)
  1. other → type a hint (path fragment, keyword, or context name)
  2. phases         production-phases      (the five phase surfaces + page.tsx, 10 files)
  3. library        asset-library          (shelves, drawer, asset fixtures, 8 files)
  4. design         studio-design-system   (tokens, primitives, globals.css, frame, 6 files)
  5. infrastructure app-infrastructure     (layout + build config, 4 files)
  6. pick for me   ← default
```

Numeric options 2–5 are the 4 contexts in `context-map.json` — one per group, so context and group
are the same unit in this repo today. **A context here is broad** (Personas' scan targets 10–30 files
each), so a full sweep of `production-phases` covers all five phases at once; when the user names one
phase, scope to it inside that context and say you did. Option 1's free text falls through to the
Phase 2a resolver (path fragment / keyword / exact context name). Option 6 / Enter triggers Phase 2b
auto-pick.

### Q2 — Category

```
Category? (Enter = any)
  1. other → describe (free-form intent; layered onto an auto-picked category)
  2. any            ← default
  3. quality
  4. dx
  5. ui
  6. design
  7. fixture
  8. perf
  9. bug
  10. a11y
```

Wait for both answers. Don't ask anything else upfront — further questions only if a phase requires clarification.

If the user replies just "go" or "wander" or types `/explorer` with no arguments, treat as "pick for me" + "any" (Enter defaults for both).

---

## Constants

- **Codebase reference files** (always loaded):
  - `context-map.json` (repo root) — the area taxonomy. Small enough to read whole.
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
  - `README.md` — what the product is, what is deliberately mocked, and the design language's rules.
  - `AGENTS.md` — the Next.js version note (this is Next 16; the docs in `node_modules/next/dist/docs/` are authoritative over training data).
- **Vault root** (resolved at Phase 0):
  - `Explorer/sweeps/` — one note per run, the canonical artifact
  - `Explorer/state.md` — informational claim board (which areas are being explored *right now*)
  - `Explorer/coverage.md` — heatmap of last visit per area + yield density
  - `Explorer/passes.md` — per-area "already considered and rejected" memory; future passes skip these
  - `Patterns/explorer-preferences.md` — distilled rules across runs (promoted from Lessons)
  - `Lessons/{date}-explorer.md` — append-only self-reflection
- **Categories** — `quality | dx | ui | design | fixture | perf | bug | a11y`
  (`design` = a design-language violation: a literal outside `tokens.ts`, a re-rolled Primitive.
   `fixture` = the mocked data misrepresents, contradicts itself, or is shaped so a real backend
   could not produce it.)
- **Severities** — `critical | high | medium | low`
- **Effort buckets** — `xs (<15m) | s (15-60m) | m (1-3h) | l (>3h)`

---

## Phase 0: Resolve vault path

```bash
VAULT="C:/Users/mkdol/dolla/gravitone-gcloud/.vault"
[ -d "$VAULT" ] || mkdir -p "$VAULT"   # in-repo and gitignored; create it on first run
```

Record `$VAULT` for the rest of the run.

### Bootstrap (one-time per vault)

If any of these are missing, create them:

- `$VAULT/Explorer/` (directory)
- `$VAULT/Explorer/sweeps/` (directory)
- `$VAULT/Explorer/state.md` — header only:
  ```markdown
  # Explorer State

  Active claims by `/explorer` runs. Informational only — not a hard lock.
  Stale entries (>2h) are released automatically by the next run.

  ## Active

  _No active explorers._
  ```
- `$VAULT/Explorer/coverage.md` — header only:
  ```markdown
  # Explorer Coverage

  Heatmap of areas explored. Used by Phase 2 to pick the staleest, highest-yield area.

  ## Areas
  ```
- `$VAULT/Explorer/passes.md` — header only:
  ```markdown
  # Explorer Passes

  Per-area record of items that were surfaced and **rejected** in past runs.
  Future passes over the same area skip these. Accepted items don't appear here
  (their fix is in the codebase). Items that were not surfaced are also absent.

  ## Areas
  ```
- `$VAULT/Patterns/explorer-preferences.md` — header only:
  ```markdown
  # Explorer Preferences (distilled from /explorer runs)

  > Rules upgraded from `Lessons/` after 3+ observations. Loaded by Phase 1.

  _No patterns yet. Will be populated as runs accumulate._
  ```

Don't create `Lessons/` (already shared with `/research`).

---

## Phase 1: Load context & memory

### 1a. Required-file check

`context-map.json` must exist at the repo root. If it is missing, do not guess a taxonomy and do not
write one — it is a Personas export, so the fix is a scan in the app (Dev Tools → Context Ledger →
scan). Stop and tell the user that.

### 1b. Read in order

1. `context-map.json` — the area taxonomy (4 groups, 4 contexts, `file_paths`, `keywords`,
   `entry_points`, `cross_refs`). Read it whole; the `keywords` and `entry_points` arrays are the
   scan's own summary of each context and are the fastest way in.
2. `README.md` — the product, the mocked seam, and the design-language rules.
3. `components/ui/tokens.ts` — the design system itself; every `ui`/`design` item is judged against it.
4. `$VAULT/Architect/strong-patterns.md` (if present) — to know the canonical shapes the codebase has been observed to do well. When you propose a fix in Phase 5, **prefer the shape of an existing strong pattern** over inventing a new one. Reference the pattern in the item's `strong_pattern_ref` field.
5. `$VAULT/Patterns/explorer-preferences.md` — to deprioritize finding shapes the user has rejected before.
6. `$VAULT/Explorer/state.md` — to know what *other* explorers are working on right now.
7. `$VAULT/Explorer/coverage.md` — to know last-visit dates and yield per area.
8. `$VAULT/Explorer/passes.md` — to know which items were already rejected per area.
9. The 3 most recent files in `$VAULT/Lessons/` matching `*-explorer.md` (sorted descending) — to absorb recent self-reflection.

### 1c. Stale-claim sweep

In `$VAULT/Explorer/state.md`, any entry whose `claimed_at` is older than 2 hours is **stale** — assume the run was abandoned. Remove stale entries before proceeding. This keeps the file honest without an explicit lock.

### 1d. Map freshness

The map is only as fresh as the last Personas scan, and `provenance.git_commit` /
`generated_at` tell you when that was. Check it: every `file_paths` entry must exist, and every
source file in `app/` and `components/` should appear in a context. **Do not fix it yourself** — a
hand edit is erased by the next scan. Report it and continue:
```
Warning: context-map.json is stale — {N} missing paths, {M} unmapped files, last scanned {date}.
A rescan (Dev Tools → Context Ledger) will refresh it; sweeping on the current map regardless.
```
(Five files are unmapped as of the last scan — `README.md`, `AGENTS.md`, `CLAUDE.md`, `package.json`,
`tsconfig.json`. That is the known baseline, not new drift.)

---

## Phase 2: Pick area

### 2a. If user gave a hint

Resolve the hint to one or more contexts in `context-map.json`:
- Exact group name (e.g. `Production Lifecycle`) → all contexts under that group.
- Exact context name (e.g. `Motion Phase`) → that single context.
- Path fragment (e.g. `_phases`) → contexts whose `file_paths` overlap.
- Keyword (e.g. `tokens`, `spotting`, `provenance`) → match against each context's own `keywords`
  array first (the scan wrote them for exactly this), then name/description.

If the resolution is ambiguous (>3 plausible areas), present a short numbered list and ask "which one?" before continuing.

### 2b. If user said "pick for me"

Score each context by:
- **Staleness** — days since last visit per `coverage.md` (more days = higher score). Never-visited = max staleness.
- **Past yield density** — items accepted / items surfaced in last 1–2 visits (higher = higher score). Tie-breaker.
- **Active claim penalty** — if the context appears in `state.md` Active section, score = 0 (skip it; pick a different area).

Pick the top-scored context. If multiple tie, pick the one with the smaller file count (faster to scan, tighter feedback loop).

Tell the user which area you picked and why (one short sentence), then a `Next?` menu:

```
Next?
  1. other → name a different area or context id
  2. proceed with {picked-area}   ← default
  3. abort
```

### 2c. Category filter

If the user's category filter is not `any`, narrow the scan focus accordingly. The area stays the same; the filter only changes what kind of items count toward the 10-item budget.

---

## Phase 3: Claim the area

Append an entry to `$VAULT/Explorer/state.md` under the `## Active` section:

```markdown
- **{area-slug}** — claimed_at: {ISO timestamp}, run_id: {short random id}, category: {filter}
```

This is **informational, not a lock.** Other explorers reading this file will pick a different area. There's no enforcement, but the user said only one explorer runs at a time, so this is sufficient for awareness.

Also append one entry to the repo ledger `.claude/active-runs.md` under `## Active` (per CLAUDE.md "Concurrent CLI sessions"), declaring the area's paths as your scope. If an existing `started` entry <2h old overlaps those paths, surface the conflict to the user before scanning.

Print the claim line to the user so they know what's recorded.

---

## Phase 4: Wander the code

Read enough of the area to identify 10 items. Budget your tool calls — don't read every file in a 100-file area. Sample strategically.

### 4a. Sampling strategy

For an area with N files:
- N ≤ 5: read all of them.
- 5 < N ≤ 20: read all entry-point files (from `codebase-context.md` `Entry points:` line) + a random sampling of the rest, capped at 10 file reads.
- N > 20: read all entry points + grep-discover the largest files (`Glob` then sort by line count) + sample 5–8 of those.

Use `Read` with offset/limit when files are >500 lines — read top + bottom + a middle slice rather than the full file.

### 4b. What to look for, by category

**Hard exclusion — "wire it to a backend".** This repo is deliberately mocked. Never surface "call a
real API here", "persist this", "add auth" as items; the seam is the design, and changing it is a
`/perfect` direction the user gates. Items about the *shape* of that seam (a component reaching into
a fixture instead of taking props, a type that a server could never satisfy) are in scope and are
usually the most valuable things a sweep finds.

For `quality`:
- Dead code, unreachable branches, unused exports.
- Duplicated logic across files (3+ near-identical blocks).
- Misleading names, unclear intent, leaking abstraction.
- Comments that explain "what" instead of "why" — flag the comment, not just the code.
- Commented-out code older than current branch.

For `dx`:
- Fixture data that is hard to extend (parallel arrays that must stay index-aligned, ids duplicated
  by hand, a shape that forces every new scene to be edited in four files).
- Types that describe less than the data does (`string` where a union of states exists, optional
  fields that are always present).
- Repeated render logic in phase surfaces that belongs in `_studio/*Parts.tsx`.
- Build-time hot-paths (bundle size, slow rebuilds) — use `npm run build` output if recent.

For `ui`:
- Hand-rolled duplicates of `components/ui/Primitives.tsx` (Eyebrow, Panel, Button, Waveform) or of
  the frame's own chrome.
- Visual bugs (overflow, alignment, contrast). Only flag if you can reproduce or strongly suspect
  from the code — and prefer to actually run the dev server and look.
- Missing empty / partial / refused states on a surface whose data can be absent. In this product
  absence is the story (an unpicked scene, a refused cue, a cut with gaps) — a surface that can only
  render the happy path is a `ui` defect, not a nicety.
- Accessibility gaps that double as UX gaps (icon-only buttons without a label, focus traps,
  keyboard nav broken).

For `design` (this repo's sharpest category — see README § The design language):
- A colour literal anywhere but `components/ui/tokens.ts` (hex, `rgb()`, or a raw Tailwind palette
  class used as an accent).
- A `--gt-*` var read that `tokens.ts` does not define, or a token defined and never consumed.
- Motion that is not entrance-only, or that ignores `prefers-reduced-motion` (globals.css disables
  animation globally under it — a JS-driven animation escapes that and must opt out itself).
- Type scale / font-family drift: the three families are `font-instrument`, `font-hanken`,
  `font-jetbrains` and nothing else.

For `fixture`:
- Data that contradicts itself across surfaces (a scene count in the header that the scene list
  disagrees with; a run marked rendered whose asset is missing).
- A fixture that flatters: every generation succeeds, every asset has a caption, no cost, no wait.
- Ids that are not stable/unique, or that are derived from array position.
- A shape no realistic backend could return (client-only fields baked into the "server" data).

For `perf` (be sceptical — the fixtures are tiny; most "perf" here is really `quality`):
- Work that scales with a *real* library, not this one: an O(n²) join over assets, a filter rebuilt
  per render that a real dataset would make visible.
- `useEffect` chains where one effect depends on another's state (cascade).
- Animations that run off-screen or never pause (`usePauseOffscreen` in `Equalizer.tsx` exists for
  exactly this).
- Client components that could be server components — in the App Router this is a real cost, and
  several surfaces are `"use client"` only because their parent was.

For `bug`:
- Race conditions (state read-then-write without a transaction, async effects without abort).
- Edge cases unhandled (empty arrays, null/undefined, NaN).
- Stale closures in effects/callbacks.
- Off-by-one, boundary errors.
- Wrong dependency arrays in hooks.
- Errors swallowed silently (catch with empty body or just `console.log`).

(There is no i18n in this repo — it ships English only. If the user asks for localization, that is a
`/perfect` direction with real scope, not a sweep item.)

For `a11y`:
- Missing labels on form inputs.
- Color contrast (you can't measure it, but you can flag `text-foreground/40` on `bg-secondary/30` style stacks).
- Keyboard navigation broken (clickable divs without role/tabIndex).
- Missing focus styles.
- Modal without focus trap, escape handler, or backdrop click.

On security: this app has no server, no route handlers, no auth and no secrets, so there is no `sec`
category in the menu. Two things still qualify — as `bug`, at `critical` — and both become live the
moment a backend lands, so flag them if you ever see them: a secret or key committed to the repo, and
`dangerouslySetInnerHTML` fed anything but the token stylesheet `GravitoneTokens.tsx` generates.

### 4c. Honor the deprioritization signals

- If `Patterns/explorer-preferences.md` contains a rule like "user rejects cosmetic CSS findings without a measurable issue," skip those.
- If `Explorer/passes.md` for this area lists items by short fingerprint (file:line + 1-line summary), skip exact matches. A near-match is OK to surface — but note "previously passed; resurfacing because <reason>".
- Cross-check the area's previous sweep notes (`Explorer/sweeps/*-{area-slug}.md`) — don't resurface an item a past run already surfaced, unless its status changed.

### 4d. Dedupe against recent history (one command, seconds)

Before finalizing candidates, run **one** git log over the area's paths:

```bash
git log --oneline -20 -- <area path globs>
```

Drop any candidate whose anchor was plausibly fixed or reworked by a recent commit (verify by reading the current code, not the commit message). If a candidate survives despite recent activity, note "still present after <sha>" in its evidence. This plus passes.md plus prior sweeps is the full dedupe — no deeper archaeology.

### 4e. Stop conditions

- 10 items found → stop scanning, move to Phase 5.
- Exhausted the area without 10 items → widen scope by pulling in the *adjacent* context from the same group in `codebase-context.md`. Note the widening in the run record. If still <10 after widening twice, stop with what you have and explain the shortfall.
- Tool budget exceeded (>40 file reads) → stop with what you have.

**Do not pad the list** with low-value items just to hit 10. Quality over quota. If you stop short, the run record explains why.

---

## Phase 5: Categorize and structure each item

### Premise verification (hard gate — no item ships without it)

Every item's `anchor` must be a `file:line` **you actually Read in this session**, and its `evidence` must quote or paraphrase the real code at that line. Before presenting, re-Read the anchor lines of any item whose premise came from a grep hit or a sampled slice, and confirm the defect is really there (the guard isn't elsewhere, the "dead" export isn't imported, the "missing" abort isn't in a wrapper — one targeted Grep settles it). Pattern-matched suspicion ("this *usually* means…") is not an item. If verification kills a candidate, replace it or run short — never pad with unverified ones.

For each of the 10 (or fewer) items, capture:

```yaml
- id: 1
  title: "<short imperative phrase, ≤60 chars>"
  category: quality | dx | ui | design | fixture | perf | bug | a11y
  severity: critical | high | medium | low
  effort: xs | s | m | l
  anchor: "<file_path>:<line_number>"
  evidence: "<2-3 sentence explanation of the gap, with verbatim code snippet if helpful>"
  suggested_fix: "<1-2 sentence shape of the fix — not the fix itself>"
  strong_pattern_ref: "<wikilink to Architect/strong-patterns#... entry>" | null
  design_impact: "<none | consumes an existing token | NEEDS A NEW TOKEN (tokens.ts is owner-only — say which and why)>"
  cluster_hint: "<other ids that ship naturally with this one, or 'standalone'>"
```

**On `strong_pattern_ref`:** if the suggested fix matches the shape of an entry in
`Architect/strong-patterns.md` (or, absent that file, an existing shape in this repo — the way
`Primitives.tsx` exposes a class constant next to its component, the way `_studio/*Parts.tsx` holds
shared render fragments), set `strong_pattern_ref` to the wikilink or the `file:line`. The fix should
**conform to the canonical example**, not invent a new shape. If none applies, leave it null.

### Severity rubric (be honest)

- **critical** — security gap, data loss risk, crash on common path. Drop everything and ship.
- **high** — wrong behavior on the golden path, broken on a common edge case, regression risk if left.
- **medium** — paper cut, confusing UX, small perf hit, latent risk.
- **low** — polish, nice-to-have, taste-level.

If you find yourself rating most items "high," recalibrate downward. A 10-item list typically lands as 0–1 critical, 2–3 high, 4–6 medium, 1–3 low.

### Cluster detection

After categorizing, scan for items that should ship together:
- Same file → same PR.
- Type/function dependency → ship in order.
- Same fixture file → one commit (two hand-merges of a fixture array is how entries get dropped).

Note these in `cluster_hint`.

---

## Phase 6: Present to user

Print a summary table, then per-item detail.

### Summary table

```
#   Cat     Sev    Effort  Title                                              Anchor
─   ─────   ────   ──────  ─────────────────────────────────────────────────  ──────────────────────────
1   fixture high   s       Scene count in header disagrees with SCENES        app/page.tsx:84
2   design  med    xs      Raw #67e8f9 instead of --gt-accent-cyan            app/_phases/motion/MotionShotLab.tsx:61
3   ui      med    s       Shelf has no empty state when a filter matches 0   app/_library/LibraryShelves.tsx:118
...
```

### Per-item detail

For each row:
```
[N] {title}
    Category / Severity / Effort:  {cat} / {sev} / {effort}
    Anchor:    {file:line}
    Evidence:  {explanation + snippet}
    Suggested: {1-2 sentence fix shape}
    Follows:   {strong-pattern wikilink + canonical example, or "—" if none applies}
    Design:    {none | consumes <token> | needs new token <name>}
    Cluster:   {standalone | ships with [a, b]}
```

If any items are clustered, end the section with a short "Clusters" block:
```
Clusters:
  - [2, 5, 8] — all in motion/MotionShotLab.tsx; ship in one commit. Order: 5 → 2 → 8.
  - [3] alone — library empty state, separate commit.
```

---

## Phase 7: Triage

Ask the user:
```
Which to action? Reply with item numbers (e.g. "1, 3, 4").

Shortcuts:
  all     — accept every surfaced item
  none    — accept nothing (still write the sweep note)
  ask     — guided walkthrough item-by-item
  Enter   — same as "none"   ← default
```

For each accepted item, execute it **in this same session**. Same default as `/research`: discover → decide → implement → commit, all in one context window.

### Execution rules

**Single accepted item with a clear anchor (Option A):**
1. Apply the edit at `anchor`.
2. Run validation — **this repo has exactly one gate, so run it every time**:
   - `npx tsc --noEmit` (fast; no shared build output, safe alongside another session)
   - `npm run build` when the item touched routing, layout, or anything server-rendered — it is the
     only check that catches an App Router mistake a typecheck cannot see.
   - There is no linter and no test suite configured. Do not invent `npm run lint` / `npm test`; if a
     run "passes" a command this repo does not have, that is fabricated evidence.
3. **Stage scoped + verify + commit in ONE Bash invocation** (concurrent sessions rewrite the index between separate calls):
   ```bash
   git add path/one path/two && git diff --cached --stat
   ```
   Never `git add -A`, `git add .`, or `git add -u`. If the cached stat lists **more files than you added**, the index held another session's pre-staged work — `git restore --staged <path>` each unrelated file, re-verify, THEN commit. Never trust the index.
4. Commit atomically: `explorer: <short title>` + Co-Authored-By footer + body explaining the why.

**2+ accepted items (Option B):**
1. Print the inline plan (one paragraph per item: file, change shape, validation).
2. Execute in **risk-ascending order** (xs effort first, l last; severity ties broken by category — `bug` before `fixture` before `design` before `perf` before `quality`).
3. Atomic commit per item, validation per commit, same one-invocation stage-verify-commit discipline as Option A.
4. If validation fails → fix inline, do NOT stack failing commits. No `--no-verify`, no `--amend`.
5. If a downstream item turns out to be redundant after an upstream commit, drop it and note the drop in the run record.

**Item that needs more thought (Option D — escape hatch):**
Record it in the run record as `decided: deferred` with the reason. Do NOT write a handoff file. The run record is the future search target. Use sparingly — prefer A or B.

### Frontend changes — non-negotiable

If any accepted item touches `app/**/*.tsx` or `components/**/*.tsx`:
- No colour literal leaves `components/ui/tokens.ts`. Consume `--gt-*` vars or the exported constants
  (`SURFACE`, `TEXT`, `EASE`). Needing a new token is fine — add it to `tokens.ts` in the same commit
  and say so; hard-coding "just this once" is not.
- Reuse `Primitives.tsx` and `StudioFrame.tsx`. A new shared atom belongs in `components/ui/`, not
  inlined in a phase surface.
- Keep the fixture seam: surfaces read the types in `app/_studio/`, never an ad-hoc inline shape.
- Represent absence honestly — see the `ui` category above.
- `"use client"` only where interactivity actually needs it.

If you can't honor these in the change, defer the item — don't ship it half-converted.

### Frontend visual verification

If a change is visually meaningful (`ui`/`design` category, or any change to a rendered component
shape), either start the dev server on a free port (`npm run dev -p 3177` — **never 3000**, which the
user or a sibling session may hold) and exercise the affected surface, or state explicitly that you
have NOT visually verified. Don't claim "looks good" from code review alone. Kill the server when
done, and never kill one you did not start.

---

## Phase 8: Persist the sweep

Write `$VAULT/Explorer/sweeps/{YYYY-MM-DD}-{area-slug}.md`:

```markdown
---
date: 2026-05-01
run_id: {short id}
area: {context-id or group}
files_sampled: {N}
category_filter: any | quality | ...
total_items: 10
accepted: [1, 3, 4]
declined: [2, 5, 6, 7, 8, 9, 10]
deferred: []
commits: [<sha1>, <sha2>]
widened: false
---

# {Area title} sweep — {date}

## Items

### [1] {title}  ✅ accepted → {commit sha} `{commit subject}`
**Category / Severity / Effort:** {cat} / {sev} / {effort}
**Anchor:** `{file:line}`
**Evidence:** {evidence}
**Fix shape:** {what was actually done; reference commit body for detail}

### [2] {title}  ❌ declined
**Category / Severity / Effort:** ...
**Anchor:** ...
**Evidence:** ...
**Decline reason:** _filled in Phase 9_

### [3] {title}  ⏸ deferred
**Category / Severity / Effort:** ...
**Reason:** {why deferred — concrete blocker, not vague "later"}

...

## Cross-references
- Adjacent areas not yet swept: {list from coverage.md, optional}
- Related preferences: [[Patterns/explorer-preferences]]
```

---

## Phase 9: Self-reflection

### 9a. Ask why for declined items

Single batched question:
```
For the declined items, why did you skip them?

  [2] {title}
  [5] {title}
  ...

Reply per-item ("2: too vague, 5: already planned") or one overall reason.

Shortcuts:
  skip    — record "no reason given"
  Enter   — same as "skip"   ← default
```

### 9b. Append to Lessons

Write/append `$VAULT/Lessons/{YYYY-MM-DD}-explorer.md`:

```markdown
## Run: {timestamp} — {area} ({category filter})

Sampled: {N} files
Surfaced: {M} items
Accepted: [list]
Declined: [list] (with reasons)
Deferred: [list] (with blockers)

### Self-reflection
- Categories that resonated: {pattern}
- Categories that didn't: {pattern}
- Calibration drift: {e.g. "rated 7 items 'high' but user accepted only 2; over-weighting severity"}
- Tools to use more / less next time: {observation}
```

### 9c. Backfill the sweep note

Add the decline reasons to the Phase 8 sweep note's `[N] declined` blocks.

### 9d. Update passes.md

For each declined item, append a fingerprint to `$VAULT/Explorer/passes.md` under the area's section (create section if missing):

```markdown
## {area}

- {file:line} — {1-line summary of the rejected suggestion} — pass {date}, run {id}, reason: {short reason}
```

The fingerprint matters — future passes over the same area skip these. Keep entries short.

### 9e. Pattern promotion check

Read all `$VAULT/Lessons/*-explorer.md`. If a decline reason has appeared in **3+ runs** (or close synonym), propose adding it to `$VAULT/Patterns/explorer-preferences.md`:

```
I've seen this 3+ times — promote to permanent rule?
  "{distilled rule}"

Source runs: [[2026-04-12-vault-credentials]], [[2026-04-20-overview-metrics]], [[2026-04-28-agents-editor]]

Next?
  1. promote to Patterns/explorer-preferences.md   ← default
  2. snooze (re-ask after 3 more observations)
  3. drop (don't promote, reset the counter)
```

If the user picks 1, append to `Patterns/explorer-preferences.md`.

### 9f. Update coverage.md

Update or insert the row for this area:

```markdown
## Areas

### {area-slug}

- Last visited: {date}
- Last run: [[Explorer/sweeps/{date}-{area-slug}]]
- Items surfaced (last 3 runs): [10, 8, 10]
- Items accepted (last 3 runs): [3, 5, 4]
- Yield density: {accepted / surfaced average}
- Notes: {anything noteworthy across runs}
```

### 9g. Release the claim

Remove the entry written in Phase 3 from `$VAULT/Explorer/state.md`, and move the `.claude/active-runs.md` entry to the top of `## Recently completed` with the resulting commit SHA(s) (or `aborted (<reason>)`).

---

## Phase 10: Final summary

Print:
```
Explorer run complete.

  Area:           {name} (group: {group})
  Category:       {filter}
  Files sampled:  {N}
  Items surfaced: {M} / 10
  Accepted:       {K} → {commit shas}
  Declined:       {L}
  Deferred:       {D}

  Coverage update: last visit {date} → {today}, yield density {X}/{Y}

  Files updated:
    + .vault/Explorer/sweeps/{date}-{slug}.md
    + .vault/Lessons/{date}-explorer.md
    ~ .vault/Explorer/coverage.md
    ~ .vault/Explorer/passes.md  (if any declines)
    ~ .vault/Explorer/state.md   (claim released)
    {if pattern promoted:}
    ~ .vault/Patterns/explorer-preferences.md

  Next?
    1. /explorer {staleest adjacent area}                ← default
    2. /explorer {same area, different category}
    3. /research {area}    (external-source companion run)
    4. /architect resume   (drain backlog)
    5. done
```

If zero items were accepted, frame the run as a successful pass over a healthy area. The point is signal, not action.

---

## Notes on use

- **Pair with `/research`** — run `/explorer` after a research session that touched a specific area, to immediately surface adjacent gaps the research run didn't cover.
- **Cadence** — daily or every-other-day is a reasonable rhythm. Coverage.md will tell you when the codebase is uniformly fresh and you should switch to `/architect` instead.
- **Coexist with uncommitted work.** Multiple CLIs and editor sessions share the working tree. Explorer never stashes, resets, or discards anything it didn't author. Each commit stages **only the specific paths** the explorer touched (`git add path/one path/two`); never `git add -A`, `git add .`, or `git add -u`. If an item's anchor file already has uncommitted changes from someone else, surface it: "this file already has changes — commit them first, or layer on top?" Default to layer-on-top if the user doesn't pick. Forbidden at all times: `git stash`, `git reset --hard`, worktree-touching `git restore` / `git checkout --` on paths the run didn't author, `git clean -f`. (`git restore --staged <path>` to unstage a foreign pre-staged file is allowed — it never touches the working tree.)
- **Drift signal** — if 3+ explorer runs in a row produce 0 accepted items, the calibration is off (severity bar too low, or area was wrong). Trigger a self-reflection: read the last 3 sweeps and ask the user "what shape would have actually been useful?"

## App context coverage

This repo is not Personas-managed: there is no `.personas/` dir and no memory
outbox to append to. The vault under `.vault/` IS the coverage record — keep it
current and skip any outbox step the engine mentions elsewhere.
