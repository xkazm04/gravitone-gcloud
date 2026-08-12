# The script pipeline — topic → notebook → script

A terminal-first prototype of the studio's first phase. Everything here is being fine-tuned by hand
before any of it becomes UI.

```
   topic                notebook                    script(s)
"Why Bitcoin        research + tension-finding   engine render
 won't rise"    →   (the reusable asset)      →  (disposable)
                                                 ├── reversal-chain (5:00)
                                                 ├── adjudication   (4:10)
                                                 └── derived short  (0:45)
```

## The one design decision

**The notebook is the asset. The script is a render.**

A notebook is researched once and rendered many times — different engines, different lengths,
different creators' tones. That is why the notebook stores *tensions, mechanisms and reversals* rather
than paragraphs: prose is engine-specific, structure is not.

The test this passed in the first run: `script--reversal-chain.md` and `script--adjudication.md` were
built from the identical notebook with **zero additional research**, and they are genuinely different
videos.

## Why a notebook exists at all

The knowledge library's composition procedure begins *"find the tension"* — and
`OPEN-QUESTIONS q3` records that this is the step we can least describe. The notebook is the answer:
it is the artifact where tension-finding happens explicitly, so that script generation never has to.

Ask a model for "a script about Bitcoin" and you get a wiki timeline, because the model is
simultaneously researching, deciding what matters, and writing prose. Splitting research from
rendering is what makes the beat chain possible.

## Files

| File | What |
|---|---|
| `NOTEBOOK-SCHEMA.md` | the notebook contract — what every field is for |
| `RESEARCH-PROMPT.md` | the prompt that turns a topic into a notebook |
| `runs/<date>-<slug>/notebook.json` | one researched subject |
| `runs/<date>-<slug>/script--<engine>.md` | renders |
| `runs/<date>-<slug>/NOTES.md` | what worked, what to change |

## Status

**Run 1 · 2026-08-11 · "Why Bitcoin price does not rise"** — complete. Notebook + three renders. See
that run's `NOTES.md` for the process findings, which are the actual output of this stage.

## What this is not, yet

- **Not automated.** Research was 6 hand-directed web searches. The prompt in `RESEARCH-PROMPT.md`
  describes what a run must produce, not a pipeline that runs itself.
- **Not connected to the app.** Nothing in `app/` reads these files. That is the next transition, and
  the notebook schema is deliberately JSON so it can become a real artifact in the Script phase.
- **Not validated against production.** No script here has been produced, voiced or published, so
  nothing has been tested against a viewer.
