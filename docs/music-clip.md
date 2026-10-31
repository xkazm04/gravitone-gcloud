# Music clip: one track to a directed video, gate by gate

`/music-clip <folder>` (spark `music-clip`, 2026-10-30) turns one finished track - an mp3, its lyrics
and the style prompt it was made from - into a music video. The operator picks at every gate; the
session stops at each one and the next session resumes from `status`. Skill:
`.claude/skills/music-clip/SKILL.md`. CLI: `pipeline/music-clip.mts`. Code: `lib/music-clip/`
(wire types in `types.ts`). The session's instructions: `pipeline/music-clip/`.

## The pipeline

```
analyze ──> timeline.json ──> Board A ──(pick a:<id>)──> Board T ──(pick t:<id>)──> Board B ──(pick b:<id>)──> pack ──> bake-off x3 ──> compare ──(pick stack:<name>)──> final.mp4
 one Gemini     the map         directions.json        treatments.json          story.json + hero.html     sealed     kernel           compare.html
 call (--yes)                   + a card each          + a GPU-shot scene each  grown from the picked      input      hyperframes
                                                                                scene                                 remotion
```

Stages: `analyzed -> board-a -> picked-a -> board-t -> picked-t -> board-b -> picked-b -> bakeoff -> final`.
Board T was added 2026-10-30, after a Board B built straight on a direction came out "a PowerPoint
presentation": the look (A) and the film (T) are now decided before a hero is built.
`pipeline/music-clip/CRAFT.md` is required reading for every scene and hero author.

| verb | does | stage after |
|---|---|---|
| `analyze <dir> [--yes\|--dry] [--audio f]` | decode, DSP, beats, sections; one Gemini call for line times with `--yes`, none with `--dry`; refuses with neither | `analyzed` |
| `status <dir> [--json]` | stage, picks, artifacts present, next verb; reads only | - |
| `board a <dir>` | validates `directions.json` (<= 10, kebab ids, `#rrggbb` palettes, no empty field), assembles `board-a.html`, shoots `board-a-sheet.png` | `board-a` |
| `board t <dir> [--only <id>]` | validates `treatments.json` (1-4, kebab ids, one plot beat per section in order, 1-6 keyframes each inside the track and in their section, grids in the union), shoots each `board-t/<id>/scene.html` at its keyframes on the GPU, assembles `board-t.html`, shoots `board-t-sheet.png`; `--only` re-shoots one scene and reuses the others' frames | `board-t` |
| `board b <dir>` | needs `pick t:`; validates `story.json` (its optional `treatment` must be the picked one), frame-purity lint on `hero.html`, assembles `board-b.html`, shoots `board-b-sheet.png` at three times, cold and out of order | `board-b` |
| `pick <dir> a:<id>\|t:<id>\|b:<id>\|stack:<name>` | records the operator's pick; idempotent; an unknown id lists the valid ones; a changed pick drops every pick after it | `picked-a` / `picked-t` / `picked-b` / unchanged |
| `pack <dir>` | seals the bake-off input with per-file sha1 and a `packSha1` | `bakeoff` |
| `compare <dir>` | `compare.html`: each stack's clips and numbers side by side | - |

Every verb takes `--json`; an error exits non-zero with one actionable line. The CLI never writes
outside `<dir>/music-clip/` and never opens the studio store.

## Folder contract

In: `<dir>/` holds exactly one `*.mp3` (or `--audio <file>`), `lyrics.txt|lyrics.md`,
`style.txt|style.md|prompt.md|prompt.txt`, and optionally the same track's lossless master (one
`*.wav` or `*.flac`): the analysis reads the mp3, renders (`cut.mts`) mux the master as AAC 320 kb/s.
Out, all under `<dir>/music-clip/`:

