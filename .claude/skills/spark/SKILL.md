---
name: spark
contexts: tracked
memory: vault
category: workflow
description: Turn a vague product idea (a "sparkle") into a complete, grounded design through waves of select/multi-select questions - then orchestrate the build. Targets exactly which contexts/files the idea touches, scouts them before asking anything, converges the design across four perspectives (functional, UX, UI, performance/architecture), and executes via builder subagents in a worktree under Director review. Runs live in a memory vault (a linked Obsidian folder, or <repo>/.spark/ with the same schema); every run ends with a self-improvement retro that sharpens the skill itself. Per-repo specifics - vault path, gates, context map, host rituals, repo law - come from the overlay at .claude/spark/config.md, and the loop runs on defaults without it. Invoke with `/spark <idea...>` or `/spark resume <slug> | status | reflect`.
argument-hint: "<idea...> | resume <slug> | status | reflect"
version: 1.1.0
---

# Spark — sparkle in, fire out

> The operator's strength is *having* the idea; the model's strength is everything between the idea and the shipped commit: locating it in a large codebase, knowing what already exists, asking the few questions that actually matter, designing across perspectives the operator wouldn't pause on, and building without drift. `/spark` is that bridge. **One invocation = one idea, end to end: target → scout → design waves → brief → build → retro.** Multiple sparks run as parallel CLI sessions, isolated by worktrees and coordinated by whatever live-session ledger the repo keeps.

## Roles

- **Director (the main session).** Owns targeting, question design, the design brief, builder briefs, diff review, merge decisions, gates, vault writes, and the retro. Never delegates judgment.
- **Scouts (Explore subagents, read-only, cheap).** One per target context: current-state brief with `file:line` evidence. A surface only "exists" if it renders — trace mount points.
- **Builders (strong subagents, one per work package).** Tight brief + acceptance criteria + file scope; work in the spark's worktree; return structured reports; return questions instead of guessing.

## Project overlay

This file is the **method** and is repo-agnostic. Everything a repo *is* — its vault, gates, context map, host rituals, conventions, taste — lives in an overlay the Director reads in Phase 0. **Resolution order, first hit wins per key:**

1. **`.claude/spark/config.md` in the consuming repo** (tracked, so it travels with the clone and survives the vault, which is not version-controlled). This is the home.
2. **`$VAULT/<vault_subdir>/config.md`** — where earlier versions scaffolded the config. If it exists and the repo overlay does not, say so and offer to move it; if the repo overlay exists and *points at* the vault file for a section, read that section from the vault. Never silently maintain two copies of the same section.
3. **Defaults** — every key below has one. **The loop runs with no overlay at all**; when it does, say in the opening sentence that defaults are in force and what was detected.

Overlay shape: YAML frontmatter for scalars, markdown `##` sections for lists and prose.

```yaml
---
product: "<product name>"           # brief header  [the repo directory name]
stack: "<one-line stack>"           # brief header  [detected from the manifest, else "unknown"]
vault: ["<abs vault root>", ...]    # candidate roots, first existing wins  [<repo>/.spark]
vault_subdir: Spark                 # namespace inside the vault; "" = the root  [Spark]
context_map: context-map.json       # the targeting source  [context-map.json; absent -> see Phase 1]
base_branch: master                 # worktrees fork from / land on it  [detected from origin/HEAD]
active_runs_ledger: ""              # path of a live-sessions ledger if the repo keeps one  [none]
locale_count: 1                     # sizing multiplier for string-heavy work  [1]
---
```

