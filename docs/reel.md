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
- **A kept cut goes to the Calendar** (`lib/producers/reelActs.ts`): the judged file is copied into the exports
  root as `reel-<slug>-<cut>.mp4` (refused if the bytes are no longer the ones kept) and a youtube slot
  `sl-reel-<slug>-<cut>` is made with the title, description and tags of `<cut>/publish.json`. The time is the
  keep's `calendar: youtube <ISO>` note; **a keep with no note is slotted for the next day at 08:00 UTC**, as an
  article is, and the preview says so before the commit. Uploading to YouTube is the publish worker's and is
  not part of this.

Not exercised in a browser: the Board's rendering of these packets. The headless path (`pipeline/decide.mts`
show, verdict, preview, commit) was run end to end on a temp copy of the F1 reel.

## Not built yet

- **A schedule control on the Board.** The cull desk has none, so a time is typed as a `calendar:` note.
- **A guard on silent cuts.** A cut with no bed can be kept and slotted; only the operator's `sound` reject
  stops it.
- **Byte-stable WebGL.** Antialiased three.js frames on this GPU differ by a few pixels at one level in 1-3% of
  identical cold draws (measured by two builders). `proof` and the render's seek gate both allow 0.05% of
  pixels more than two levels apart, which these pass; a page that needs exact frames turns antialias off.
- **A stronger motion gate.** The inherited gate asks for motion in 3 seconds of the whole cut, which a 60 s
  reel passes trivially.
- **Scout's continuity record.** `/scout` reels still record no steps, lead changes or event plan (registry
  `data-video-virality`, a recorded deviation on `scout-producers`); their data is not in the reel table shape.
