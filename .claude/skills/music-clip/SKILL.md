---
name: music-clip
memory: none
category: Content
description: Turn one finished track (an mp3, its lyrics and its style prompt in a folder) into a directed music video through stop-and-resume gates - a timeline map (beats, tempo curve, bands, intensity, sections, lyric times with confidence; one Gemini call), Board A (up to 10 grounded mood directions), Board B (story per section plus a seek-stable hero loop), then a three-stack render bake-off (kernel, HyperFrames, Remotion) scored on quality, editability, throughput and stability. The operator picks at every gate. Wraps pipeline/music-clip.mts (analyze / status / board / pick / pack / compare). Invoke with /music-clip <folder> [verb].
argument-hint: "<folder> [analyze|status|board a|board b|pick a:<id>|pick b:<id>|pick stack:<name>|pack|compare]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Agent
---

# Music clip: one track in, a directed video out, the operator picking at every gate

One session walks one track as far as the next stop, then stops. The CLI
(`pipeline/music-clip.mts`) analyses, validates, assembles boards, seals the
bake-off pack and builds the comparison; this skill writes what only a reader can
(directions, a story, a hero loop) and looks at every sheet before it stops.
Operator doc: `docs/music-clip.md`. Output: `<folder>/music-clip/`.

## Commands

```bash
npx tsx pipeline/music-clip.mts analyze "<folder>" [--audio "<file>"] --dry|--yes   # --dry: no vendor call; --yes: ONE live Gemini call
npx tsx pipeline/music-clip.mts status "<folder>" --json
npx tsx pipeline/music-clip.mts board a "<folder>"
npx tsx pipeline/music-clip.mts board b "<folder>"
npx tsx pipeline/music-clip.mts pick "<folder>" <a:<id> | b:<id> | stack:<kernel|hyperframes|remotion>>
npx tsx pipeline/music-clip.mts pack "<folder>"
npx tsx pipeline/music-clip.mts compare "<folder>"
```

The folder holds exactly one `*.mp3` (or name it with `--audio`), `lyrics.txt|lyrics.md`
and `style.txt|style.md|prompt.md|prompt.txt`. A missing file is named by the CLI.

## Resume first, always

Every session starts with `status`. It prints the stage, the picks, which
artifacts exist and the next verb. Continue from there; never redo a stage the
state says is done unless the operator asks.

| stage | next |
|---|---|
| (none) | Stage 0 |
| `analyzed` | Stage 1 |
| `board-a` | STOP: waiting for `pick a:<id>` |
| `picked-a` | Stage 2 |
| `board-b` | STOP: waiting for `pick b:<id>` |
| `picked-b` | Stage 3 |
| `bakeoff` | Stage 3 (resume the stacks without a result.json), or STOP for `pick stack:<name>` |

## Stage 0 - analyze. The one rule: say the spend

The only vendor is Gemini: ONE call that times the lyric lines against the audio.
Everything else is local DSP and costs nothing.

1. Run `analyze` dry first. It spends nothing and writes a valid timeline
   with every lyric line `section-only`. With neither flag the CLI refuses and
   prints the plan.
2. Say to the operator: "one Gemini call (lyric line times) on <file>, ~<MB> MB
   of audio" and what the dry map already shows (bpm, section count).
3. Re-run `analyze` live only when the operator agrees, or when their own
   message already asked for it. Never on your own judgement.
4. Read `timeline.json` `warnings` and say every one, verbatim. Then say: bpmGlobal
   (and bpmPrior if present), the sections (label, start-end, intensity,
   cutsPerBar) and the lyric confidence tally (high / medium / low /
   section-only). A changed mp3 resets state to `analyzed`; the CLI says so.

## Stage 1 - Board A

1. Write `music-clip/directions.json` and `music-clip/board-a/<id>.html`
   following `pipeline/music-clip/DIRECTIONS-PROMPT.md`: up to 10 directions
   across the form ladder (lyric video, concept, hybrid, visualizer), varying
   animation style, colour and story theme, each grounded in THIS track's map
   (cite sections and intensity).
2. Run `board a`. A refusal lists every violation: fix them all and re-run.
3. OPEN `music-clip/board-a-sheet.png` with Read and look. Fix blank, clipped,
   illegible or near-duplicate cards; re-run.
4. **STOP.** Tell the operator the path of `board-a.html` and of the sheet, and
   that the answer is `pick a:<id>` or free text. Free text ("the third one but
   colder") means: revise directions.json, re-run `board a`, stop again.

## Stage 2 - Board B (after `pick a:<id>`)

1. Write `music-clip/story.json` and `music-clip/board-b/hero.html` following
   `pipeline/music-clip/STORY-PROMPT.md`.
2. Run `board b`. It refuses a bad story and lints the hero for frame purity.
   The lint only warns; treat every finding as must-fix and re-run. A `warnings` entry saying the three frames are
   identical is a defect, not a note.
3. OPEN `music-clip/board-b-sheet.png` and look; fix; re-run.
4. **STOP.** Tell the operator the path of `board-b.html` and of the sheet, and
   that the answer is `pick b:<id>`, where the id is `story.json`'s `direction`
   (an unknown id makes `pick` list the valid ones) or free text, which means revise and stop again.

## Stage 3 - the bake-off (after `pick b:<id>`)

1. Run `pack`. Say the `packSha1`.
2. Spawn THREE builder subagents in parallel, in ONE message (Agent tool,
   `model: opus`), one per stack, each in its own worktree or directory:
   - **kernel**: its own `render(t)` page on `lib/export/headless.ts` +
     `lib/musicVideoExport.ts` capture;
   - **hyperframes**;
   - **remotion** (or Revideo; the builder says which in `notes`).

   Each prompt: "Read `pipeline/music-clip/BAKEOFF-BRIEF.md`. Your stack:
   <stack>. The sealed pack: <folder>/music-clip/bakeoff/pack (packSha1
   <sha>). Your directory: <folder>/music-clip/bakeoff/<stack>/." Each builds
   the ~25 s proof (a chorus with a section transition and lyric lines), then
   the full clip, and writes `bakeoff/<stack>/result.json`.
3. When all three report: check each pack file's sha1 against `pack.json`
   `files` (a changed file voids the runs that read it; `pack` seals, it does not
   verify). Then run the edit round from `pipeline/music-clip/SCORING.md`:
   a FRESH Opus agent per stack applies R1, R2, R3 and records `editRound` into
   that stack's `result.json`. Fill sections 2-6 of the scoring sheet; leave
   section 1 (the operator's eyes) empty.
4. Run `compare`. Check every clip `compare.html` points at exists and plays
   (`ffprobe`); a "no result" cell names a stack that did not finish.
5. **STOP.** Tell the operator the path of `compare.html`, the filled sheet,
   the proposed weighting (marked as a proposal), and that the answer is
   `pick stack:<name>`.

## Stage 4 - the final

`pick stack:<name>` sets the stage to `final` and copies the winner's
`fullMp4` to `music-clip/final.mp4` (it refuses when the stack has none). Say its path, duration and the ffprobe line. Forging
the winning stack into the codebase is a separate follow-up; say so and do not
start it.

## Rules

- Never push, never commit the operator's folder, never delete the operator's
  files (the mp3, lyrics, style, anything outside `music-clip/`).
- The live analysis is the only spend; no other vendor, no generated stills or
  video in this pipeline.
- Boards carry work text only: names, palettes, lyric words, story beats,
  numbers, risks. No sentence about the board or how to use it.
- Flash limit everywhere: <= 3 flashes per second.
- A stop is a stop: the session ends at it, and the next one starts with `status`.