| Section | What it carries | Default when absent |
|---|---|---|
| `## Gates` | `always:`, `when <condition>:`, `builder:` — the exact commands, verbatim | **only** what `.ai/manifest.yaml` `capabilities` declares (typecheck / lint / test); else the manifest's script names; else `say which gate you could not find and run none` |
| `## Rituals` | host-specific commands to run at named phases (see below) | none — the loop runs without them |
| `## Repo law` | the convention digest pasted verbatim into every builder brief; out-of-scope walls; where the authoritative rules file is | "read the repo's CLAUDE.md / AGENTS.md first; reuse before building" |
| `## Wave defaults` | wave size, perspective checklist overrides | one AskUserQuestion call of up to 4 questions; the Phase-3 checklist |
| `## Question taste` | learned — what this operator wants **asked** vs **decided for them** | empty; built by the retro |
| `## Skill improvement log` | append-only, one dated line per retro finding | created on first wrap |

**`## Rituals`** is the portability seam: anything the *host* repo demands that the method itself does not need. Each entry names a phase and a command, and the Director runs it at that phase and nowhere else. Typical entries: registering/deregistering in a live-sessions ledger (Phase 0 / Phase 6), capturing an operator correction to a decision ledger (Phase 3, same turn as the correction), running a translation pipeline before commit (Phase 5). **If the overlay declares no ritual for a phase, that phase has no ritual** — never invent one, and never import another repo's.

## The vault

Resolve `VAULT` = first existing `vault` candidate, else `<repo>/.spark/` — **the same schema either way**, still an Obsidian-openable folder. Then use `$VAULT/<vault_subdir>/`:

```
Spark/
  Spark.md                 # HOME: idea ledger table (slug - status - contexts - one-liner - last session),
                           #   fire count (shipped), link to last session
  config.md                # OPTIONAL - the legacy overlay home; see Project overlay resolution order
  ideas/<slug>.md          # one per spark, cradle-to-grave (see schema)
  sessions/<YYYY-MM-DD[-n]>.md  # immutable run records, end with `next:` pointer
```

**Idea note** (`ideas/<slug>.md`) — the atom of the loop:

```markdown
---
slug: <kebab, stable>        type: spark/idea
status: sparked | scouted | designing | designed | building | shipped | parked | dropped
contexts: [<context names>]          groups: [<groups>]
sparked: <date>   designed: <date|->   shipped: <date|->   commit: <sha|->
waves_used: <n>   questions_asked: <n>
---
## Spark          (the operator's words, near-verbatim - never paraphrase away intent)
## Targeting      (contexts chosen + why; contexts considered and excluded + why)
## Scout digest   (what exists today, file:line; what the idea collides with or can reuse)
## Design decisions   (one line per answered question: Q -> chosen option -> implication.
##                     Include options REJECTED - they are memory for the next wave and next spark.)
## Design brief   (the buildable contract - see Phase 4 schema)
## Build record   (work packages, builder reports digest, review verdicts, gate results, SHAs)
## Retro          (what the process got wrong/right on THIS idea - feeds the improvement log)
```

**Vault safety (non-negotiable):** the vault is not version-controlled and Obsidian file-recovery never sees agent writes. Never open-for-write a note you didn't create this session; session-note names collide — probe and suffix `-2`, `-3`. Re-read `Spark.md` immediately before every write; never patch from a stale Phase-0 copy. After any parallel phase, list the target dir and backfill missing notes from returned agent content.

## The loop

