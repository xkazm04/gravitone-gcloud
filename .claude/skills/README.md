# Adopted skills

Ten skills. Eight adopted on 2026-08-11 from `dolla/personas/.claude/skills/` and adapted to this repo:
a UI-first Next.js 16 prototype of a content-production studio, running entirely on mocked fixtures
in `app/_studio/`, with no backend, no tests and no deploy target yet.

| Skill | What it does here |
|---|---|
| `perfect` | The direction-and-delivery loop: propose 5 challenged directions per context, gate them with the user, build accepted ones with grouped builder subagents on one branch. |
| `explorer` | Daily sweep of one context — 10 items, triaged, executed in-session. Ranks design-language violations and dishonest fixtures above hardening. |
| `research` | Turns an external source into Code (execute now) / Direction (file for `/perfect`) / Reference (backend decision) / **Craft** findings. Craft mode measures exemplar work and writes `knowledge/` — the grounding layer step surfaces are designed against. |
| `prototype` | Directional variants behind a tab switcher for one surface, then consolidate the winner. |
| `uat` | Character-driven acceptance in two levels: L1 theoretical over the code, L2 empirical in a real browser. Judges the *interface*, never model output — nothing generates yet. Sibling to `gauntlet`: same philosophy, **different subject** — `uat` tests the app, `gauntlet` tests the methodic. Do not merge them; a run that tries to do both does neither. |
| `ship-loop` | Long-horizon ship-readiness loop: 8-dimension scorecard, user-gated milestones, verification gate. |
| `leonardo` | Image generation for product-surface assets and fixture stills. |
| `motionize` | Traced, motion-animated SVG glyphs for states that deserve explaining. |
| `train-style` | Written here 2026-08-27, not adopted. Drives `lib/foundry/extract/` from a folder on disk: read back → group → replicate from words with self-critique → transfer → Claude reads the results with its own eyes → cull in `/foundry` → Extract (or headless `--commit`). Same engine the hosted Extract tab drives; the CLI is `pipeline/foundry/extract.mts`. Needs `GOOGLE_AI_API_KEY`; spends against the imaging budget window. |
| `gauntlet` | Adopted 2026-08-12 from `dolla/kp/.claude/skills/uat` (v1.5). Battle-tests the **research methodic**, not the UI: 20 Creators across Geopolitics / Tech / Fraud / Entertainment run their own topics through `RESEARCH-PROMPT.md` → notebook → board → engine, every finding names the artifact it indicts, and a Fable judge rules on which domains need their own **lens** versus different content in the same mechanism. Overlay in `gauntlet/`. |

## The three facts every one of them was taught

1. **`context-map.json` (repo root) is the taxonomy, and the Personas app owns it.** 4 groups,
   4 contexts, 28 files — small enough to read whole. `/perfect`, `/explorer` and `/uat` all walk it.
   The Personas app (project `gravitone`) scans the repo with an LLM, stores the contexts in its own
   SQLite DB, and **exports** this file plus the managed block in `CLAUDE.md`. There is no import
   path, so **a hand edit is erased by the next scan** — change the taxonomy in Dev Tools → Context
   Ledger and rescan, or pin a context you have curated. Skills report drift; they never repair it.

   Its schema is the Personas one (`generator: "personas-context-scan"`, flat `groups` + `contexts`,
   snake_case `file_paths`, plus `keywords` / `entry_points` / `cross_refs` / `provenance`) — **not**
   the Vibeman schema `arm/context-map.json` uses. Don't copy shapes between the two repos.

   Contexts are broad on purpose: the scan enforces 10–30 files each, so `production-phases` holds
   all five phase surfaces. Scope inside a context and say so, rather than wishing for a finer map.
2. **`components/ui/tokens.ts` is the only file allowed a colour literal.** Everything else consumes
   the `--gt-*` vars or the exported constants. This is the rule most likely to be broken by a
   subagent that never read the README.
3. **The product is mocked, on purpose.** The gates are `npx tsc --noEmit` and `npm run build` —
   there is no linter and no test suite, and claiming one ran is fabricated evidence. Ideas that need
   a backend get *recorded*, not built.

## Craft knowledge vs session memory

Two different stores, and mixing them is the mistake to avoid:

- **`knowledge/`** — versioned, in git, the asset. What we know about making content: per template,
  per step, with evidence labels and sample sizes. Written by `/research --craft`; **read by
  `/prototype` and `/perfect` before designing any step surface.**
- **`.vault/`** — gitignored, disposable. What happened in a session: run records, coverage, the
  direction queue.

A craft rule in `.vault/` is lost work; a session log in `knowledge/` is noise.

## Memory

All durable state lives in `.vault/` at the repo root — Obsidian-openable and gitignored:

```
.vault/
  Perfect/      Perfect.md, config.md, contexts/, directions/, sessions/
  Explorer/     sweeps/, coverage.md, passes.md, state.md
  Research/     one note per run
  Reference/    external tools/services to decide on when the backend is designed
  ShipLoop/     state.md, backlog.md, journal.md, decisions.md, value-case.md
  Lessons/      shared across skills, one file per date
  Patterns/     shared: user-preferences.md, explorer-preferences.md, descoped-reopenable.md
  active-runs.md   the coordination ledger for parallel CLI sessions
```

`.vault/Perfect/directions/` is the queue `/perfect` builds from — `/research` and `/uat` may file
into it, but **only with the user's explicit acceptance**. Seeding it quietly steers a loop the user
owns.

## Setup before first use

- **`/motionize`** needs its own deps: `cd .claude/skills/motionize && npm install`. Its first run in
  this repo must also port `MotionizedGlyph.tsx` + `motionPresets.ts` from the Personas repo into
  `components/ui/` — they do not exist here yet, and the skill says so.
- **`/leonardo` and `/motionize`** need API keys in `.env`: `OPENAI_API_KEY` (or `LEONARDO_API_KEY`),
  plus `GEMINI_API_KEY` / `QWEN_API_KEY` for vision checks.
- **`/uat`** L2 needs a browser driver. Playwright is **not** a dependency here; `/uat init` will ask
  before adding it, and runs L1-only (saying so) if it is absent.

## Not adopted

`patterns/` in this directory was auto-generated by the Personas workspace projection, not by this
adoption. It points at `.claude/patterns/`, which does not exist in this repo, so it will misfire if
invoked — delete it or let the projection stop writing it.
