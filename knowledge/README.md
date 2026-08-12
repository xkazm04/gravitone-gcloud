# Knowledge library

Craft knowledge for making content, organised the way the studio makes it: **per project template,
per production step.** This is the grounding layer the prototype was missing — without it, a surface
for "idea → script" is designed from intuition, and the output is shallow because the *rules* behind
it were never written down.

It is not a wiki of opinions. Every claim here is traceable to a source that actually worked, and is
labelled by how strongly it is known.

**Start with [`CRAFT-BASELINE.md`](CRAFT-BASELINE.md).** It holds the cross-cutting narrative theory —
the but/therefore law, information-gap curiosity, nested loops, anecdote-and-reflection, SCQA — so
per-step docs can talk about their format instead of re-deriving storytelling. It also names the
failure this whole library exists to prevent: the **wiki timeline**, correct facts joined by "and
then", accurate and unwatchable.

```
knowledge/
  README.md                                  ← you are here
  CRAFT-BASELINE.md                          storytelling theory that applies to EVERY step
  ENGINES.md                                 the 7 narrative engines — cross-template
  TONE.md                                    the personalisation layer — cross-template
  templates/<template>/TEMPLATE.md           the format: what it is, its steps, its constraints
  templates/<template>/steps/<nn>-<step>/
      PATTERNS.md      the craft rules for that step — the document the UI is designed against
      params.json      the same rules as machine-readable defaults/ranges the UI can consume
      OPEN-QUESTIONS.md what we do NOT know yet, and which source would settle it
      sources/*.md     one teardown per studied work: structure, evidence, what transfers
      corpus/          the raw material the teardowns cite (transcripts + the scripts that made them)
```

## The evidence contract

A claim without a label is not a claim, it is a preference. Every line in a `PATTERNS.md` carries one:

| Label | Means | Requires |
|---|---|---|
| **MEASURED** | Counted from the corpus | The number, the script that produced it, the sample size |
| **OBSERVED** | Read off a specific moment | `source · [mm:ss]` + the quoted line |
| **INFERRED** | Our reasoning across sources | The observations it rests on, stated |
| **ASSUMED** | Nobody has checked | An entry in `OPEN-QUESTIONS.md` naming what would settle it |

Two rules that keep this honest:

1. **n is always visible.** Two sources is two sources. A pattern seen in both is a hypothesis, not a
   law, and it says so. Sample size lives next to every MEASURED figure.
2. **Sources are quoted, never paraphrased into authority.** If a rule came from one line at 0:07,
   the line is in the doc. A reader who disagrees can go look.

## How it gets written

`/research` writes it. Give the skill a source (a video, an article, a channel) and it produces —
alongside its usual run note in `.vault/` — a **Craft** finding that lands here: a source teardown, an
update to the step's `PATTERNS.md`, and new entries in `OPEN-QUESTIONS.md`. See
`.claude/skills/research/SKILL.md` → *Bucket D — Craft knowledge*.

`.vault/` holds what happened in a session. `knowledge/` holds what we learned about the craft. The
first is disposable and gitignored; the second is the asset, and it is versioned.

## How it gets used

- **Designing a step's UI** (`/prototype`, `/perfect`): read `PATTERNS.md` first. The controls a step
  needs are the parameters the craft actually varies — not the ones an API happens to expose. For the
  Script step that means a **beat composer**, not a text area: see its §12.
- **Defaults in code**: `params.json` is the source of truth for ranges and defaults a surface shows.
  Copy values from it; don't invent a number in a component.
- **Writing a generator prompt later**: the patterns are the spec, and the order matters. A model
  asked to "write a script about X" returns a wiki timeline every time. A model asked to *first* name
  the tension, pick an engine, produce the question stack, and chain beats with but/therefore — and
  only then write prose — produces something with a spine. The composition procedure in
  `01-script/PATTERNS.md` §9 is that prompt's skeleton.

## Current contents

| Template | Step | State |
|---|---|---|
| *(shared)* | — | `CRAFT-BASELINE.md` · `ENGINES.md` (7 engines, n=10, corpus 2018-02-23 → 2026-08-10) · `TONE.md` |
| `short-educational-video` (1–3 min) | `01-script` | n=4 · engines A/B/C · short-form composition MEASURED |
| `mid-educational-video` (3–6 min) | `01-script` | n=3 · engines A/D/E · economy · tech · politics |
| `short-form-clip` (≤60s) | `01-script` | n=3 · engines B/F/G · **nothing measured below 40s** |
| all templates | 02-frames · 03-motion · 04-score · 05-cut | not started |

**10 sources across 6 channels**, each read in full, as of 2026-08-11 (3 research runs).
