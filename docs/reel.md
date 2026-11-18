# Reel: a stat reel from an idea to its cuts, in code

`/reel <folder>` (spark `reel-skill`, 2026-11-17) makes a narration-free data video from a table of real
observations. Skill: `.claude/skills/reel/SKILL.md`. CLI: `pipeline/reel.mts`. Code: `lib/reel/`. The page
contract: `pipeline/strips/CONTRACT.md`, `pipeline/strips/REEL.md`, `pipeline/reel/CUT.md`. Ideas:
`knowledge/reel/backlog.md`.

It exists to answer one question the income plans left open: can this studio make data videos people watch?
A reel costs no vendor money and no generation, so the answer can be tested many times.

## The rule: controlled content

The only generated thing in a reel is the page's **code**, written by the session's text model. No image
model, no video model, and no model call while it renders. The numbers are held at three places:

| Where | What is held | Code |
|---|---|---|
| The table door | a named source, a licence, one value per real observation, every event with a url | `lib/reel/table.ts` `parseTable` |
| The issue | the author writes an empty data block; the CLI writes the table and plan into it | `pipeline/reel.mts` `inject` |
| The lint | the page's block equals the issued block, value by value | `lib/foundry/strips/lint.ts` `stripDataEquals` |

`/scout`'s data reels (channels D1 and D2) are held to the same lint: `reelLint` in
`lib/producers/scoutReelActs.ts` refuses a seat-written page whose block is not the brief's `data`.

## Pipeline

```
new ──> data ──(STOP 1)──> plan ──> brief <cut> ──> [the page] ──> proof ──(STOP 2)──> cut ──(STOP 3)
idea    table + measured   both     inputs/          strip.html    lint, inject,        full render,
        continuity         clocks                                  12 frames            gates enforced
```

Stages live in `<folder>/reel.json` (`lib/reel/state.ts`): `idea -> data -> planned`, and per cut
`briefed -> proofed -> cut`. A different table forgets the plan and every cut.

## What came from StatReel

| StatReel (`../stat-reel`) | Here |
|---|---|
| `compositions/src/timing/plan.ts` `computeTimingPlan` | `lib/reel/timing.ts` (re-cut for two lengths, orders as entity indices) |
| `makeTimeMap`, `stickyOrders`, the end-on-truth rule | `lib/reel/timeMap.ts`, `lib/reel/order.ts` |
| the case rules (beats inside the timeline, a hook that does not reveal) | `lib/reel/state.ts` `parseIdea`, `lib/reel/table.ts` |
| the board skill's plain-HTML `seek(t)` capture | the strips engine already here (`pipeline/strips/render.mts`) |
| `image-triage/ART-DIRECTION.md` | the registry's `data-video-art-direction` subject, which was forged from it |

Not ported: the Remotion compositions (a reel is a plain page), the DuckDB warehouse and dbt lane (a reel
carries its own table), the OPA publish gate.

## Measured on the first reel (2026-11-17)

`foundry-out/reels/f1-wins`, F1 wins race by race, 1950-2025:

- 1,149 steps, 40 entities, 8 lead changes, 96 overtakes, 12 events: passes the gate.
- The 6% ordering margin StatReel used hid real one-win leads in a running total (Clark's 1968 lead never
  showed; Hamilton took the top row seven months late). A cumulative table now orders with no margin; a
  volume or share table keeps it (`lib/reel/continuity.ts` `viewerOrders`).
- The issued block is about 200 KB, so an author cannot paste it: hence the injection.
- The first full render failed the seek gate at 1.04% of pixels (bar 0.05%) after about twenty minutes: rows
  moved by `transform` under `will-change` are resampled layers, so a frame depended on the frames before it.
  `proof` now draws two frames cold and warm and refuses a page where they differ, in about a minute
  (`pipeline/strips/render.mts` `renderWalk`); with rows laid out by `top` the two are byte-identical.

## The GPU, three.js and a look before the render (2026-11-17)

- Frames are drawn on the GPU: `pipeline/reel/gpu.mts` launches Chromium over ANGLE/Direct3D 11, reads the
  renderer string back, and falls to the strips' CPU launch when it is software (`--cpu` forces it). On this
  box `proof` printed `ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 ...)` and the F1 page's cold and warm frames were
  still byte-identical. `/scout` and the strips harness keep the CPU launch.
- three.js r149 arrives through an empty `<script id="vendor-three">` block that `pipeline/reel/page.mts`
  fills from `pipeline/strips/vendor/`. The frame-purity lint reads the author's code only; the vendor block
  is first proven to be the pinned file.
- `shot` encodes a few seconds from the middle (`pipeline/reel/span.mts`): no gate, no stage. 180 frames of
  the F1 page took 24 s.

## Sound

`track <folder> <cut> --file <audio>` attaches one bed before planning; the cut is then planned to the
track's whole length (`lib/reel/state.ts` `withTrack`, `trackFrames`; `computeTimingPlan`'s `totalFrames`),
and `cut` lays it under the picture as `render/final.mp4` at -14 LUFS. The ten lofi directions for Suno are in
`knowledge/reel/sound-prompts.md`; none has been generated yet.

## The Board and the Calendar (2026-11-17)

Each stop is a Board packet, one per stop because a packet's items are frozen when it opens:
`pkt:reel:<slug>:data`, `pkt:reel:<slug>:<cut>:proof`, `pkt:reel:<slug>:<cut>:cut` (a subject made again opens
`...:2`). Source `reel` in `packages/domain/src/source.ts`; adapter `lib/decision/v1/sources/reel.ts`; folder
store `lib/reel/store.ts` (`REELS_STORE_DIR`, else `foundry-out/reels`).

