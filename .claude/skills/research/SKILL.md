---
name: research
description: Extract actionable improvements for Gravitone Studio from external sources (video, blog, article, raw text). Scores ideas against context-map.json, buckets into Code (execute now) / Direction (file for /perfect) / Reference (a decision for when the backend lands) / Craft (durable know-how about MAKING content, written into knowledge/), and persists findings to the .vault/ memory vault. Craft mode is the grounding engine: it reverse-engineers the NARRATIVE COMPOSITION of exemplar work — the beat chain, the causal links, the turns — and turns it into per-step documentation the studio's UI is designed against.
argument-hint: "[source or question]"
category: Maintenance
memory: vault
---
# Research

Extract actionable improvements for **Gravitone Studio (`gravitone-gcloud`)** from any external
source (YouTube video, blog post, article, raw text). Score ideas against the codebase, bucket into
Code / Direction / Reference, execute the code ones in-session, and persist everything to the vault.

This skill is tuned to this repo: a UI-first Next.js 16 / React 19 / Tailwind v4 prototype of a
content-production studio (five phases + an asset library) running entirely on mocked fixtures in
`app/_studio/`. It uses `context-map.json` at the repo root — a **Personas app export** (see Constants) — for relevance scoring
and the vault at `C:/Users/mkdol/dolla/gravitone-gcloud/.vault` for long-term memory.

**The stage matters for triage.** There is no backend, no auth and no third-party service here yet,
and that is deliberate. A source's idea about model providers, pipelines, queues or hosting is not
out of scope — but it lands as a **Reference** (a decision to make when the backend is designed),
not as code to write today. Ideas about the *interface* to that future backend — what a surface must
be able to show, what a fixture must be able to say — are the highest-value findings this skill can
produce, because they are cheap now and expensive later.

## Input

Ask the user, in this order:

