# The cut addendum (/reel)

This page is one cut of a stat reel made by `/reel`. `inputs/CONTRACT.md` and
`inputs/REEL.md` hold, except where this file says otherwise. Where they
differ, this file wins.

You are the only author. No image model, no video model and no model call
runs for this reel: what the viewer sees is your code drawing the issued
numbers. There is no approach card, no style reference and no supporting
image, so ignore the sections of the other two files that mention
`inputs/approach.json`, `inputs/assets/` and `inputs/style-reference/`.
Write `out/strip.html` only; no `style.json`.

## The data block is issued, not written

- **You never type a number.** Write the block empty:
  `<script id="strip-data" type="application/json">{}</script>`, exactly one.
  `proof` writes the issued block (`inputs/data.json`) into it, then the lint
  compares the two value by value and refuses a page whose block was rounded,
  cut, reordered or added to afterwards.
- `inputs/data.json` can be hundreds of kilobytes. Read
  `inputs/data.sample.json` instead: the same shape, a few rows.
- Your page must render with the empty block too (draw the title and nothing
  else), so opening the file before `proof` does not throw.
- The block holds two things:
  - `table`: `unit`, `granularity`, `cumulative`, `periods[]` (one label per
    real observation), `entities[{id, name, values[]}]` (`null` = no
    observation: draw the entity as absent, never as zero),
    `events[{id, period, title, date, fact, url}]` and `source`.
  - `plan`: the timing plan for this cut, computed from the table before you
    were asked to draw anything.
- Titles, labels, dates, the event cards' words and the source line come from
  the block and from `inputs/brief.json` (`title`, `hook`, `source.name`).
  Write no fact of your own.

## The clock is the plan's

`plan.sections` gives three parts, in frames: the hook (`0..hookEnd`), the
timeline (`hookEnd..timelineEnd`) and the ending (`timelineEnd..total`).
`window.STRIP.frames` is `plan.sections.total`, which is `brief.frames`.

- **Frame to period.** `plan.knots` is `[[frame, period], ...]`, cumulative.
  The fractional period at frame `i` is a monotone interpolation through the
  knots (Fritsch-Carlson cubic; piecewise linear is acceptable). Before the
  first knot it is period 0, after the last it is the last period. Never run
  a constant "periods per second" clock: the plan already gave busy stretches
  more frames and quiet ones fewer.
- **Order.** `plan.orders[p]` is the top `plan.topN` at period `p`, as indices
  into `table.entities`, in the order the viewer must see (sticky, so
  near-equal entities do not flip every period). Draw rank from it: between
  period `p` and `p+1`, ease each entity's row position from its rank in
  `orders[p]` to its rank in `orders[p+1]`. Do not re-sort by value yourself.
- **Values** interpolate linearly between the two periods around the
  fractional period. A cumulative value never decreases.
- **Events.** `plan.events[k].frame` is where that event's period is reached
  and `dwell` is how long the clock lingers there. Show the card from about
  `frame - dwell/2` and keep it readable for at least 105 frames. Cards enter
  from a side, never over the leader's row, and stack when two overlap.

## The three parts

- **Hook.** The question from `brief.hook`, large, over the first period's
  frame already drawn. It never names who ends on top.
- **Timeline.** The race. The date is always visible, the leader is
  identifiable at every frame, the source line is always on screen.
- **Ending.** The final order holds still; the answer to the hook is said
  once. No call to action, no logo, no invented outro copy.

## The two cuts

`brief.cut` says which this is. One table, two frames:

- `short`: 1080×1920 vertical, 30 to 60 s. Keep the bottom 18% and the top 8%
  free of essential text (the platform's interface sits there). Story text
  at least 26 px; in practice entity names read best at 34 px or more.
- `long`: 1920×1080 landscape, 2 to 4 min. Text at least 46 px. The extra
  width is for the long tail (all `topN` rows with room) and for event cards
  beside the chart, not for decoration.

Do not letterbox one cut into the other. Lay each out for its own frame.

## What draws the frame

SVG, canvas 2D, DOM, CSS 3D, or WebGL. `/reel` draws on the GPU (ANGLE over
Direct3D 11) and falls back to the CPU only when there is none; the CLI prints
the renderer that drew the frames. This overrides REEL.md's "No WebGL".

**three.js** (r149, the classic build that defines a global `THREE`) is
available without typing it: put one empty `<script id="vendor-three"></script>`
BEFORE your own script, and `proof` fills it with the pinned library. Nothing
else may be loaded. A WebGL page must also:

- create the renderer with `preserveDrawingBuffer: true`, a fixed size equal
  to the frame, `setPixelRatio(1)` and `antialias: true`;
- call `renderer.render(scene, camera)` exactly once per `renderFrameAt(i)`,
  synchronously, and never use `setAnimationLoop`, `THREE.Clock` or a mixer
  that advances by delta: every position, rotation, colour and camera move is
  computed from `i`;
- keep ALL text in DOM or SVG layered over the canvas. Text inside a WebGL
  scene is not measured by the legibility gate and shimmers when it moves;
- seed any randomness (particle fields, noise) from a constant, once, at
  setup, or as a closed form of the index. `Math.random` is refused by the
  lint;
- render with the empty blocks too: when `THREE` is undefined (before `proof`
  has filled the block) draw the title and stop;
- make the frame finish before it is photographed: after `renderer.render`,
  read one pixel back (`gl.readPixels(0, 0, 1, 1, ...)`), which blocks until
  the GPU has drawn. Leave geometry buffers at their default usage, not
  `DynamicDrawUsage`. Measured 2026-11-17: without these, a frame was read
  before it was complete and the seek check failed on a handful of pixels;
- prefer `MeshLambertMaterial` and plain colours to `MeshStandardMaterial`
  and shader `pow`/`exp`: antialiased edges under the heavier material came
  out one level different in about 8% of identical draws, against 1 to 3%.

3D is a device, not a decoration: use it when depth carries something the
flat frame cannot (a globe for launches, a terrain for a stream, a camera that
follows the leader). The numbers still have to be readable at a glance on a
phone.

## Move things by layout, not by layer

A frame must be the same picture whether it is drawn cold or after the frames
before it; `proof` draws two frames both ways and refuses a page where they
differ. Measured on the first reel (2026-11-17): rows moved with
`transform: translate(...)` under `will-change: transform` failed it at 1.04%
of pixels, because a composited layer is rasterised once and then resampled
at each new offset. So:

- Move an element with `top` and `left` (or SVG `x`/`y`, or redraw the
  canvas). No `will-change`, no `transform` on anything that holds text.
- Set every property you ever set on EVERY frame the element is visible, not
  only on the frames where it changes.
- Keep no variable that survives a call to `renderFrameAt`.

## Before you stop

Open your page at frame 0, at a frame in the middle and at the last frame in
your head, and check: is every number on screen from the block; is the leader
obvious; is the date visible; does the frame change between two frames 30
apart anywhere in the timeline.