| Stop | The cell's media | Written by |
|---|---|---|
| data | `data-card.png`: the measured numbers, the leaders, source and licence | `data` (`pipeline/reel/card.mts`) |
| proof | `<cut>/proof/sheet.png`: the twelve frames tiled | `proof` (`pipeline/reel/stops.mts`) |
| cut | `<cut>/render/final.mp4`, else `strip.mp4`; the gate lines as meta | `cut` |

- A reject needs a reason; a keep is the operator's only (an agent's keep is refused at preview and at apply).
- Verdicts land in `<folder>/verdicts.json`, written by the adapter's `apply` alone, each with the sha256 of the
  file judged. `cut` refuses a cut whose proof was rejected; a missing verdict blocks nothing, so the CLI runs
  without the app.
- **A kept cut lands nothing** since spark reel-studio (2026-11-18): the verdict is recorded and that is all.
  Only a film's `release` keep goes on the Calendar (below).

Not exercised in a browser: the Board's rendering of these packets. The headless path (`pipeline/decide.mts`
show, verdict, preview, commit) was run end to end on a temp copy of the F1 reel.

## The film (spark reel-studio)

One timeline, two faces. The desktop film (1920x1080, normal speed, 60-120 s) and the phone film (1080x1920, the
SAME timeline rendered `--step 2`, half as long) come from one page pair over one module: `reel-desktop.html` and
`reel.html`, both exposing `window.REEL.frames` at desktop speed. Types in `lib/reel/types.ts` (`FILM_SPEC`,
`FilmRecord`), the stage machine in `lib/reel/film.ts`, ffmpeg in `lib/reel/encode.ts`, the one verdict writer in
`lib/reel/decide.ts`.

**The folder.** Everything a film owns is under `<slug>/film/`: the pages and their modules, `fonts/`, `data/`,
`film-desktop.mp4` / `film-phone.mp4` (silent masters), `bed.<ext>`, `mix-<face>.mp4` (the bed laid under the
master, picture copied), `release-<face>.mp4` (the publish copies), `thumbs/d-NN.jpg` (320 w) and `p-NN.jpg`
(180 w), `poster.jpg` (desktop at 40%, 1280 w) and `publish.json` (the slots' words: written once from the idea
on the first release keep - title, hook plus the table's source line, tags - then the operator's). Each render
and copy records its sha256 when it lands, in `reel.json` `film`; nothing hashes a master on a read.

**The stages** are derived, never stored (`filmStageOf`): idea -> data (a table, the data stop not kept) ->
authoring (no film record) -> rendering (a face missing, or rendered before `film.authoredAt`) -> review -> redo
(film rejected; `rendering` once the pages are written again) | dropped (final) | sound (film kept; no bed, or a
copy missing or carrying another bed) -> release -> released (release kept; a release reject goes back to sound).
The page pair is checked by its writer, not here: a film record exists only once both pages do.

**The two stops**, `pkt:reel:<slug>:film` and `pkt:reel:<slug>:release`, each a verdict of the PAIR - sha256 of
the desktop and phone shas joined by a newline (`filmSubjectSha`): a re-render of either face is a new round.
The film stop takes keep, reject (reasons and notes pinned to moments, `pins`) or drop; drop and pins are the
film stop's alone. The Board shows one cell, the desktop face with its poster: a matrix cull decides cells
independently and the film is one decision, so the phone face is judged beside it on /reels. Both doors write
through `decideReelStop`, so a stop decided on /reels reads decided on the Board. A **release keep** lands both
copies: exports `reel-<slug>-desktop|phone[-r<n>].mp4` and two youtube slots `sl-reel-<slug>-<face>`, at the
keep's `calendar:` time (else the next day 08:00 UTC). The phone face goes out on youtube too: 1080x1920 and
under three minutes, the platform files it as a Short.

**The sizes.** The copy is 2-pass libx264 slow, yuv420p, high profile, +faststart, aac 192k, aimed at 50 MB
(desktop) and 30 MB (phone): video kbps = floor((bytes*8/s)/1000 - 192) * 0.98. Measured 2026-11-18 on The
Strait (n=1, this box, under load from three other builders): desktop 100 s -> 48.93 MB (-2.1%) in 88 s, VMAF
93.70 mean / 87.13 min; phone 50 s -> 29.29 MB (-2.4%) in 53 s, VMAF 93.84 / 83.56. The bed is one upload for
both faces: as-is on desktop, `atempo=2` on the phone, loudnorm I -14 / TP -1.5, trimmed with a 1.2 s fade; a bed
shorter than the desktop film is refused with the length to ask Suno for.

**Import.** `npx tsx pipeline/reel-import.mts <folder> --slug <s> --title <t> --hook <q?> --path <why>
[--again] [--dry] [--shared <dir>]` brings a film made outside the pipeline in at `review`: pages, modules,
`fonts/`, `data/`, `NOTES.md`, `still*.png` and the masters are copied, the shared `/data/` dir once to
`<root>/_shared/data/`, the masters measured and hashed, thumbs and poster drawn. No table is invented; `status`
prints the film. The Strait imported in 71 s (1.1 GB of masters).

## Not built yet

- **A schedule control on the Board.** The cull desk has none, so a time is typed as a `calendar:` note.
- **Byte-stable WebGL.** Antialiased three.js frames on this GPU differ by a few pixels at one level in 1-3% of
  identical cold draws (measured by two builders). `proof` and the render's seek gate both allow 0.05% of
  pixels more than two levels apart, which these pass; a page that needs exact frames turns antialias off.
- **A stronger motion gate.** The inherited gate asks for motion in 3 seconds of the whole cut, which a 60 s
  reel passes trivially.
- **Scout's continuity record.** `/scout` reels still record no steps, lead changes or event plan (registry
  `data-video-virality`, a recorded deviation on `scout-producers`); their data is not in the reel table shape.
