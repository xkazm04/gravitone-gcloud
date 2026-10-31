# The bake-off scoring sheet

One row per stack (`kernel`, `hyperframes`, `remotion`). Filled after every
builder's `result.json` exists and the edit round has run; `compare` lays the
clips side by side in `compare.html`.

## 1. Final quality - the operator's eyes (1-5 each)

| | kernel | hyperframes | remotion |
|---|---|---|---|
| sync (cuts on the grid, lines on their times) | | | |
| legibility (lyric type readable at speed) | | | |
| craft (does it look made, not generated) | | | |
| story fit (the picked direction and story) | | | |

The session never fills this block. It is the operator's.

## 2. Long-form stability

Drift at 250 s: take the last lyric line with `confidence` `high` or `medium`
in timeline.json. Extract the frame at its `startS` from the full clip
(`ffmpeg -ss <startS> -i full.mp4 -frames:v 1`) and the frames 1-3 frames either
side. Record the offset in frames between the line's timeline time and the first
frame that shows it. Do the same for a line in the first chorus. Drift = the
difference. 0-1 frame passes.

| | kernel | hyperframes | remotion |
|---|---|---|---|
| offset, first chorus (frames) | | | |
| offset, last line (frames) | | | |
| video duration - audio duration (ms) | | | |

## 3. Render throughput

From `result.json`.

| | kernel | hyperframes | remotion |
|---|---|---|---|
| framesPerSecond | | | |
| full render, minutes | | | |

## 4. Ability to manipulate - the edit round

For each stack, a FRESH agent (Opus, no context from the builder beyond the
stack directory and the pack) applies three fixed requests, one after another:

- **R1** "make the second chorus harder: +50% particle/shake intensity and cutsPerBar 2"
- **R2** "change the lyric typeface and colour of the bridge lines only"
- **R3** "retime the bridge: move its hard cut 2 bars earlier"

Per request record: wall minutes from reading to a verified render of the
affected section; files changed and lines changed (`git diff --stat` in a scratch
repo initialised in the stack directory before R1, or a file diff); `ok` = the
change shows in the re-rendered section and nothing outside it changed (frame
hashes of one untouched section before and after). Written into the stack's
`result.json` as `editRound`.

| | kernel | hyperframes | remotion |
|---|---|---|---|
| R1 minutes / files / lines / ok | | | |
| R2 minutes / files / lines / ok | | | |
| R3 minutes / files / lines / ok | | | |

## 5. Install and dependency risk

| | kernel | hyperframes | remotion |
|---|---|---|---|
| installs on Windows ARM64 without workaround (y/n) | | | |
| install minutes | | | |
| new dependencies (count, notable native ones) | | | |
| blockers, verbatim | | | |

## 6. License

| | kernel | hyperframes | remotion |
|---|---|---|---|
| license, as it applies to this operator | | | |

Read the license text from the installed package, not from memory.

## Weighting - a PROPOSAL for the operator, not a decision

| criterion | weight |
|---|---|
| final quality (1) | 40 |
| ability to manipulate (4) | 30 |
| render throughput (3) | 15 |
| long-form stability (2) | 15 |

Install risk (5) and license (6) are gates, not weights: a stack that cannot
install on this box or whose license does not fit is out whatever it scores.
The operator sets the weights and makes the pick (`pick stack:<name>`).
