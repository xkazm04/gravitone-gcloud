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

## Not built yet

- **Sound.** Cuts are silent, so nothing here is publishable as it stands.
- **Publishing.** A reel cannot reach the Calendar or YouTube; `lib/publish/exports.ts` does not list reel
  folders.
- **The Board.** A reel's stops are in the session, not a Board packet.
- **three.js.** The harness runs Chromium with the GPU off (`pipeline/strips/render.mts`); a WebGL page
  renders black. `lib/music-clip/gpuShot.ts` is the GPU path a later form would use.
- **A stronger motion gate.** The inherited gate asks for motion in 3 seconds of the whole cut, which a 60 s
  reel passes trivially.
- **Scout's continuity record.** `/scout` reels still record no steps, lead changes or event plan (registry
  `data-video-virality`, a recorded deviation on `scout-producers`); their data is not in the reel table shape.
