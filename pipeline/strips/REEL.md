# The reel addendum

This strip is a stats reel: a data video proposed for a /scout night's triage.
Everything in `inputs/CONTRACT.md` holds, except where this file says
otherwise. Where the two differ, this file wins.

You are not competing against other approach cards. The approach in
`inputs/approach.json` is your own design for this topic: execute it as well
as it can be executed.

## The data block (the lint rejects violations before any render)

- **Every number the strip shows lives in ONE block:**

  ```html
  <script id="strip-data" type="application/json">{ ... }</script>
  ```

  Read it with `document.getElementById("strip-data")` and `JSON.parse` its
  text. There is exactly one such block, and its body is valid JSON.
- **No number literal for data anywhere else.** Values, labels, dates, the
  entities and their order all come from the block. Constants of the craft
  (sizes, margins, easing, frame counts) are not data and stay in code.
- **The block will be replaced whole.** If this reel is kept, its real data
  replaces the block with the same shape, and the motion must still work:
  derive the scale, the axis range, the timing plan and the ranking from the
  block, never from the numbers you happen to see in it today.
- Put the brief's `data` in the block as it is. Do not round, extend or
  "fill in" values.

## The brief is illustrative

`inputs/brief.json` carries `illustrative: true`. Its numbers are plausible,
not real. So:

- The always-on source line reads exactly `illustrative data`.
- The title and the hook must not claim the numbers are real.

## Make a data video worth watching

The idea passed the stage that asks why someone keeps watching this chart
now. Your strip has to earn the same answer, second by second
(data-video-virality: continuity-gate, path-over-conclusion).

- **The screen changes at every step.** Many entities moving against each
  other, not one value at a time. No single-value ladder, no record or
  winners list, no fill-in that only switches on.
- **The path matters more than the conclusion.** Lead changes, overtakes,
  crashes and comebacks along the way are the beats. A payoff that lives
  only in the last frame fails.

## The frame

What holds the eye frame by frame (data-video-art-direction):

- **The chart form follows the story** (case-native-chart-form). A crossing
  is a line race, a ranking is a bar race, a share is a stream that crosses.
- **Legibility is a floor** (legibility-floor): story and data text at least
  26 px at 1080 wide.
- **At most two motion cues a frame** (motion-cue-budget), each selling a
  named beat of the path.

## No WebGL

The harness runs Chromium with the GPU off. A WebGL canvas renders black.
Use SVG, canvas 2D, DOM or CSS 3D.
