---
name: music-clip
version: 2.1.0
memory: none
category: Content
description: Turn one finished track (an mp3, its lyrics and its style prompt in a folder) into a directed music video through stop-and-resume gates - a timeline map (beats, tempo curve, bands, intensity, sections, lyric times with confidence; one Gemini call), Board A (up to 10 grounded mood directions), Board T (3-4 treatments on the picked look - characters, plot, signature device - each with GPU-shot keyframes of a lit three.js scene), Board B (story per section plus a seek-stable hero loop grown from the picked treatment's scene), then a three-stack render bake-off (kernel, HyperFrames, Remotion) scored on quality, editability, throughput and stability. The operator picks at every gate. Wraps pipeline/music-clip.mts (analyze / status / board / pick / pack / compare). Invoke with /music-clip <folder> [verb].
argument-hint: "<folder> [analyze|status|board a|board t|board b|pick a:<id>|pick t:<id>|pick b:<id>|pick stack:<name>|pack|compare]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Agent
---

# Music clip: one track in, a directed video out, the operator picking at every gate

One session walks one track as far as the next stop, then stops. The CLI
(`pipeline/music-clip.mts`) analyses, validates, assembles boards, seals the
bake-off pack and builds the comparison; this skill writes what only a reader can
(directions, treatments and their scenes, a story, a hero loop) and looks at every sheet before it
stops. Every scene and hero author reads `pipeline/music-clip/CRAFT.md` first - it is the bar a
film is held to, the one Board B missed when it came out "a PowerPoint presentation".
Operator doc: `docs/music-clip.md`. Output: `<folder>/music-clip/`.

## The method (2.0.0) - why the boards are in this order

Version 1.0.0 went look -> hero and came out "a PowerPoint presentation": a status panel and type
on black, one rotating cone. Every one of four treatments rose to film stills once five things
changed, and they are the method now:

1. **Research the bar before the first board, not after the first miss.** The quality of current
   clips is a measured thing (CRAFT.md: one lit world and a moving camera, one post chain over
   every frame, transitions as events on the grid, faceless characters, a motif that changes, an
   arc across the choruses). A session that has not read CRAFT.md designs slides.
2. **Separate the look from the film.** Board A fixes palette and type only. Board T then decides
   what the look is FOR: characters, plot per section, ONE signature camera device, the motif and
   how it changes. A hero is never built before a treatment is picked.
3. **Every treatment is judged on rendered frames, not prose.** Keyframes at the SAME track times
   across treatments (like with like), each a real render of the scene page at t.
4. **A world on the GPU, not a page on the CPU.** Headless Chromium reaches the box's GPU through
   ANGLE/D3D11 (`lib/music-clip/gpuShot.ts`); three.js with fog, depth of field, bloom, grade and
   grain at ~0.3-0.6 s per 1080p frame. The CPU (SwiftShader) path is what made v1 flat.
5. **One Opus builder per treatment, in parallel, each self-critiquing.** Each builder opens its
   own PNGs, iterates at least three times against CRAFT.md's checklist, checks motion (t vs
   t+0.5 s) and purity (same t twice), and scores its frames honestly - those scores name the next
   upgrade (on Break the Sequence all four named primitive bodies as the ceiling).