| file | written by |
|---|---|
| `timeline.json`, `state.json` | `analyze` |
| `directions.json`, `board-a/<id>.html` | the session (`DIRECTIONS-PROMPT.md`) |
| `board-a.html`, `board-a-sheet.png` | `board a` |
| `treatments.json`, `board-t/<id>/scene.html` | the session and one builder per treatment (`TREATMENTS-PROMPT.md`) |
| `vendor/three/`, `board-t/<id>/frames/` (+ `shot.json`: renderer, ms, console errors) | `board t` |
| `board-t.html`, `board-t-sheet.png` | `board t` |
| `story.json`, `board-b/hero.html` | the session (`STORY-PROMPT.md`) |
| `board-b.html`, `board-b-sheet.png` | `board b` |
| `bakeoff/pack/` (+ `pack.json`) | `pack` |
| `bakeoff/{kernel,hyperframes,remotion}/` (+ `result.json`) | the builders (`BAKEOFF-BRIEF.md`) and the edit round (`SCORING.md`) |
| `compare.html` | `compare` |
| `final.mp4` | `pick stack:<name>`, copied from the stack's `fullMp4` |

The source files are the operator's: nothing in the pipeline moves, rewrites or deletes them.

## The timeline (`TimelineV1`) - what each layer means, and what it does not

The map is built before any treatment is written and every later stage reads it
(music-video-production/track-map-before-treatment). Absent values omit their key; never `null`,
never `0` for unknown.

- **`tempo`**: `bpmGlobal` is detected. `bpmPrior` is the BPM the style prompt names, a prior that
  resolves half/double-time ambiguity and never overrides strong evidence; a disagreement over 5%
  is a warning. `curve` is local BPM about once per bar.
- **`beats`**: a LIST of detected beat times, not a tempo times an index, so the grid follows drift.
  Times are at audio resolution; quantise to frames only when drawing. `downbeat` is the chosen
  phase of four (the one with the most low-band and onset weight): it is a best guess at the bar,
  not a measured downbeat, and on a track that starts off the one it can sit a beat out. `bar`
  counts from the first downbeat; beats before it carry bar 0.
- **`onsets`**: every transient the spectral flux crosses - hi-hats and ghost notes included. They
  are texture. Cuts land on beats and downbeats, never on onsets
  (music-video-production/cut-rate-follows-the-section).
- **`bands`** (`low` <= 150 Hz, `mid`, `high` > 2 kHz, `rms`) and **`intensity`**: per frame at
  30 fps, 0..1, normalised to the track's own 98th percentile - relative to this track, not
  comparable across tracks. `intensity` is smoothed to the bar.
- **`sections`**: energy and novelty boundaries snapped to the nearest downbeat, relabelled from the
  lyrics' tags when the counts agree (a warning when they do not). `cutsPerBar` is the section's
  earned cut rate from its intensity (0.25 / 0.5 / 1 / 2; bridge and breakdown capped at 1) - a
  starting number for the story, written as a number so it is decided once.
- **`lyrics`**: every line of the lyrics file exactly once. With `--yes`, Gemini proposes line
  times; they are validated (monotone, inside the track, end after start), then each start is
  snapped to the nearest onset within 0.35 s. **Confidence**: `high` = snapped under 0.15 s with
  consistent neighbours; `medium` = snapped, less sure; `low` = moved further or out of order
  against the section windows; `section-only` = no line time at all (dry run, no key, a Gemini
  failure, or a line that failed validation) - the line carries its section's span. Gemini's own
  section boundaries are a cross-check only, a warning per boundary more than 3 s off; they never
  move the map's boundaries.
- **`voice`**: sung / synthetic / none spans derived from line times, band energy and the style
  prompt. There are no stems on this box, so **`confirmed` is always `false`**: it is an inference,
  never a measurement of who is singing.
- **`warnings`**: every fallback and disagreement, verbatim. The session says them all at Stage 0.

## The stops