### Phase 0 — Recall & register
1. Read the overlay (§ Project overlay), resolve `VAULT`, read `Spark.md` (missing → scaffold the vault tree, and scaffold `.claude/spark/config.md` from what you **detected in THIS repo** — gates from its manifest/scripts, context map, ledger — never from another project's set).
2. Parse invocation: new idea text → new slug; `resume <slug>` → jump to the phase its `status` names; `status` → render the ledger table and stop; `reflect` → Phase 6 only.
3. Host rituals: run the overlay's Phase-0 `## Rituals` entries (typically a live-sessions ledger check + register — one bash invocation, since such a ledger is unsafe to edit-then-commit across concurrent sessions). Always run `git status` regardless: repos host parallel sessions, and foreign WIP is never swept into your commits. Scan the harness's auto-memory for veto signals.
4. Record the spark verbatim in `ideas/<slug>.md` (`status: sparked`).

### Phase 1 — Target (evidence, not vibes)
1. Read the overlay's `context_map`. **If the repo has no context map**, target from the repo's **top-level source directories** plus the scout's own findings, and say plainly in `## Targeting` that the partition is provisional — a wrong target is then a scout finding, not a silent miss.
   **Sizing rule when a map exists:** if two sources disagree about the partition (a committed export vs. the tool that owns it), say which you chose and why, and treat counts from the other as unusable for sizing.
2. Map the idea to **1-3 primary contexts** (where code changes land) and up to 3 **touched contexts** (integration points: stores, command/API surfaces, shared components, strings). Name them and the reasoning in `## Targeting` — including near-miss contexts you excluded, so a wrong targeting is diagnosable at retro.
3. If targeting is genuinely ambiguous (two plausible homes with different architectures), that is **wave-1 question #1** — never guess silently, never ask more than one targeting question.

### Phase 2 — Scout before asking
Launch one Explore scout per primary context (parallel, "very thorough"): what exists, what the idea overlaps/duplicates, reusable primitives (check the repo's shared-component catalog when the overlay's `## Repo law` names one), data model touchpoints, perf-relevant volumes, `file:line` evidence. Digest into `## Scout digest` (`status: scouted`).

**Grounding rule: no question reaches the operator that the code could have answered.** "Should this be a new tab or extend X?" is only a valid question if the scout confirmed X exists, renders, and could host it.

**Liveness rule (all three halves are required):**
1. A surface only "exists" if it RENDERS — trace every surface to an actual mount point.
2. A FIELD only "exists" if some query the consumer actually calls POPULATES it. For every field the design depends on, the scout names the query that fills it and confirms the consumer calls that query, not a leaner projection of it.
3. For any DERIVED store the design moves or rebuilds, name the function that regenerates it — or state that none exists.

Also required of every scout that maps shared render helpers or models: enumerate OTHER CONSUMERS of them, and **show the grep or command that produced the list** rather than asserting it — extension-site checklists are otherwise silently incomplete.

> Paid for in blood: a sibling loop shipped against a component with zero mount points, and a spark built a correct parser against a field the consumer's query returns blank by design. Same failure, one level apart.

### Phase 3 — Design waves (the heart)
Converge the design through **waves of AskUserQuestion** (each call = up to 4 questions; single-select for architecture forks, multiSelect for scope composition). **There is no wave cap** — a large feature legitimately takes a long dialog. The loop terminates on *clarity*, not on count: after every wave, re-run the completeness checklist below; iterate while any item is genuinely open, stop the moment none are. The discipline is per-question, not per-run: every question must be one whose answer changes the design — an unnecessary question is a flaw at any wave number, and ten necessary waves are not.

**Wave composition — questions are ordered by decision leverage, not by perspective:**
- **Wave 1 — shape:** the questions whose answers change everything downstream. Scope boundary (multiSelect: which of these 4-6 scouted capabilities is v1?), the one architecture fork, the primary user moment, targeting disambiguation if needed. **Order metaphor/shape questions before presentation questions** — a presentation answer given before the metaphor settled has to be re-asked.
- **Middle waves — perspectives sweep:** work through the perspectives *still genuinely open* after the shape settled: **functional** (edge behaviors, empty/error states), **UX** (entry point, flow, what the user sees while waiting), **UI** (which shared primitives, where it lives visually), **performance/architecture** (data volume, caching, sync vs background, engine impact). Deep ideas may need several waves inside one perspective — follow-up questions that only became possible after the previous answer are the sign the dialog is working, not drifting.
- **Final wave — residue:** whatever the checklist pass still marks open. If a wave's answers OPEN more items than they close for two consecutive waves, the spark is compound — propose splitting it into two ideas rather than continuing.

**Question craft rules:**
1. Every option is a real, scouted, buildable choice — description names the trade-off in one line. Put your recommendation first, marked "(Recommended)". **Write the condition into the option text**: when an option's risk is conditional, name the condition, so an override arrives with its mitigation already agreed.
2. **Decide, don't ask, when convention already answers:** the repo's own conventions (strings, tokens, shared components, error handling, loading UX — the overlay's `## Repo law`) are never questions. Consult `## Question taste` — it accumulates what this operator wants asked vs. decided for them. Operator "Other" answers and corrections are the strongest taste signal; when the overlay declares a Phase-3 correction-capture ritual, run it in the same turn as the correction.
3. **An answer may be a DOCTRINE rather than an option pick.** When the reply reframes the question, treat it as a course correction: re-scope, and re-scout if it created a new code question.
4. After each wave, write `## Design decisions` immediately (chosen AND rejected options) — a killed session must lose nothing.
5. **Completeness gate before leaving Phase 3** — the perspective checklist, answered either by operator choice, convention, or explicit Director decision (marked as such): functional scope, data model and persistence, command/API surface, UX flow plus all async/empty/error states, UI surfaces and shared-component reuse, strings/i18n plan, performance posture, failure modes, doc surfaces affected, out-of-scope list.

### Phase 4 — The brief & the go-gate
Write `## Design brief` in the idea note:

```markdown
### Summary        (three sentences a PM would sign)
### Work packages  (1-4, each ONE builder session: files touched, what changes,
                    acceptance criteria 3-6 checkable bullets)
### Data & API     (schema/migrations, new commands/endpoints, generated types to regen)
### UX/UI spec     (per-surface: states, components from the catalog, tokens, loading pattern)
### Strings        (sections touched; the overlay's translation ritual, if any, runs before commit)
### Non-goals      (explicitly rejected options from the waves)
### Risks
```

**Contract completeness:** when packages build in parallel against this brief, it must name every **wire-level identifier** — type names, field names, command/parameter names, enum string values, key formats — not just types and shapes. A renamed argument that the contract did not carry is the defect this rule exists for.

Gate with one AskUserQuestion: **Build now / Adjust (say what) / Park it** (`status: designed`). "Adjust" loops one targeted wave, not a restart. "Park" is a first-class success — a designed-but-parked idea is a shippable asset in the vault.

### Phase 5 — Fire (execution)
1. `git worktree add .claude/worktrees/spark-<slug> -b worktree-spark-<slug>` from `base_branch` — all multi-file work isolates. The repo's own parallel-safety law (overlay `## Repo law`) applies in full: stage per file, verify the staged set against your intent before every commit, never stash, never `git add -A`.
2. One builder per work package, sequential when packages share files, else parallel. Brief = the work package + the overlay's `## Repo law` digest + the `## Gates > builder` commands + "state the constraint and the evidence, and counter-propose rather than guess". **Assign a cross-cutting property (encryption, auth, audit) to the FIRST package that creates data subject to it**, never to a later one — otherwise the branch has a real intermediate state that violates it.
3. Director reviews every diff against acceptance criteria (not vibes), runs the overlay's `## Gates`, fixes-or-bounces, commits atomically per package. Builder refusals backed by evidence are signal, not disobedience. Any Phase-5 ritual the overlay declares (a translation pipeline, a codegen regen) runs before the commit it belongs to, not at the end.
4. Doc-sync: update the doc surfaces the overlay maps for the touched areas, in the same session. If the repo has an automated doc-sync check, ask the scout in Phase 2 whether the target paths are covered by it at all — a check that never fires reads exactly like a check with nothing to say.
5. Merge to `base_branch` only when all gates are green; then remove the worktree + branch. `status: shipped`, record SHA. **Live verification is an optional follow-up note, never a blocking phase** — record the surface and the selectors to drive in the idea note and in `Spark.md`, and ship.

### Phase 6 — Retro (the self-improving mechanism)
Before running the overlay's Phase-6 rituals, the Director audits **the process, not the product**, and writes `## Retro` + appends dated one-liners to the overlay's `## Skill improvement log`:
- **Targeting accuracy:** did the build touch contexts targeting missed, or skip ones it named?
- **Question efficiency:** which questions changed nothing downstream (should have been convention)? What did the operator answer via "Other" that the options should have contained? Mirror any correction's lesson into `## Question taste`.
- **Scout misses:** anything the builders discovered that the scout should have surfaced?
- **Execution friction:** gate failures, builder bounces, rework — and the upstream design decision that would have prevented each.
- **Skill edits:** if >=2 sessions' logs point at the same flaw, propose a concrete edit to THIS file — gated with the operator, never silent. A repo-specific lesson goes to the overlay, never to this file.

Wrap: session note with `next:` pointer, update `Spark.md` ledger, run the overlay's Phase-6 rituals (typically deregistering from the live-sessions ledger with the SHA).

## Invariants
- One spark per session by default; the vault + worktrees + whatever ledger the overlay names are what make many parallel sparks safe.
- The operator's verbatim spark text is sacred — design converges *toward* it; scope creep beyond it needs an explicit question.
- Waves are uncapped; clarity is the terminator. Each question must earn its place; the checklist decides when the dialog is done. Two consecutive waves that open more than they close → propose splitting the spark.
- Never mark shipped on a typecheck alone — the overlay's gates run, and UI work gets observed, not assumed.
- **Never paste one repo's overlay into this file.** A project copy that did so shadowed the shared copy unnoticed.

---

## Skill Reflection

After the run's real work is done, reflect twice — autonomously, without asking the user. Be honest about volume: most runs produce NOTHING for lane 2. An empty reflection is a valid result; a forced lesson is pollution. Calibration: nothing (common) / one line (sometimes) / a lesson entry (occasionally) / a redesign proposal (rare).

Lane 1 — PROJECT learnings (what the next session in THIS repo needs): write via the MEMORY BLOCK contract if this prompt carries one, else append node lines to `.personas/memory-outbox.jsonl` per that contract. Repo-specific rules go to the overlay, never to this file.

Lane 2 — METHOD learnings (what would improve THIS SKILL for every project):
1. If nothing generalizes beyond this repo, stop here.
2. Append an entry to `LESSONS.md` in this skill's directory: `## <version-used> - <YYYY-MM-DD> - <project-name>` followed by `- ` bullets (create the file with a `# Lessons - <skill>` heading if absent). Record the version the run USED, not a bump target. Wrap a bullet in a `### Redesign proposal` sub-block when it argues for a methodic redesign you are NOT applying now.
3. Version bump — ONLY when you also edit SKILL.md to apply the improvement in the same change: minor (1.1.0 → 1.2.0) for a prompt/step refinement, major (1.x → 2.0.0) for a methodic redesign, patch for wording. Update the `version:` frontmatter field. Never bump without an applied edit; never edit the method without a bump.
4. Sync ritual (only when you bumped): (a) commit the skill directory as a STANDALONE commit on the current branch — message `skill(<name>): v<new> - <one-line reason>` — containing nothing but this skill's files (check `git ls-files` shows `SKILL.md` in the same casing as its siblings; `core.ignorecase` hides a lowercase `skill.md` that breaks discovery on the first case-sensitive clone); (b) propagate to the canonical copy this repo consumes the skill from — the registry lane, or `~/.claude/skills/<name>/` — the METHOD only, never a repo's overlay. EXCEPTION: read `.personas/skill-registry.json` first — if the library already carries a HIGHER version than yours, do not overwrite it; keep your lesson in LESSONS.md and note the version conflict in the entry.

Sibling awareness: `.personas/skill-registry.json` (repo root, when present) lists this skill's installed version, the workspace library version, and which sibling projects run it at which version with recent usage. Use it to judge whether a lesson is worth a bump (heavily-used siblings raise the bar for majors) and to notice you are BEHIND (library newer than yours → prefer recording the lesson over editing a stale method).