6. **Music is felt in the bodies, not only the lights.** A beat-locked motion of the characters
   (heads nodding on the beat in the refrains, down-stroke landing on the beat, downbeats harder,
   amplitude from the low band) is a closed-form function of `beats` and t - the operator's
   "we would ultimately win" on Unit 0451. Prove it with `cut.mts` (a span as mp4 with the
   track's own audio) before the bake-off, never by stills alone.

## Commands

Proof cut of any scene span with the track under it (GPU, NVENC):
`npx tsx pipeline/music-clip/cut.mts <folder> <scene.html> <startS> <endS> <out.mp4>`; keyframes alone:
`npx tsx pipeline/music-clip/shoot.mts <scene.html> <timeline.json> <outDir> <t...>`.

```bash
npx tsx pipeline/music-clip.mts analyze "<folder>" [--audio "<file>"] --dry|--yes   # --dry: no vendor call; --yes: ONE live Gemini call
npx tsx pipeline/music-clip.mts status "<folder>" --json
npx tsx pipeline/music-clip.mts board a "<folder>"
npx tsx pipeline/music-clip.mts board t "<folder>" [--only <treatment-id>]          # shoots scene keyframes on the GPU
npx tsx pipeline/music-clip.mts board b "<folder>"
npx tsx pipeline/music-clip.mts pick "<folder>" <a:<id> | t:<id> | b:<id> | stack:<kernel|hyperframes|remotion>>
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
| `picked-a` | Stage 1b |
| `board-t` | STOP: waiting for `pick t:<id>` |
| `picked-t` | Stage 2 |
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

## Stage 1b - Board T (after `pick a:<id>`)

Board A chose the look; Board T chooses the film before any hero is built.

1. Read `pipeline/music-clip/CRAFT.md`, then write `music-clip/treatments.json` following
   `pipeline/music-clip/TREATMENTS-PROMPT.md`: 3-4 treatments that keep the picked palette and
   type and vary characters, plot and signature device; one plot beat per section in (section,
   bar, beat); keyframes at the same 4 track times in every treatment.
2. Run `board t` once with no scenes: it validates (every violation listed - fix them all) and
   draws each treatment text-only.
3. Spawn one Opus builder per treatment, in parallel, in ONE message, each building
   `board-t/<id>/scene.html` on the gpuShot contract and iterating with `board t --only <id>`
   (the prompt is in TREATMENTS-PROMPT.md).
4. Run `board t`. A `warnings` entry naming a console error, a frame that did not load, or a
   `SwiftShader` renderer is a defect, not a note.
5. OPEN `music-clip/board-t-sheet.png` and every keyframe PNG; rebuild a blank, black or
   slideshow-still treatment with `--only <id>`.
6. **STOP.** Tell the operator the path of `board-t.html` and of the sheet, and that the answer is
   `pick t:<id>` or free text (revise treatments.json / a scene, re-run `board t`, stop again).

## Stage 2 - Board B (after `pick t:<id>`)

1. Write `music-clip/story.json` and `music-clip/board-b/hero.html` following
   `pipeline/music-clip/STORY-PROMPT.md` and CRAFT.md. The story carries the picked treatment's
   plot into its sections and may name it (`"treatment": "<picks.t>"`; `board b` refuses any other
   id). The hero starts FROM the picked treatment's `board-t/<id>/scene.html` - its world,
   characters, camera device and post chain - not from a blank page. `board b` refuses before a
   treatment is picked.
2. Run `board b`. It refuses a bad story and lints the hero for frame purity.
   The lint only warns; treat every finding as must-fix and re-run. A `warnings` entry saying the three frames are
   identical is a defect, not a note.
3. OPEN `music-clip/board-b-sheet.png` and look; fix; re-run.
4. **STOP.** Tell the operator the path of `board-b.html` and of the sheet, and
   that the answer is `pick b:<id>`, where the id is `story.json`'s `direction`
   (an unknown id makes `pick` list the valid ones) or free text, which means revise and stop again.

## Stage 3 - the film (after `pick t:<id>`)

The stack is decided: our own engine - a `film/index.html` whose frame is a pure function of t,
three.js on the box's GPU (`lib/music-clip/gpuShot.ts`), captured and muxed by `cut.mts`. The
operator settled it on 2026-10-30 after every approved frame of Break the Sequence came from it:
"render speed will not be factor if we can achieve the quality ... stick to this proven variant and
perfect with each scene and clip". The three-stack bake-off (`pack`, `compare`, `pick stack:`)
stays in the CLI, unused by default.

1. **The edit as data.** Write `film/shotplan.json` (per section: the grid unit and a cycle of
   shots, each a set + cam + note) and run `shots`: it expands on the beat grid into
   `film/shotlist.json` and refuses any shot over `maxShotS`. Break the Sequence's rule, from the
   operator: no shot over 3 s, something always happens. Intimate sets build between refrains;
   the army only in refrains and the intense second half.
2. **Core first, then sets in parallel.** One builder owns `film/core/` (renderer, post chain,
   material library, the robot factory with the approved beat-locked motion, timeline helpers) and
   the shot router, and leaves a stub for every set so the film plays end to end. Then one Opus
   builder per set group, in parallel, each touching only its `film/sets/<set>.js`, each shooting
   every one of its shots (start, middle, end) and 4K crops, iterating against CRAFT.md.
3. **Proof cuts with sound** (`cut.mts`) on the refrains and on every new set before the full
   render; the operator judges motion and sync by ear and eye, not by stills.
4. **The full render:** `cut.mts <folder> film/index.html 0 <duration> music-clip/final.mp4`
   (1080p ~1 h on the RTX Spark; `--size 3840x2160` ~4 h). Check frames from the encoded file on
   downbeats.
5. **STOP.** The final's path, duration, the ffprobe line. Notes from the operator go back into a
   set or the plan, never into a one-off patch of the render.

## Rules

- Never push, never commit the operator's folder, never delete the operator's
  files (the mp3, lyrics, style, anything outside `music-clip/`).
- The live analysis is the only spend; no other vendor, no generated stills or
  video in this pipeline.
- Boards carry work text only: names, palettes, lyric words, story beats,
  numbers, risks. No sentence about the board or how to use it.
- Flash limit everywhere: <= 3 flashes per second.
- A stop is a stop: the session ends at it, and the next one starts with `status`.