1. After `analyze`: the spend is said before the live call; `--yes` only with the operator's word.
2. After `board a`: the operator answers `pick a:<id>` or free text (a revision).
3. After `board t`: `pick t:<id>` or free text.
4. After `board b`: `pick b:<id>` (the id is `story.json`'s `direction`) or free text.
5. After `compare`: `pick stack:<name>`.

The session looks at every sheet PNG before it stops; a blank or near-copy card is fixed first.

## The treatments (Board T)

A treatment is a film on the picked look: characters that read with no face and no lip sync, how
they are built, ONE signature camera device, a motif that changes, one plot beat per section in
(section, bar, beat), transitions by grid level, shot lengths per section kind, one post chain and
its risk (`TreatmentsV1`). 3-4 per board, each with 1-6 keyframes at the same track times across
treatments so the frames compare like with like.

Each treatment's scene is a lit WebGL page shot on the GPU (`lib/music-clip/gpuShot.ts`): the clip
folder is served on 127.0.0.1 (Chromium refuses module scripts from file://), every other origin is
aborted, three.js comes from `music-clip/vendor/three/`, and each keyframe is drawn by
`window.render(t)` on a fresh page. The renderer string is printed under each treatment; on this box
it is ANGLE/D3D11 on the NVIDIA GPU, and a `SwiftShader` renderer is flagged as the CPU fallback.
Board B's hero starts from the picked treatment's scene.

## The form, the story, the hero

Directions span the form ladder - visualizer, lyric video, concept, hybrid - and name the sections
that earn each move (music-video-production/form-follows-what-the-track-gives). Performance and
narrative appear only as a hybrid with no readable mouth: this pipeline holds no lip sync.

The story addresses every beat as (section, bar, beat), never seconds. The hero loop is a 4-8 s
page whose `window.render(t)` is a pure function of t seconds on the track clock and reads the
timeline slice from `window.__TIMELINE__` (`fps`, `sliceStartS`, `sliceEndS`, and the beats, bands,
onsets, lyrics between hero.startS/endS +-1 s; band arrays start at frame `round(sliceStartS*fps)`). It must render the same pixels for the same t from a cold start, in any order
(video-assembly/seek-stable-composition-authoring) - the same contract the strips keep
(`pipeline/strips/CONTRACT.md`), and the reason the sheet is shot out of order.

Flash limit everywhere: at most three flashes per second (the ceiling in
cut-rate-follows-the-section).

## The bake-off

The render stack is not chosen by taste. After the story is picked, `pack` seals one input and
three Opus builders render the same clip in parallel, each in its own directory:

- **kernel** - a `render(t)` page captured with this repo's headless kernel (`lib/export/headless.ts`,
  `lib/musicVideoExport.ts` `captureFrameSequence`);
- **hyperframes**;
- **remotion** (or Revideo).

Each renders a ~25 s proof (a chorus with a section transition and lyric lines), then the full
track at 1920x1080, 30 fps, h264 yuv420p, the original mp3 muxed untouched, and writes
`result.json`. A fresh agent per stack then applies three fixed edits (R1 harder second chorus, R2
bridge typeface and colour, R3 bridge cut two bars earlier), recording minutes, files and lines
changed. The scoring sheet (`pipeline/music-clip/SCORING.md`) weighs final quality, ability to
manipulate, throughput and long-form stability; install risk and license are gates. Its weighting
is a proposal; the operator decides.

The whole video is one master clock: the render is one pass over the track, not stitched
segments. If a stack ever renders in chunks, each chunk carries its master in-point as data and is
placed by it (music-video-production/segment-on-the-master-clock).

Forging the winning stack into the codebase is a separate follow-up, not part of this pipeline.

## Measurements to fill in

| measurement | Break the Sequence (250 s) | notes |
|---|---|---|
| analysis seconds, dry | | |
| analysis seconds, live | | |
| Gemini cost per track (USD) | | |
| lyric confidence tally (high / medium / low / section-only) | | |
| render fps, kernel | | |
| render fps, hyperframes | | |
| render fps, remotion | | |
| full render minutes, per stack | | |
| drift at 250 s, per stack (frames) | | |

## Not in this pipeline

9:16 cuts, stems and ML alignment, generated plates or stills, kernel jobs and Board packets,
auto-publish.