1. **"What is the source? Paste a YouTube URL, an article URL, or raw text."**
2. **"Any focus hint? (`code` / `direction` / `reference` / `craft` / `all`) — defaults to `all`."**

   `craft` is the mode to use when the source is *exemplar work* rather than commentary — a video,
   an article or a script whose craft we want to reverse-engineer. It changes the run's shape: the
   output is a knowledge-library entry (§ Bucket D), and the ingestion phase keeps a measured corpus
   instead of discarding the transcript. When the user names a template step ("script step", "how do
   we do frames"), assume `craft`.

Wait for both answers before proceeding. Do NOT ask anything else upfront — further questions only if a phase requires clarification.

---

## Constants

- **Codebase reference files** (all in the repo, all small enough to read whole):
  - `context-map.json` (repo root) — always loaded; the relevance-scoring surface.
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
  - `README.md` — what the product is, what is deliberately mocked, and the design language's rules. Always loaded.
  - `components/ui/tokens.ts` — the design system and the only file allowed a colour literal. Load whenever a finding touches visuals.
  - `app/_studio/types.ts` + `projectTypes.ts` — the data model of the fictional production. Load whenever a finding touches what the product *knows*.
  - The parent project `../arm/gravitone/web` (and its `DESIGN.md`) is where this design language was built — consult it when a finding asks "has this already been solved here?", but never edit it from this repo.
- **Obsidian vault:** `C:/Users/mkdol/dolla/gravitone-gcloud/.vault`
  - `Research/` — one note per run
  - `Lessons/` — self-reflection notes
  - `Patterns/user-preferences.md` — distilled rules across runs
  - `00 - Index.md` — vault entry point
- **The craft baseline:** `knowledge/CRAFT-BASELINE.md` — the cross-cutting storytelling theory
  (but/therefore, information-gap curiosity, nested loops, anecdote/reflection, SCQA). **Read it
  before any craft run.** It defines the failure mode craft research exists to prevent.
- **The engine catalogue:** `knowledge/ENGINES.md` — the 7 narrative engines, cross-template. A craft
  run names its source's engine against this list; **finding a new one is a headline result** and
  belongs here, not in a per-template PATTERNS. Engines are length-independent — Engine B was observed
  at 2:08 and again at 0:40 unchanged — so never file one under a duration.
- **The tone layer:** `knowledge/TONE.md` — what is a voice dial and what only looks like one. Before
  recording any per-1k measurement as a style finding, check §2: hedging, numeric density and causal
  density are determined by subject and engine, NOT by the creator, and mis-filing them as tone is how
  a personalisation layer starts producing incoherent scripts.
- **The knowledge library:** `knowledge/` at the repo root — versioned craft documentation, one
  folder per template step (`knowledge/templates/<template>/steps/<nn>-<step>/`). Read
  `knowledge/README.md` for the evidence contract before writing anything into it. This is where a
  `craft` run's real output goes; `.vault/` only gets the run record.
- **The direction backlog:** `.vault/Perfect/directions/` — every idea `/perfect` has proposed,
  accepted, shipped or rejected. **Read it before presenting a Direction finding**: a "new" idea the
  user already rejected must be presented as a re-open with the reason it was dropped, or not at all.

---

## Phase 0: Bootstrap Vault (one-time)

Check if `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/00 - Index.md` exists. If not, create the structure:

```
C:/Users/mkdol/dolla/gravitone-gcloud/.vault/
  00 - Index.md
  Research/
  Lessons/
  Patterns/
    user-preferences.md
```

`00 - Index.md` content:
```markdown
# Gravitone Studio Memory Vault

Long-term memory for the `/research` skill and the other adopted skills in this repo.

## Folders
- [[Research/]] — one note per `/research` run, source + extracted ideas + triage decisions
- [[Lessons/]] — self-reflection notes from each `/research` run (what was rejected and why)
- [[Patterns/]] — distilled rules across runs ([[Patterns/user-preferences|user preferences]])

## Conventions
- Research notes: `YYYY-MM-DD-{slug}.md` with frontmatter (source, date, accepted, rejected)
- Lessons notes: `YYYY-MM-DD-research.md` — append-only, one block per run
- Patterns are upgraded from Lessons after a rule has been observed 3+ times
```

`Patterns/user-preferences.md` content:
```markdown
# User Preferences (distilled from /research runs)

> Rules upgraded from `Lessons/` after 3+ observations. Loaded by `/research` Phase 1.

_No patterns yet. Will be populated as runs accumulate._
```

---

## Phase 1: Load Context & Memory

### 1a. Determine which reference files to load

The whole repo is 32 mapped files, so "load the context" is cheap here — do it properly rather than
guessing from filenames.

| Focus | Files loaded |
|---|---|
| `code` | `context-map.json` + `README.md` + the contexts the source plausibly touches |
| `direction` | the above + `.vault/Perfect/directions/` (every prior proposal and its fate) |
| `reference` | the above + `package.json` (what the repo actually depends on today) |
| `all` (default) | all of it |

`context-map.json` and `README.md` are **always required**.

### 1b. Verify required files exist

- If `context-map.json` is missing → stop and ask for a Personas scan (Dev Tools → Context Ledger).
  Never write one: it is an export, and a hand-written file is erased by the next scan while
  silently outranking nothing.
- If `.vault/` is missing → create it (first run in a fresh clone; it is gitignored).

### 1c. Read and absorb the loaded files

Read each loaded file in full:
- **`context-map.json`** — *where* code lives (4 groups, 4 contexts, `file_paths`, `keywords`, `entry_points`, `cross_refs`).
- **`README.md`** — *what the product is*, what is deliberately mocked, and the design language's rules.
- **`components/ui/tokens.ts`** — the design system; the only file allowed a colour literal.
- **`app/_studio/types.ts`** — the data model of the fictional production.

The single most important fact about this codebase: **it is a prototype with no backend, on purpose.**
Every surface renders fixtures. That makes ideas about *interface, honesty and information design*
directly actionable, and ideas about *infrastructure* premature-but-worth-recording (Bucket C).
Scoring a hosting or model-provider idea as "High relevance, implement now" is the characteristic way
this skill goes wrong here.

### 1d. Check map freshness

The map is as fresh as the last Personas scan — `generated_at` and `provenance.git_commit` say when.
Verify every `file_paths` entry exists and every file under `app/` and `components/` appears in a
context. **Do not fix it yourself** (export-only); report it:
```
Warning: context-map.json is stale — {N} missing paths, {M} unmapped files, last scanned {date}.
A rescan in Personas will refresh it; scoring against the current map regardless.
```

### 1e. Load memory

Read in order:
1. `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/Patterns/user-preferences.md`
2. `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/Architect/strong-patterns.md` (if present) — these are the canonical shapes the codebase already does well. When a code-bucket finding's attachment point matches a strong pattern, prefer "extend the existing strong pattern" over "build something new" in Phase 6/7. Cite the strong pattern in the per-idea detail under an `Aligns with:` line.
3. The 3 most recent files in `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/Lessons/` (sorted by filename, descending)

These inform extraction priorities and what to deprioritize.

---

## Phase 1.5: Register in the Active-Runs Ledger

Multiple CLI sessions often work in parallel on this checkout, on the same branch, without branching. The `.vault/active-runs.md` ledger is the coordination surface for them. Touch it twice: once here at session start, once in Phase 13.

Full design and rationale: [`docs/architecture/cli-coordination.md`](../../../docs/architecture/cli-coordination.md). Format conventions live at the top of the ledger file itself (see also `.claude/CLAUDE.md` → "Concurrent CLI sessions").

### 1.5a. Read the ledger and check for conflicts

Read `.vault/active-runs.md`. Scan the `## Active` section. For each entry:

- **Live conflict:** entry status is `started` AND timestamp is **less than 2 hours old** AND any of its declared `Paths` overlaps your planned scope.
- **Overlap rule:** a planned path is a prefix of an active path, an active path is a prefix of a planned path, OR the two are equal.
- **Stale (`started` >2h ago):** mention to the user in your next text update; do NOT silently rewrite the other session's entry.

Your **planned scope** for `/research` is approximately:
- `.vault/Lessons/{date}-research.md` (always — shared-by-date file, but Edit-not-Write rule already handles concurrent writers)
- `.vault/Research/{date}-{slug}.md` (always — per-run slug, no collision risk)
- The directories of accepted findings' file anchors (varies — `app/_phases/`, `app/_studio/`, `components/ui/`, `context-map.json`)
- `.vault/active-runs.md` itself (always — coordination surface, expected overlap)

You don't know all final paths until Phase 6/8. The Phase 1.5 declaration should be a conservative best guess based on the source type and focus hint; update later via Edit if scope changes materially in Phase 6.

### 1.5b. Conflict resolution

If a live conflict exists (overlap on something other than `.vault/active-runs.md`), ask the user:

```
Active session conflict detected:

  [<their-timestamp>] <their-skill> — <their-slug>
  Paths: <their-paths>
  Overlap with your plan: <overlapping-path(s)>

Options:
  1. Abort this run.
  2. Coordinate manually — you'll resolve before continuing.
  3. Proceed with awareness — both runs in flight, you accept the merge risk.
```

Honor the user's pick. Default behavior on no answer: ask once more, then proceed-with-awareness rather than aborting silently.

Overlap on `.vault/active-runs.md` alone is **expected** — it's the coordination surface. Do not flag that as a conflict.

### 1.5c. Append your entry under `## Active`

Use the entry format from the top of the ledger:

```markdown
- **[YYYY-MM-DD HH:MM] /research — <slug>**
  - **Source:** <url-or-pasted-or-text-hint>
  - **Paths:** <best-guess directories or globs>
  - **Status:** started
```

The `<slug>` should match the one you'll use in Phase 9's Research note path (kebab-case from the source title, ≤40 chars). Timestamp is local time.

If your Edit fails because the ledger has changed (another session edited it between your Read and Edit), re-read and retry. The Edit tool's unique-old-string rule prevents silent clobbers — a failed Edit is a hint to re-check for conflicts before retrying.

---

## Phase 2: Source Ingestion

Detect source type from the user's first answer:

### 2a. YouTube URL
Patterns: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`

Check `yt-dlp` is installed:
```bash
yt-dlp --version
```

If missing, abort with:
```
yt-dlp is not installed. Install it with one of:
  - winget install yt-dlp
  - pip install yt-dlp
  - Download from https://github.com/yt-dlp/yt-dlp/releases
Then re-run /research.
```

Otherwise, extract auto-generated subtitles:
```bash
mkdir -p .research-cache
yt-dlp \
  --skip-download \
  --write-auto-sub \
  --sub-lang en \
  --sub-format vtt \
  --output ".research-cache/%(id)s.%(ext)s" \
  "<url>"
```

Parse the resulting `.vtt` file:
- Strip WEBVTT header
- Strip cue settings and styling
- Collapse consecutive duplicate lines (auto-subs repeat heavily)
- Keep timestamps in `[HH:MM:SS]` format every ~30 seconds for citation

If no `.vtt` was produced (some videos have transcripts disabled), report the issue and ask the user to paste the transcript manually or provide an alternative source.

**Cleanup (MANDATORY, scoped to THIS run's video id):** as soon as the cleaned text is in working memory, delete the cache files this run created. Do this before Phase 3 starts — not at the end of the run, where a mid-run failure or context exhaustion would leave strays.

```bash
# Replace <id> with the actual video id used in --output above. Glob covers
# both the .vtt and any .clean.txt / .cleaned.txt sibling some scripts emit.
rm -f .research-cache/<id>.* 2>/dev/null
```

Rules for the cleanup:
- **Scope strictly to this run's id.** Never sweep `.research-cache/*` blindly — that races with any parallel research run on the same machine and could delete another run's working files.
- **Idempotent on failure.** If the rm fails (locked file, etc.), log it as a `cache_cleanup_skipped` note in the Lessons block but continue — leaving cache is not a run-blocking error.
- **Verify in Phase 11.** The final summary's "Files updated" block should include `Cache: cleaned` (or list the residue path if cleanup failed) so the user has a one-line signal that this run did not pollute `.research-cache/`.
- **`.research-cache/` is gitignored** (see repo `.gitignore`). Stragglers from old or interrupted runs no longer surface in `git status`, but they DO accumulate on disk — `/research` runs are the only legitimate cleaner. Don't rely on git status to remind you.

### 2a-craft. YouTube URL in CRAFT mode — map the composition, then measure it

In `craft` mode the transcript is **evidence, not scratch**: it is what every later claim cites, so the
cleanup rule above is suspended and replaced by this one.

> **The order below is the whole method, and it was wrong once.** An earlier version of this skill
> said "measure before reading". That produces a run full of words-per-minute and hedging densities
> and no understanding of why anyone watched — surface features of delivery, mistaken for craft. **The
> composition is the finding. The metrics are an appendix.** If a craft run's headline output is a
> table of rates, it has failed regardless of how accurate the table is.

1. **Pull both subtitle tracks and the metadata.** Manual/edited captions are punctuated and support
   sentence-level analysis; ASR captions do not, and which you got constrains what you may claim.
   ```bash
   yt-dlp --skip-download --write-auto-sub --write-sub --sub-lang "en.*" --sub-format vtt \
     -o "%(uploader)s--%(id)s.%(ext)s" "<url>"
   yt-dlp --skip-download --print "%(uploader)s | %(title)s | %(duration)ss | %(upload_date)s | views=%(view_count)s" "<url>"
   ```
2. **De-overlap at WORD level.** YouTube rolling captions repeat each cue's tail at the next cue's
   head; a line-level dedupe leaves ~2× the real word count. Use
   `knowledge/templates/<template>/steps/<nn>-<step>/corpus/parse_vtt.py`. **Sanity-check wpm before
   trusting anything** — over ~280 wpm means the de-overlap failed, not that the narrator is fast.
3. **READ THE WHOLE THING.** Not sampled. For a long source, read it in 90-second windows so the
   argument's movement stays visible. Length is not an obstacle — a long video is the *clearest*
   place to see a beat structure, because the engine runs enough turns to become legible.
4. **Map the beat chain.** This is the actual deliverable. For each beat: its timestamp, its one-line
   claim, and **the connector to the previous beat — `BUT`, `THEREFORE`, or `AND THEN`**. Write it as
   a diagram (see `sources/economics-explained--north-korea.md` for the reference shape). While
   mapping, mark:
   - **the question(s) asked aloud** — these are usually the act boundaries and the promise structure;
   - **the turns/reversals** — where the argument changes direction, with the quoted line;
   - **the analogies**, and which mechanism each was spent on;
   - **the scale conversions** — where a raw number becomes something felt;
   - **the hook's shape** (SCQA? in medias res?) and **where the thesis is actually stated**;
   - **the close** — reframe, payoff, or recap.
   If the source has genuine `AND THEN` links, that is a finding too — note where and why it survives.
5. **Name the engine.** What is the viewer's pleasure — being corrected? the disproportion between
   effort and reward? pattern recognition? being oriented on something new? Compare against
   `knowledge/ENGINES.md`; if it is none of them, you have found a new one, which is a headline result
   and gets a new section there.
   **Separate the skeleton from the execution.** A source can carry a genuinely useful engine while
   being a poor model for honesty — catalogue the structure, and say plainly and specifically why the
   execution should not be copied. `ENGINES.md` § D-honest vs D-rigged is the worked example: three
   structural tells, each checkable without holding a position on the subject. A library that cannot
   distinguish "good skeleton" from "good work" will teach a generator to produce persuasive
   nonsense.
6. **Now measure**, with `corpus/metrics.py <file>=<duration_s>`: words, wpm, sentence stats
   (punctuated sources only), connective density, pronouns, numbers. **Interpret every figure as a
   consequence of the engine**, never as an independent dial. Zero hedging is not a style choice; it
   is what a knowable subject produces.
7. **Commit the corpus** into the step's `corpus/` folder (stamped transcript + the two scripts).

**Length rules for craft sources.** A source far longer than the template's target is fully usable —
say so in the teardown's first line, map it at full length, and mark compressed timings INFERRED. Do
NOT skip a good source for being long; DO refuse to state its act durations as short-form guidance.

### 2b. Other URL
Use `WebFetch` with a prompt asking for the article body, stripped of nav/footer/ads.

### 2c. Raw text
Use as-is.

**Sanity check:** if the resulting text is <300 words, report it's too thin to harvest meaningful ideas and stop.

> **Source-type agnosticism confirmed.** Runs 1-5 used YouTube videos (Phase 2a); run 6 used a blog article (Phase 2b WebFetch). Both paths produced the same downstream shape — same frontmatter, same Phase 6 rules, same output formats. The skill is source-type agnostic; do not special-case downstream phases based on whether the source came from 2a, 2b, or 2c.

---

## Phase 2.5: Web Augmentation (technique/tooling lookup)

YouTube transcripts (and many talks/articles) name a tool or technique without explaining how it actually works. A speaker says "we use Sieve for the video step", "we agentic-RAG the docs", "we route through OpenRouter" and moves on — leaving the cleaned text technique-shaped without enough depth for a clean Phase 6 evidence pass. This phase fills that gap with a **bounded** web round.

### 2.5a. Decide whether to run

Run web augmentation when **all** of these hold:
- The cleaned source text references at least one **named tool, framework, model, library, protocol, technique, or workflow pattern** that is non-obvious from the transcript alone
- A correct Phase 6 evidence pass would benefit from knowing how that thing actually works (API shape, key concepts, integration points, current pricing/auth model)
- The reference is not already covered by `README.md` or the parent project's `../arm/gravitone/web/DESIGN.md`

**Skip the phase** when the source is fully self-contained (e.g. a philosophical article, a product launch where the post itself IS the spec, or raw text the user already curated for the run). Don't run web augmentation on every source — it costs tool calls and can drift into rabbit-holes.

### 2.5b. Build the lookup list

From the cleaned text, list the candidate names — typically 1-5 items. For each, record:
- `name` — exact spelling as it appears in the source
- `kind` — `tool` | `framework` | `model` | `library` | `protocol` | `technique` | `workflow_pattern`
- `why_useful` — one line on how a deeper definition would change Phase 6 framing

Drop items that are:
- Already a dependency in `package.json`, or already solved in `components/ui/` — those are catalog hits, not augmentation candidates
- Generic primitives (`HTTP`, `JSON`, `webhook`) — no augmentation value
- Brand names of commodities the speaker only name-drops without using (`AWS`, `npm`, etc.)

### 2.5c. Run the lookup (bounded)

For each surviving candidate, prefer one focused query over many shallow ones. Cap at **3 web calls total** for the phase — this is augmentation, not full research.

- **First** try `WebSearch` with `<name> <kind> <year>` (e.g. `Sieve video API 2026`). One query is usually enough to surface the canonical product page or docs URL.
- **Then** `WebFetch` the single most authoritative result (vendor docs, RFC, GitHub README) with a prompt like: *"Extract the core concept, API surface, auth model, and how it would integrate with a desktop AI agent app. Skip marketing copy."*
- If the candidate is a YouTube creator's house technique (no canonical doc page), search for `<creator name> <technique>` and pick the best blog-post or follow-up video transcript.

Stop early once the technique is understood. Do NOT fetch every result.

### 2.5d. Capture the augmentation note

For each looked-up item, write a 2-4 sentence note in working memory:
- **What it is** (one sentence)
- **How it works at a high level** (one sentence — the load-bearing technical fact)
- **Integration shape** (one sentence on auth model / API surface / boundary of responsibility)
- **Why it matters for this studio** (one sentence — does it suggest a code change, a product direction, or a reference for the future backend?)

These notes are scratch — they feed Phase 3 (better extracted-idea quality), Phase 5 (better bucket assignment, especially separating "credential candidate" from "library to wrap"), and Phase 6 (better grep terms — knowing the protocol name lets you grep for the right thing).

### 2.5e. Write the cited URLs into the Research note

In Phase 9, the Research note frontmatter gets a new optional list:
```yaml
web_augmentations:
  - { name: "Sieve", url: "https://www.sievedata.com/...", kind: "tool" }
```
This makes the augmentation traceable on future re-reads and prevents re-fetching on Phase 3 cross-checks of `descoped-reopenable.md`.

### 2.5f. Anti-patterns

- **Don't run augmentation to validate the speaker's claims.** That's `/research`'s next phase (Phase 6 evidence against the codebase). The web round is for technique definition, not opinion-checking.
- **Don't quote the augmentation source as a Phase 7 source anchor.** The source anchor still belongs to the original transcript/article — augmentation only sharpens framing.
- **Don't escalate a web-augmentation discovery into a finding on its own.** If WebSearch surfaces "this product also has a credential-relevant API the speaker didn't mention", that's a candidate idea for the original source's surface area, not a new source. Add it as an extracted idea in Phase 3 with `source_anchor: "(web augmentation, not in transcript)"`.

---

## Phase 3: Raw Idea Extraction

From the source text, extract 5-15 distinct ideas. Each idea must be:
- A concrete technique, pattern, tool, or recommendation (not opinions or filler)
- Grounded in a specific quote or timestamp from the source
- Standalone enough to be evaluated independently

For each idea, capture:
- `title` — short imperative phrase (<60 chars)
- `summary` — 1-2 sentences
- `source_anchor` — quote (≤20 words) or `[HH:MM:SS]` for video sources
- `tentative_bucket` — your initial guess: `code` / `template` / `credential` / `unclear`

Apply memory-informed filtering: if `Patterns/user-preferences.md` says "user rejects migration ideas" or similar, deprioritize matching ideas (still extract, but mark `low_priority: true`).

**Also check `Patterns/descoped-reopenable.md`** (if it exists) for findings that were previously descoped but may now be viable due to changed ecosystem conditions. If any apply to the current source, surface them explicitly in Phase 7 as "previously descoped, reconsider?" items alongside the new findings.

### Source-type yield calibration

Different source types produce different finding profiles. **A "low" finding count is not a failure mode if it matches the source type's expected yield.** Don't force extraction past the natural limit just to hit a number.

| Source type | Expected yield | Typical pattern |
|---|---|---|
| **Technical interview / engineering talk** | **densest** — 3-5 strong findings with concrete file anchors | Run 3 (Codex/Bolin): 3 accepted findings + 1 security escalation. Interviews with engineers on specific systems often reveal architectural critiques that map directly to codebase gaps. |
| **Feature walkthrough / dev-focused demo** | dense — 3-4 findings with mix of code + template ideas | Run 1 (A2A Gateway): 4 accepted findings. Run 2 (Everything is a CLI): 4 accepted findings. Demos that show a specific workflow tend to produce at least one clear architectural finding. |
| **Product demo / competitor walkthrough** | **low + many catches** — 1-3 real findings, 5-10 "already existed" catches | Run 4 (Paperclip): 2 findings, **8 already-existed catches**. Product demos of competing systems are high signal for the host-first rule because every feature demonstrated is potentially "does this studio have this?". Expect the catch count to exceed the finding count. |
| **Philosophical / forward-looking article or video** | low — 1-2 findings, mostly discovery-brief territory | Run 5 (Karpathy LLM Wiki): 2 accepted findings + 7 already-existed (the skill's own prior iteration had already implemented the core insight). Philosophical sources often produce narrow deltas against existing implementations. |
| **Product launch article** | low-medium — 1-3 findings including at least one scaffolding-shaped finding | Run 6 (Claude Managed Agents): 2 findings, one of which became a theoretical scaffolding handoff (Option C). Launch articles frequently describe gated/preview features that fit Option C. |
| **Blog post / raw text** | varies widely | Phase 2b and 2c work the same as 2a downstream; the yield depends on content density, not transport. |

**If the finding count feels low, check the source type first.** If the source is a product demo and you have 7+ catches, that's a successful run, not a failed one. Surface the catch count prominently in Phase 7 as the primary metric for low-finding runs.

---

## Phase 4: Relevance Filter

For each idea, score relevance against `context-map.json` (4 context descriptions + their `keywords` arrays are the scoring surface — the keywords were written by the scan and match better than the prose):

- **High** — keywords clearly match a context group's keywords/description; specific files/entry points are obvious anchors
- **Medium** — partial keyword overlap or description similarity, no clear file anchor
- **Low / drop** — no plausible attachment point in any context group

**Drop all `Low` ideas.** Don't waste user attention on out-of-scope material.

**Scoring honesty — evidence caps the score.** Phase 4 scores are provisional keyword matches; they become final only after Phase 6. A finding may carry `Relevance: High` into Phase 7 **only if** Phase 6 actually read or grepped the anchor file(s) in this session and the finding cites the resulting `file_path:line` evidence. "Sounds applicable to the studio" without a code read caps the score at `Medium` and the Evidence line must say `unverified — keyword match only`. Never present an unverified finding as High just because the source is compelling — the 2026-04-08 catalog-vs-runtime misframe came exactly from scoring on vibes instead of code.

If the focus hint was `code` / `templates` / `credentials`, drop ideas that don't match the chosen bucket (after Phase 5 reclassification).

---

## Phase 5: Bucket Classification

Re-evaluate each surviving idea and assign a final bucket. An idea may belong to **multiple** buckets — that's fine, present it once but flag all applicable buckets.

### Bucket A — Code Improvement
A change to existing code that fits in this session. Examples:
- "Represent the refused cue as a state on the cue, not a toast"
- "Hoist the repeated shot-state chip into `_studio/assetParts.tsx`"
- "This surface can't render an empty shelf — a filter matching nothing shows a blank panel"

Required output: target file(s) in this repo, component/function name, and evidence the gap exists
(`file_path:line`, read in this session).

### Bucket B — Direction
A change too big for one research session — a new surface, a re-think of a phase, a capability the
product doesn't have. This is not a lesser bucket; it is the bucket that feeds `/perfect`. Indicators:
- It changes what the product *is*, not how a file is written
- It needs the user's judgment on product value before any code is right
- It would touch several contexts at once

Required output: a one-paragraph value claim in the user's terms, the context(s) from
`context-map.json` it belongs to, the nearest existing surface, and — checked against
`.vault/Perfect/directions/` — whether it has been proposed before and what happened.
On acceptance, write it as a `directions/<slug>.md` note with `status: proposed` so the next
`/perfect` run picks it up. Do NOT half-build it here.

### Bucket C — Reference
An external tool, model, API, service or technique worth *knowing about* when the backend is
designed — the bucket that exists because this repo deliberately has no backend yet. Indicators:
- It names a provider, a hosting shape, a pipeline or a pricing model
- Acting on it would mean adding a dependency or a service this prototype has decided against for now

Required output: what it is, what it would replace or enable, what it costs (money, latency, lock-in),
and the *decision* it informs (e.g. "who renders video", "where takes are stored"). Write it to
`.vault/Reference/<slug>.md`. Never install a dependency or wire a service off the back of a
Reference finding — that is a user decision, and this bucket exists to inform it, not to pre-empt it.

### Bucket D — Craft knowledge
Durable know-how about **how the content is made**, as opposed to how the app is built. This is the
bucket that unblocks prototyping: a studio step whose craft rules are unwritten produces surfaces
designed from intuition, and output that is shallow because the rules were never stated.

Indicators:
- The source is exemplar *work* (a video, a script, a published piece), not commentary about work.
- The finding is about **how the thing is composed** — a structure, an engine, a turn, a device. "The
  script attacks its own argument two-thirds through"; "the answer is given at 1:00 of an 18-minute
  video and the tension survives it".
- It would change what a step's UI asks the user for, or what a generator prompt must contain.

**The bar for a craft finding:** it must survive the question *"would this help someone compose a
script, or does it only describe one?"* "206 wpm" describes. "Every act boundary is a reversal, and
the viewer is never allowed to settle on a conclusion" composes.

Required output: an entry in the knowledge library under the template step it belongs to —
- `sources/<slug>.md`: the teardown. Frontmatter (url, duration, capture date, transcript kind), the
  measured table, the beat sheet with timestamps and quoted lines, "what transfers", "what does not".
- `PATTERNS.md`: the step's craft rules, updated in place — every claim carrying **MEASURED /
  OBSERVED / INFERRED / ASSUMED** and, for MEASURED, the number and the sample size.
- `params.json`: the same rules as machine-readable defaults and ranges the UI can consume.
- `OPEN-QUESTIONS.md`: what this source could NOT settle, each with the source that would.

Four rules that keep the library from rotting:
1. **Composition first, metrics last.** The teardown leads with the beat chain. Delivery figures go in
   an appendix and are explicitly framed as consequences of the engine.
2. **n is always visible.** Never write a rule as universal on one source. "n=2" appears next to the
   claim, not in a footnote.
3. **Quote, don't paraphrase into authority.** A rule derived from one line carries that line and its
   timestamp.
4. **Measure what is measurable and say what is not.** If the captions are ASR, sentence length is
   unknown — record it as unknown. An estimate laundered into the library is worse than a gap, because
   the gap is fixable and the estimate is invisible.

**Ground the run in established craft, not just in the sample.** A craft run should reach for the
existing body of knowledge — screenwriting, rhetoric, journalism, information design — via WebSearch,
and record what it used in `CRAFT-BASELINE.md` when the idea is cross-cutting. Two videos cannot tell
you *why* a structure works; the theory can, and the combination is what makes a rule trustworthy
enough to build a UI on.

An idea can be both A and B (a small fix now, a larger direction later), or both D and B (a craft rule
that also implies a product direction): present it once, flag both, and be explicit about which part
you would execute in this session.

---

## Phase 6: Evidence Gathering

For each surviving idea, gather concrete evidence to make the user's triage easy. Budget your tool calls — don't go deeper than necessary.

### Code bucket

**Step 1 — Host infrastructure first.** Before searching for the specific feature, grep for the *category of host infrastructure* the idea would attach to. Examples:
- HTTP endpoint idea? `Grep "axum|HttpServer|Router::new"` to find existing HTTP server modules
- Background job idea? `Grep "tokio::spawn|JoinHandle|Worker"` to find existing job runners
- Auth/middleware idea? `Grep "middleware|tower_http|from_fn"` to find existing middleware patterns
- New table idea? `Grep "CREATE TABLE.*<related_concept>"` in `migrations.rs`
- New CLI flag idea? `Grep "binary_candidates\|build_cli_args"` in `engine/provider/`

This catches existing-but-undocumented surface area in one grep. **A single discovery here typically reframes 2-4 findings at once** — what looked like "build new infrastructure" becomes "add routes to existing router" / "add column to existing table". Reframing changes both effort estimates and file anchors, so do it before deeper greps.

**Step 1b — Fixture vs product check (this repo's most common misframe).** Before scoring any finding
that criticises what the studio "does" — how long a render takes, how many takes exist, what a run
costs, how often a generation fails — check whether the number comes from **fixture data** or from
**product logic**. Almost always it is fixture data in `app/_studio/`, which means the finding is not
"the product behaves wrongly" but at most "the mock is unrealistic". Those are worth filing, and they
are cheap; they are not architecture findings. If a finding's premise is "the app computes X badly"
and X is a literal in a fixture file, **the finding is wrong as framed** — reframe it before
presenting.

**Step 1c — Now vs when-the-backend-lands routing.** Before deciding the anchor for a code finding,
decide *which repo state it belongs to*. This prototype deliberately has no server, so anything that
requires one (persistence, jobs, model calls, auth, uploads) is a Bucket C **Reference** — recorded
against the decision it informs, not anchored to a file. What IS in scope today: the shape of the
seam (props, types, the fixture contract), the information design of every surface, and the honesty
of the states they can render. When in doubt ask: "could this ship today with no new dependency and
no new service?" If no → Reference, not code.

**Step 2 — Then search for the specific feature.** Now grep for the actual thing the idea proposes (function name, env var, flag, table name).

**Step 3 — Read the anchor file.** `Read` the most relevant file(s) — limit to ~100 lines. Identify the exact `file_path:line_number` where the change would land. **For host-infrastructure verification, read enough to confirm the public API (~30 lines), not the implementation (~500 lines)** — token efficiency matters.

**Step 3a — When the map is too coarse, read the surface itself.** `context-map.json` gives
descriptions and file lists, not flows — but every context here is 1–8 files, so the surface IS the
documentation. Open the phase component and the fixture it reads together; the pair answers "what can
this screen say?" faster than any grep. For design questions, the parent project's
`../arm/gravitone/web/DESIGN.md` is the long-form rationale behind the tokens.

**Step 4 — Drop if redundant.** If the gap doesn't actually exist (the codebase already does this), drop the idea.

**Step 5 — Grounding check (per finding, before Phase 7).** Every code finding that will be presented as `High` must carry at least one `file_path:line` citation produced by a Read or Grep **in this session** — the line that proves the gap exists (or the host surface the change attaches to). If you can't produce that citation within budget, downgrade to `Medium` + `unverified` per the Phase 4 scoring-honesty rule; don't fabricate an anchor from the context map's file list.

**Security escalation rule:** When a grep against a file that exposes an HTTP, IPC, webhook, or external surface — **OR** that spawns a privileged subprocess (e.g. with `--dangerously-skip-permissions`) — returns **zero hits for auth/sandbox patterns** (`api_key|Authorization|Bearer|require_auth|middleware|sandbox|seatbelt|seccomp|landlock`), do NOT drop the finding as "no existing pattern". Instead, **escalate it to severity `CRITICAL` and re-label it as a security gap, not a feature add.** Open HTTP/IPC surfaces and unsandboxed privileged spawn sites are findings even when the user didn't ask about security — the source may not even mention security, but the codebase reality does.

**Design impact check:** When a code finding touches `app/**/*.tsx` or `components/**/*.tsx`, note
whether it needs a colour, a motion or a type treatment the design system does not already have. If
yes, mark it `design: needs a new token` and name the token you would add — `components/ui/tokens.ts`
is the only file allowed a colour literal, so this is a real (small) cost the implementer must know
about upfront, and inventing a hue inline is the failure it prevents.

### Direction bucket
- **First** scan `.vault/Perfect/directions/` for the same idea by meaning, not by slug — an idea the
  user rejected once must be presented as a re-open (with the recorded reason) or dropped.
- Name the `context-map.json` context it belongs to; a direction that spans more than two contexts is
  usually two directions.
- State the nearest existing surface. A direction with no anchor in today's product is a wish, and
  the user will read it as one.

### Reference bucket
- **First** check `package.json` and `README.md` — a "new" tool the repo already depends on, or has
  explicitly decided against, is a catch, not a finding.
- Record what it costs (money, latency, lock-in) and the decision it informs. A Reference note with
  no decision attached is a bookmark, and bookmarks rot.
- Also verify the auth type is supported (compare against the auth distribution in Coverage Analysis)

---

## Phase 7: Present Findings

Print a single summary table followed by numbered detail blocks. **Before printing, run cluster detection (below) so the user can see natural bundles instead of a flat list.**

### Cluster detection

Before presenting, scan the surviving findings for clusters that should ship together:

- **Same file anchor** — multiple findings touching the same file (e.g. all 4 land in `engine/management_api.rs`) usually want a shared PR. Note the cluster.
- **Dependency edges** — finding B mentions a field/table/module that finding A would create. Note `depends on [N]`.
- **Security pairing** — an auth finding paired with an exposure/visibility finding. Neither makes sense alone (auth without exposure flag = every key sees everything; exposure flag without auth = anyone reaches public stuff). Always present these as a forced pair.
- **Protocol pairing** — a protocol-shape endpoint paired with a self-describing metadata endpoint (the metadata endpoint is the prerequisite). Always present these as a natural pair.

For each cluster, add a one-line note to the relevant findings: `Cluster: ships with [N, M] — recommended order: M → N`. This makes the user's triage decision a cluster decision, not a per-row one.

### Summary table

```
#  Bucket       Title                                          Relevance  File / Service
─  ───────────  ─────────────────────────────────────────────  ─────────  ──────────────────
1  code         Shot state chip duplicated in 3 surfaces       High       app/_phases/motion/MotionShotLab.tsx:61
2  direction    Takes carry their own lineage in the Library   High       (Asset Library group)
3  reference    Video model providers + per-second pricing     Medium     (backend decision: who renders)
4  code+dir     Cut timeline can't show a partial render       High       app/_phases/cut/CutTimeline.tsx:88
...
```

### Per-idea detail

For each row:
```
[N] {title}
    Bucket(s):    {bucket(s)}
    Source:       "{quote}" or [HH:MM:SS]
    Summary:      {2-3 sentences}
    Evidence:     {file_path:line actually read/grepped this session for code; similar templates for templates; or "unverified — keyword match only" (caps relevance at Medium)}
    Recommended:  {edit {file} | file as direction {slug} | record as reference {slug}}
    Why it fits:  {which context group from snapshot it maps to}
    Aligns with:  {strong-pattern wikilink + canonical example, if any — else omit line}
```

---

## Phase 8: User Triage

Ask the user:
```
Which findings should I action? Reply with numbers (e.g., "1, 3, 4"),
"all", "none", or "ask" for a guided walkthrough.
```

For each accepted finding:

### Code bucket

**IN-SESSION EXECUTION IS THE DEFAULT.** Set on 2026-04-17 after observing the morning-handoff → evening-amendment → next-session-execution fragmentation pattern. Split sessions fragment the work: a handoff written at the end of session N accumulates amendments in session N+1 and finally gets executed in session N+2 — each hand-off is a place where context is lost, scope drifts, and on 2026-04-11 one such hand-off resulted in an entire session's code being wiped during a merge. **Execute in the same session that produced the findings, validate, and commit atomically per task.** This keeps the discovery → decision → implementation arc inside one context window where corrections are cheap.

**When in-session execution is NOT possible** (pick the fallback shape):

- **Context is critically tight** and the remaining budget cannot accommodate the edits + validation + commits.
- **Work is genuinely exploratory or multi-day** — requires specs that don't exist yet, external approvals, research into unknown systems.
- **Dependency is unavailable** — whitelist-gated API, preview product, credentials the dev team can't obtain (Option C territory).
- **User explicitly requests planning-only** — "prepare a plan, I'll execute later".

Do NOT fall back to a handoff because the work feels large. "Large" is a signal to break into smaller atomic commits, not to defer. Multi-surface work (a phase component + its fixture + the context map in the same run) is still in-session-executable as long as validation passes per-task.

**Option A — Single isolated finding → execute + commit + optional todo (NEW DEFAULT)**
For one code finding with a clear `file_path:line` anchor, apply the edit, run the validation
(`npx tsc --noEmit`, plus `npm run build` if routing/layout was touched), and commit with a
`research:` prefix. Do NOT write the finding to the vault as a "noted but not implemented" item —
that is the old default and it fragments the record.

**Option B — Clustered findings → in-session execution with atomic commits (NEW DEFAULT for 2+ findings)**
For 2+ clustered code findings:

1. **Present the full task plan inline** (same shape as the old handoff structure below) before executing, so the user sees what is about to happen.
2. **Execute in the recommended ship order** (risk-ascending: trivial constants first, complex cross-file work last).
3. **After each task, run the relevant validation**:
   - Any change → `npx tsc --noEmit`
   - Routing / layout / server-rendered change → `npm run build`
   - A visibly rendered change → drive it: `npm run dev -p 3177` (never 3000), look, then say what you saw
   - There is no linter and no test suite in this repo. Do not run or claim `npm run lint` / `npm test`.
4. **Commit atomically per task** with `research: <short task title>` prefix, Co-Authored-By footer, and a body that explains the why.
5. **If validation fails for a task**, fix the issue inline before moving to the next task. Do NOT stack failing commits. Do NOT use `--no-verify` or `--amend`.
6. **If a task genuinely cannot be completed in-session** (e.g., hits a real blocker), commit the completed tasks, then write a handoff for the remainder — do not discard the completed work.

The inline task plan should include:

- **Why this matters** — one-paragraph context (what problem, what infrastructure already exists)
- **Goal** — numbered list of the bundled findings as deliverables
- **Non-goals** — explicit "do NOT do these" list (deferred findings, scope creep traps, layers not to touch). Even in-session execution benefits from explicit non-goals; they keep the execution focused.
- **Dependency graph & order** — which tasks ship together, which depend on which
- **Per-task spec** — for each task: file path & line anchor, schema/migration SQL, struct definitions, function signatures, acceptance criteria
- **Cross-cutting concerns** — convention compliance (point at `README.md § The design language`),
  backward compat of the fixture types, and a note that a rescan is needed when files move
  (never a hand edit to `context-map.json`). **If any task
  touches `app/**/*.tsx` or `components/**/*.tsx`, honor all three:**
  - No colour literal outside `components/ui/tokens.ts`; reuse `Primitives.tsx` rather than re-rolling.
  - New data goes through `app/_studio/types.ts`, not an inline shape in a component.
  - Every state the surface can render must be one the product could actually reach.

Record the commit SHAs in the Research note frontmatter (`commits: [<sha1>, <sha2>, ...]`) and in the Phase 11 final summary. The Research note replaces the handoff file as the canonical per-run artifact.

**Option B-Design — Design-then-execute (when shape requires exploration)**
Pick this when the user replies to Phase 8 with phrases like "propose approaches", "design first", "what are the options", "scan and propose", "three different approaches", or otherwise signals that the finding's shape is ambiguous and needs exploration before code lands. The shape is: explore → user picks → write a concrete design doc → **immediately execute** against it in the same session.

Steps:
1. **Scan once more.** Run a focused round of codebase evidence gathering beyond Phase 6 to ground the approaches in concrete file anchors. Do not skip this — without it, the approaches read as generic and the user cannot distinguish them.
2. **Present 2-3 approaches** with tradeoff tables (✅ benefits / ⚠️ risks per approach) and effort estimates. Each approach must name actual file paths and existing infrastructure it would attach to or extend. Generic approaches that could apply to any codebase are a smell — the source-grounded option is the one the user picks.
3. **Wait for the user's pick.** Do NOT proceed to design-doc writing on speculation; the user may refine the framing or merge approaches.
4. **Write a co-located `DESIGN.md`** next to where the code will land (e.g. `app/_phases/motion/DESIGN.md`), NOT in a planning folder. The co-location matters: a future session reading the code finds the design rationale next to it. If the location is genuinely ambiguous (multi-area changes), use `.planning/research/{date}-{slug}.md` instead.
5. **Continue IMMEDIATELY to in-session execution** against the design. Do NOT stop at the design doc and ask for approval. The user already approved the approach in step 3; the design doc is the implementation contract, not a second decision gate.
6. **Treat the design doc as a working artifact.** If implementation reveals a constraint that invalidates part of the design (e.g., the proposed schema conflicts with an existing index), AMEND the design doc inline and continue with the new shape. Don't pause for re-approval on minor adjustments — only pause if the change is structural enough that the user would have picked a different approach.
7. **Atomic commits per PR step in the design's rollout plan.** A 5-PR rollout = 5 atomic commits. Validation runs per commit (tsc, plus build where it applies), same rules as Option B.

**Why this is its own option, not just a variant of B:** A regular Option B finding has a clear `file_path:line` anchor where the change lands. A B-Design finding starts with no clear anchor — the work is partly figuring out what to build. The exploration step is non-trivial (3+ tool calls of codebase scan), and writing the design doc is real work (typically ~1-2 KLOC of markdown). Wrapping it in a labeled option lets future runs reuse the pattern without re-discovering it.

**Anti-pattern:** writing a design doc and stopping there ("design ready for review"). That fragments the work across sessions and re-introduces the merge-loss risk Phase 13 was designed to prevent. The 2026-04-17 split-session lesson applies here too — the design exploration and the implementation belong in one context window.

**When this option does NOT apply:** if the user accepts a finding with a clear file anchor without asking for approaches, just run Option A or B. Don't volunteer an exploration round when none is needed.

**Option B2 — Implementation-ready handoff plan (FALLBACK when in-session execution is impractical)**
This was the old Option B default. It is now a fallback. Use ONLY when one of the "when in-session execution is NOT possible" conditions above is met. When written, use the structure from Option B above (Why this matters, Goal, Non-goals, Dependency graph, Per-task spec, Cross-cutting concerns, Final acceptance checklist, What to do if you get stuck, Out of band) and save to `.planning/handoffs/{YYYY-MM-DD}-{slug}.md`.

The handoff plan must be **self-contained** — readable without the conversation that produced it. The implementing CLI will not have access to this skill's context.

Record the handoff path in the Research note frontmatter (`handoff: .planning/handoffs/{date}-{slug}.md`) and in the Phase 11 final summary.

**Do NOT default to Option B2.** Every time a handoff is written instead of executed, there is a risk the work never lands or lands fragmented across multiple sessions. The 2026-04-17 same-day morning-handoff → evening-amendment cycle is the canonical cautionary tale — the same findings took two research sessions and a third execution session to fully land when a single session would have sufficed.

**Option C — Theoretical scaffolding handoff (gated/preview/whitelist-dependent features)**
Same structure as Option B, BUT with a much stricter non-goals section. Use this when the accepted finding depends on an external dependency that isn't available yet: whitelist-gated APIs, preview products, unreleased SDKs, features behind a private beta.

Distinguishing characteristics vs. Option B:
- **Non-goals section explicitly forbids any real integration attempts.** Example phrasing: *"Do NOT make any HTTP calls to {external host}. Not in tests, not in examples, not in commented-out code."* and *"Do NOT hardcode endpoint URLs before the API is publicly documented."*
- **Implementation style is scaffolding only:** stub structs/traits, settings keys with no defaults, `Err(AppError::NotImplemented(...))` returns, variant added to enums with dispatch points returning NotImplemented. The compile passes; no runtime behavior is exercised.
- **Every stub point gets a `TODO({feature-name}-{reason})` marker** (e.g., `TODO(managed-agents-whitelist)`) so a future CLI session can grep for all the breadcrumbs and finish the work when access is granted.
- **Tests only cover the deterministic stub path** (assert `NotImplemented` is returned). No integration tests; no fixtures that imply real API shape.
- **Out-of-band section lists "what to do when access is granted"** as a concrete checklist: grep for the TODO marker, flesh out stub methods, add UI surface, update docs.
- **Small Cargo.toml / deps additions are allowed only if** the dependencies are already present for other reasons. Do NOT add new dependencies that only the stub would use.

When to pick Option C over B:
- The source mentions a product in public beta / research preview / whitelist gate
- The API spec isn't publicly documented
- Authentication credentials for the external system aren't available to the dev team
- The user explicitly says "prepare theoretically" or "scaffold for future"

Run 6 (2026-04-08, Claude Managed Agents) produced the first handoff in this shape. It's a real category — codify it.

**Option D — Just record, no further action (escape hatch only)**
For findings the user wants to think about without acting on yet, write them into the Research note only. No todo, no handoff. The Research note serves as a future search target. This is the escape hatch, not a default — prefer B or C for any finding concrete enough to have a file anchor.

**Discovery briefs — de-prioritized.**
Earlier iterations offered a "discovery brief" shape for findings that needed architectural analysis before implementation. Run 2 wrote one; run 3's candidate was descoped; run 6's candidate was converted into a theoretical-scaffolding handoff (Option C) instead. Pattern: users prefer concrete plans (even stubs) over pure analysis documents. **Do NOT propose a discovery brief as a first-class option.** If a finding seems to need one, first ask whether it can be expressed as Option C (scaffolding) — that captures the architectural intent in compilable code. Only write a discovery brief as a last resort when there's genuinely nothing code-shaped to scaffold (e.g. a pure product-direction question). If written, place at `.planning/research/{date}-{slug}.md`.

### Direction bucket
Write the accepted direction to `.vault/Perfect/directions/<slug>.md` with `status: proposed`, the
context wikilink, the value claim, the evidence, and 3–6 acceptance criteria — the schema `/perfect`
reads. Tell the user it will surface at the next `/perfect` proposal pass. Do NOT start building it.

### Craft bucket
Write the knowledge-library entry described in Bucket D, in this order — teardown first, because
`PATTERNS.md` must only ever contain claims that already exist as evidence somewhere:

1. `knowledge/templates/<template>/steps/<nn>-<step>/sources/<slug>.md` — the teardown, **leading
   with the beat chain diagram**, then "what makes it work", then measurements, then what does not
   transfer.
2. `corpus/` — the stamped transcript + the parse/metrics scripts, if this was the first craft run
   for the step.
3. `PATTERNS.md` — update in place. New sources usually *sharpen* an existing rule (turning INFERRED
   into MEASURED, or widening a range) rather than adding a new one. Never append a second section
   that restates a rule differently; a library with two answers to the same question is worse than
   one with none.
4. `params.json` — mirror only what changed, and keep every value traceable to a PATTERNS.md section.
5. `OPEN-QUESTIONS.md` — strike through what this run answered (naming the run), add what it raised.
6. If the step folder is new, create `TEMPLATE.md` for the template and add a row to the table in
   `knowledge/README.md`.

**A craft run that produces no OPEN-QUESTIONS entries did not look hard enough.** Every real source
answers less than it raises.

### Reference bucket
Write `.vault/Reference/<slug>.md`: what it is, what it would enable or replace, its costs, the
decision it informs, and a reconsider trigger. Never install a dependency or wire a service off a
Reference finding.

### Combo (code + direction)
Execute the code half now, file the direction half. Say explicitly in the summary which half shipped.

For each declined finding (in the user's reply or by omission), record the number for Phase 10.

---

## Phase 9: Persist to Obsidian Research Note

Write `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/Research/{YYYY-MM-DD}-{slug}.md`.

Where `{slug}` is derived from the source: video title, article title, or first 4 words of raw text. kebab-case, max 40 chars.

### 9a. Duplicate defense (before writing)

The vault has dozens of prior Research notes; the same idea often arrives via multiple sources (e.g. two videos covering the same Claude Code release). Before writing, **Grep the vault's `Research/` and `Lessons/` folders for each surviving idea's key terms** (tool name, technique name, distinctive phrase — 1 grep with alternation is enough). For each hit, skim the matching note's frontmatter/headings:

- **Same idea, previously accepted/actioned** → do NOT re-present it as new. Record it in this run's note as a one-liner under `## Prior art` with a wikilink (`covered in [[2026-04-15-claude-code-routines]] — accepted, no delta`) and count it with the `already_existed` catches in Phase 11.
- **Same idea, previously declined/descoped** → surface the prior decision in Phase 7 ("previously declined in [[note]] because X — reconsider?") instead of presenting it fresh. (Phase 3's `descoped-reopenable.md` check covers the tracked subset; this grep catches the untracked rest.)
- **Related but with a real delta** → keep the finding, and add the wikilink under `## Cross-references` naming the delta.

Ideally run this check before Phase 7 (so the presentation is already deduplicated); at the latest, run it here before the note is written. Never write two vault notes that restate the same idea without linking each other.

Frontmatter + body:
```markdown
---
date: 2026-04-07
source_type: youtube|article|text
source_url: <url or "pasted">
source_title: "<video/article title>"
focus: all|code|templates|credentials
total_extracted: 12
total_after_relevance: 7
accepted: [1, 3, 4]
declined: [2, 5, 6, 7]
buckets: { code: 4, template: 2, credential: 1 }
web_augmentations:        # Phase 2.5 — omit if phase did not run
  - { name: "ToolName", url: "https://...", kind: "tool" }
---

# {Source title}

**Source:** [{title}]({url})
**Run:** {timestamp}

## Summary
{2-3 sentence overview of what this source covered}

## Extracted Ideas

### [1] {title}  ✅ accepted → {action taken}
**Bucket:** code
**Source anchor:** "{quote}" / [HH:MM:SS]
**Evidence:** `src/foo/bar.ts:42`
**Notes:** {anything from triage}

### [2] {title}  ❌ declined
**Bucket:** template
**Source anchor:** ...
**Evidence:** ...
**Decline reason:** _to be filled in Phase 10_

...

## Cross-references
- Related patterns: [[Patterns/user-preferences]]
- Prior runs touching same area: {wikilinks to other Research notes if any}
```

---

## Phase 10: Self-Reflection (the learning loop)

This phase makes the skill smarter over time. Do not skip it.

### 10a. Ask why

For declined findings, ask the user **once**, in a single batched question:
```
Help me improve. For these declined items, why did you skip them?

  [2] {title}
  [5] {title}
  [6] {title}
  [7] {title}

You can answer per-item ("2: too vague, 5: already planned") or with a
single reason that covers all of them. Type "skip" to move on.
```

If the user types `skip`, jump to 10c.

### 10b. Append to Lessons

Write/append to `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/Lessons/{YYYY-MM-DD}-research.md` (Edit-append, never Write-replace — shared-by-date file, see the 2026-04-14 iteration-log entry):
```markdown
## Run: {timestamp} — {source title}

Source: {url}
Accepted: [1, 3, 4]
Declined: [2, 5, 6, 7]

### Decline reasons
- [2] {reason}
- [5] {reason}
- [6] {reason}
- [7] {reason}

### Self-reflection
- What I extracted that resonated: {pattern}
- What I extracted that didn't: {pattern}
- Tools I should use more / less next time: {observation}
```

The "Self-reflection" block is your own assessment — not the user's — written as a brief note about what worked in this run vs. what didn't.

### 10c. Update Research note

Backfill the Research note from Phase 9 with the decline reasons.

### 10d. Pattern promotion check

Read all files in `Lessons/` and look for repeated decline reasons:
- If the same reason (or close synonym) has appeared in **3+** runs, propose adding it to `Patterns/user-preferences.md`.
- Show the proposed pattern to the user and ask: "I've seen this 3+ times — promote to permanent rule?"
- If yes, append to `Patterns/user-preferences.md` as a new bullet with date and source-run links.

### 10e. README / map update check

Did this run discover a **structural fact about the codebase** that future runs would need to know? Examples:
- A misreading the user corrected (e.g. catalog vs runtime distinction)
- A plugin or module the skill didn't know existed (e.g. a separate cloud client, a dev-tools plugin)
- An architectural boundary that determines where findings should be routed (e.g. framework vs plugin)
- A security model invariant that affects threat assessment

If yes, **edit `README.md`** (for a fact about what the product is or how the design language works)
with the new fact — `README.md` is hand-authored, so edits there are durable. A fact about *where
code lives* belongs in the context map, which you cannot edit: tell the user it needs a rescan (or a
Context Ledger edit) instead, and record the fact in the run's Research note meanwhile.

If no, skip this step.

This step exists because runs 2 and 3 both discovered structural facts the skill needed but didn't have. The pattern: a finding gets misframed, the user corrects, the correction is broader than just "this run was wrong" — it's a fact every future run needs to know. Capturing it in `README.md` prevents the same misframe in run N+1.

### 10f. Descoped-but-reopenable tracking

For each finding that was descoped (not declined, not accepted — descoped because of an external blocker like a hard technical problem, a missing dependency, or an unavailable product), record it in `C:/Users/mkdol/dolla/gravitone-gcloud/.vault/Patterns/descoped-reopenable.md`. This is a separate file from `Patterns/user-preferences.md` — user preferences are permanent rules; descoped-reopenable entries are conditional waits.

File format (create if missing):

```markdown
# Descoped-But-Reopenable Findings

Findings that were descoped due to an external blocker but may become viable
later when the blocker clears. Phase 3 of future runs reads this file and
surfaces any matching items as "previously descoped, reconsider?" candidates.

## Entries

### {YYYY-MM-DD} — {finding title}
- **Source run:** {research note wikilink, e.g. [[2026-04-08-paperclip-hire-agents]]}
- **Original descope reason:** {verbatim quote from the user or self-assessment}
- **Blocker:** {what needs to change for this to become viable}
- **Reconsider trigger:** {concrete signal to watch for — e.g. "provider X ships a usable video API", "the studio grows a backend", "OSS project Z hits 1.0"}
- **Related findings:** {wikilinks to any related Research notes}
```

**When to add an entry:** if during Phase 8 the user descopes a finding AND the decline reason names a specific external blocker (not "no business need" or "too niche" — those are permanent rejections). The trigger for adding an entry is a phrase like *"come back when..."*, *"we can't do this until..."*, *"the platform doesn't support this yet..."*, or a technical problem the user explicitly acknowledges as unsolved.

**When NOT to add:** descopes based on priority ("not now"), scope ("too big"), or permanent preference ("we don't like this pattern"). Those belong in Lessons or user-preferences.

**Example from run 4 / run 6:** Paperclip run 4 surfaced "maximizer mode" (run-until-done semantics) which was descoped because of the goal-verification problem. Run 6 (Claude Managed Agents) observed that Anthropic solved the same problem externally. A properly-tracked descoped-reopenable entry from run 4 would have flagged this in run 6's Phase 3 automatically. **Write the entry now even if the blocker never clears — the cost of an unused entry is small; the cost of missing a reopen opportunity is a silently-missed finding.**

**Cross-check on future runs (Phase 3):** when reading `descoped-reopenable.md`, check each entry's "Reconsider trigger" against the current source. If the source describes a solution to the blocker, surface the entry in Phase 7 as a revived candidate next to the new findings.

**Cleanup:** when a descoped-reopenable entry is eventually accepted and actioned in a future run, remove it from the file (or move it to a "resolved" section at the bottom with the run date and handoff path). Don't let the file grow indefinitely.

---

## Phase 11: Final Summary

Print:
```
Research run complete.

  Source:       {title} ({source_type})
  Extracted:    {N} ideas
  After filter: {M} relevant
  Accepted:     {K} ({list})
  Declined:     {L} ({list})

  Already existed:  {A} (caught by host-first rule — see list)
  Descoped-reopenable: {D} (tracked in Patterns/descoped-reopenable.md)

  Actions taken:
    - Code findings executed + committed: {N} ({short SHAs})
    - Directions filed for /perfect: {N} ({slugs})
    - References recorded: {N} ({slugs})
    - Theoretical scaffolding handoffs written: {N} ({paths})
    - Findings logged for later: {N} (in the Research note only)

  Already-existed catches:
    {for each catch, one line: "{candidate title} → already at {file:line}"}
    {if none: "none"}

  Files updated:
    + .vault/Research/{date}-{slug}.md
    + .vault/Lessons/{date}-research.md
    {if handoff plan written:}
    + .planning/handoffs/{date}-{slug}.md
    {if pattern promoted:}
    ~ .vault/Patterns/user-preferences.md
    {if descoped-reopenable entry added:}
    ~ .vault/Patterns/descoped-reopenable.md
    {if a direction was filed:}
    + .vault/Perfect/directions/{slug}.md
    {if a reference was recorded:}
    + .vault/Reference/{slug}.md
    {if README.md / context-map.json updated in Phase 10e:}
    ~ {README.md | context-map.json}

  Source-type yield:  {expected vs actual for this source type — see Phase 3 calibration table}
  Map freshness:      {clean | drifted — N missing paths, M unmapped files (fixed this run?)}
  Cache:              {cleaned | n/a (Phase 2b/c source) | residue at .research-cache/<id>.* — see Lessons cache_cleanup_skipped note}
  Commit: {filled in by Phase 13 — short SHA + subject, or skip reason}
```

**Surface `already_existed` prominently when the finding count is low.** A product demo run that extracts 2 findings + 8 catches is a high-yield run — frame it that way. Do not let the user read "only 2 findings" as a failure when the real output is "8 existing features confirmed + 2 real gaps found".

---

## Phase 12: (removed)

The engine's Phase 12 wrote Personas' in-app "What's New" release log. This repo has no release log,
no `releases.json` and no locale files, so the phase is gone rather than left as a no-op. If a
changelog is ever added here, re-add a phase that writes it — don't repurpose the Research note for it.

---

## Phase 13: Atomic Commit (MANDATORY — prevents merge loss)

**Why this phase exists**: On 2026-04-11, a merge without recovery options wiped out an entire research session's worth of code — Task Runner depth presets, DevProject monitoring fields, event registry entries, TaskOutputPanel markdown toggle, and more. The fixes had to be manually recreated from the conversation transcript because no commit had captured them. **Never again.** Each research run commits its own output at the end, so git is the recovery mechanism when anything else fails.

This phase runs at the very end of a research session after Phases 10–12 have completed. It is **non-negotiable** except in the two explicit skip conditions below.

### 13a. Determine if there are changes to commit

Run `git status --porcelain` to see uncommitted changes. If the output is **empty**, skip Phase 13 entirely and print `No changes to commit.` in the final summary. This covers the "accepted: none" branch where nothing was actioned.

### 13b. Review what will be committed

Run `git status` and `git diff --stat` to see the full set of changes. The user will see this output as part of the skill flow. **Look for unexpected files** — anything outside the expected scope should raise a warning:

- **Expected scope for a research run:**
  - Any files touched by accepted Phase 8 findings (if the user chose Option B/C and the implementation already happened in the same session, or if the user told the skill to "implement right away")
  - `.planning/handoffs/{date}-{slug}.md` (if a handoff was written)
  - `context-map.json` / `README.md` (if Phase 10e updated them)
  - `knowledge/**` (if the run had a Craft bucket — the library IS the deliverable and is versioned,
    unlike `.vault/`)
  - The vault lives at `.vault/` **inside** this repo but is gitignored, so it should NOT appear in
    git status. If it does, the ignore rule is missing — fix that before committing, don't commit the
    vault.
- **Unexpected files that warrant a pause:**
  - Files under `node_modules/`, `target/`, `.vite/`, build artifacts
  - `.env`, `credentials.json`, anything that looks like secrets
  - Files from feature areas completely unrelated to any accepted finding (suggests stale edits from a different session)

If unexpected files are present, **print them to the user and ask** whether to include them in the commit or leave them uncommitted. Don't auto-include anything suspicious.

### 13c. Stage only the in-scope files

Use **explicit `git add <path>` per file**, NOT `git add -A` or `git add .`. This avoids accidentally staging secrets or unrelated drift. Build the file list from:

1. The handoff path (if Phase 8 Option B/C ran)
2. The files edited by an in-session implementation
3. `context-map.json` / `README.md` (if Phase 10e updated them)
4. `knowledge/**` for a craft run — teardown, corpus, PATTERNS.md, params.json, OPEN-QUESTIONS.md
4. Any new files created during the run

### 13d. Write the commit message

Use this exact template via HEREDOC so multi-line formatting is preserved:

```bash
git commit -m "$(cat <<'EOF'
research: {short-title-of-source}

Source: {url-or-pasted}
Accepted: {N} finding(s) ({comma-separated-titles})

{optional 1-2 line summary of what was implemented or handed off}

{if handoff written:}
Handoff: .planning/handoffs/{date}-{slug}.md

{if a direction or reference was filed:}
Filed: directions {slugs} | references {slugs}

{if Phase 12 ran:}
Release log: {N} item(s) added to {version}

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

**Rules for the commit message:**
- First line prefix **must be `research:`** — this identifies research-run commits in `git log` and makes them easy to filter
- Short title = the source video/article title trimmed to ≤50 chars, lowercased
- **Never include file paths** in the commit body — those are in `git diff`; the message is about *why*
- **Never use `--no-verify`** — let pre-commit hooks run. If a hook fails, fix the issue, re-stage, and create a NEW commit (never `--amend`)
- **Never skip signing** — the Co-Authored-By line is required

### 13e. Handle commit failure

If the commit fails (pre-commit hook rejection, lint errors introduced by an in-session implementation, etc.):

1. Print the failure reason to the user
2. Do NOT retry with `--no-verify`
3. If the failure is fixable (e.g., TypeScript error in a file the skill wrote), **fix it inline** and create a new commit with the same message
4. If the failure is NOT fixable in the current session (e.g., hook requires manual intervention), print:
   ```
   ⚠️ Commit failed. Changes are staged but NOT committed.
   Research outputs are safe in Obsidian vault, but code changes
   are vulnerable to merge loss until you commit manually.
   Run: git commit --message "research: <title>"
   ```
5. Still write the Research note — never sacrifice the learning loop because of a commit failure

### 13f. Skip conditions

Phase 13 has exactly **two** skip conditions. Everything else is non-negotiable.

**Skip 1 — No changes:** Phase 13a found an empty `git status --porcelain`. Nothing to commit. Print `No changes to commit.` and move on.

**Skip 2 — User explicitly opts out:** The user typed one of `--no-commit`, `no commit`, or `skip commit` in the original `/research` invocation OR as a response to Phase 8 triage. In this case, print:
```
⚠️ Skipping commit per user request.
Changes are uncommitted and vulnerable to merge loss until you commit manually.
```

**NOT a skip condition:** "I'll commit manually later." Do not take the user's word for this — the whole point of Phase 13 is to make the commit happen in-session before context is lost. If the user expresses this preference, gently remind them that "later" turned into "lost work" on 2026-04-11, and ask again whether to commit now.

### 13g. Update the Phase 11 summary

Append a `Commit:` line to the final printout (re-print the summary so it stays canonical):

```
  Commit: {short-sha} — research: {short-title}
           | skipped (no changes)
           | skipped (user opted out)
           | ⚠️ commit failed — see above
```

This gives the user one line to verify the whole run is safely captured in git before they close the session.

### 13h. Deregister from the Active-Runs Ledger

Move your `## Active` entry in `.vault/active-runs.md` to the top of `## Recently completed`. Update its `Status` to one of:

- `completed (commit: <short-sha>)` — Phase 13 successfully committed.
- `aborted (skip 1: no changes)` — Phase 13a found no changes.
- `aborted (skip 2: user opted out)` — Phase 13f skip 2 fired.
- `aborted (commit failed — see Phase 13e)` — commit failed and was not recovered in this session.

If your edit to `active-runs.md` happens AFTER Phase 13's commit, that's fine — the ledger update lands as an uncommitted file in the working tree, ready to be committed by the next session that ships work. (This avoids a chicken-and-egg of "needing to commit the deregister before the commit it references exists".)

If you spot entries older than 14 days under `## Recently completed` while editing, trim them — keep the ledger focused on the recent rolling window.

If your run aborted before reaching Phase 13 (e.g., the user terminated mid-run), your `## Active` entry stays — the next session reads it as stale (>2h old) and surfaces it to its user. That's the recovery path; don't try to write a deregister from a half-finished state.

---

## Error Handling

| Failure | Response |
|---|---|
| `context-map.json` missing | Stop. It is a Personas export — ask for a scan (Dev Tools → Context Ledger). Never write one yourself. |
| `yt-dlp` missing | Stop with install instructions. |
| Measured wpm > ~280 in craft mode | The caption de-overlap failed. Fix the parser and re-measure — do NOT publish rates from a doubled transcript. |
| Craft source has ASR-only captions | Sentence-level metrics are unavailable. Record them as unknown in the teardown; never estimate them into `PATTERNS.md`. |
| Craft source is far longer than the template's target length | Usable for technique, not for pacing. Say so in the teardown's first line, and mark every compressed timing INFERRED. |
| YouTube has no auto-subs | Ask for manual transcript paste or alternate source. |
| `WebFetch` returns paywall / 403 | Ask user to paste the article text. |
| Source text <300 words | Report insufficient content. Stop. |
| Fewer than 2 ideas survive Phase 4 | Report "no relevant ideas found in this source for the studio." Still write a stub Research note so the source isn't re-harvested. |
| Vault path missing | Run Phase 0 bootstrap, don't fail. |
| A direction note collides with an existing slug | Update the existing note (add the new evidence + a dated line); never write a second note for the same idea. |
| Phase 13 commit fails (pre-commit hook, lint, etc.) | Try to fix inline and re-commit. If unfixable, print the warning from Phase 13e and leave changes staged. Never use `--no-verify`. |
| Phase 13 detects unexpected files in `git status` | Ask the user before staging. Never auto-include suspicious paths (`node_modules/`, `.env`, `target/`, etc.). |

---

## Safety Rules

- **Never edit source code the user has not accepted in Phase 8.** Accepted code findings ARE executed
  in-session (that is the default); everything else goes to the Research note.
- **Never file a direction into `.vault/Perfect/directions/` without explicit user acceptance** — that
  folder is `/perfect`'s queue, and quietly seeding it steers a loop the user owns.
- **Never install a dependency or wire an external service off a Reference finding.** This repo's lack
  of a backend is a decision, not a gap you found.
- **Never** skip Phase 10 unless the user typed `skip` — the learning loop is the whole point.
- The vault is the source of truth for memory between runs. Do not duplicate this data elsewhere.
- **Never put a colour literal outside `components/ui/tokens.ts`**, in any code this skill writes.
- **Phase 13 is mandatory.** Every research run ends with a commit unless there are no changes OR the user explicitly opted out. "I'll commit manually later" is not a valid skip reason — on 2026-04-11 "later" became "lost work from a bad merge". Git is the recovery mechanism.
- **Phase 13 stages files explicitly.** Never `git add -A` / `git add .` — always `git add <path>` per file to avoid sweeping up secrets or drift from other sessions.
- **Phase 13 never bypasses hooks.** No `--no-verify`, no `--no-gpg-sign`. If a pre-commit hook fails, fix the underlying issue and create a new commit.
- **Phase 2a cache cleanup is mandatory.** The `.research-cache/<id>.*` files are per-run scratch; delete them as soon as the cleaned text is in working memory (see Phase 2a). Do NOT defer to end-of-run — a mid-run failure leaves them behind. Scope the `rm` strictly to this run's id; never sweep the whole directory blindly (collides with parallel runs). Phase 11 must report `Cache: cleaned` (or the residue path) so the user has a verification signal. The 2026-05-01 maintenance commit hardening this rule was prompted by ~20 stray cache files accumulating across prior runs that all silently skipped this step.

---

## Skill Iteration Log

> The engine arrived here on 2026-08-11, adapted from the Personas copy at
> `dolla/personas/.claude/skills/research/`. Everything below the line is THIS repo's log and it
> starts empty — the Personas run history (runs 1–N: catalog-vs-runtime denominators, framework vs
> plugin routing, the release-log phase, the i18n contract) was deliberately not carried over,
> because none of those facts are true here and a log of another product's mistakes reads as this
> product's memory.
>
> What DID carry over, as rules rather than history: evidence caps the score (Phase 4/6), the
> host-first "does it already exist?" rule, execute-in-session over handoffs, and Phase 13's
> mandatory commit — each earned in that repo and each still true in this one.

### Runs

_No runs yet in this repo._

### Open questions for future runs

- Does the Code / Direction / Reference bucketing hold, or does "Direction" swallow everything while
  the product is still a prototype? Revisit after 3 runs.
- Is `context-map.json` (4 broad contexts) a fine enough scoring surface, or does a finding that
  lands in `production-phases` need a sharper anchor than "one of five phases"? If it keeps hurting,
  the fix is a Context Ledger split + pin in the Personas app, not a private map.
