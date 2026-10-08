# The strip contract

You are writing ONE strip: an 8-second piece of motion design whose every frame
is computed by code you write. A harness opens your page in headless Chromium,
calls your frame function 240 times, screenshots the viewport after each call,
and encodes the frames to video. Nobody watches your page play in real time.

Read everything in `inputs/` before writing anything:

- `inputs/brief.json` holds the case and the data or facts. **Use only these
  numbers and facts. Do not invent, round up or "fill in" values.**
  If the brief carries `recommendedStart`, start the timeline there: earlier
  years have missing countries and would rank them falsely. If it carries a
  `caveat` or `source.notes` that limits what the numbers mean, the on-screen
  title and source line must not claim more than that.
- `inputs/approach.json` holds the artistic approach you are executing: name,
  medium, motion grammar, density, direction and falsifier. The falsifier is
  the way this approach most likely fails. Design against it.
- `inputs/assets/`, when present, holds a supporting image (texture or
  backdrop) to embed. It contains no text.
- `inputs/feedback.md`, when present: you are fixing an earlier render. It
  holds the contact sheet path, the gate results and the lint errors. Look at
  the contact sheet image before editing.
- `inputs/style-reference/`, when present, is round 2. It holds a kept
  `strip.html` and `style.json` from another case. Re-create that style
  faithfully on this case by reusing its module, not by re-imagining it.

Write exactly two files:

- `out/strip.html`
- `out/style.json`

## Frame size and timing

- The edu lane is 1920×1080. The stat lane is 1080×1920 (vertical).
- 30 fps, 240 frames (`i = 0..239`, `t = i / 30` seconds).
- No audio.

## The page API (required)

```js
window.STRIP = { width: W, height: H, fps: 30, frames: 240 };

// Draw frame i completely. Must be a PURE function of i: same i, same pixels,
// whatever was rendered before, in any order. May return a Promise.
window.renderFrameAt = function (i) { /* ... */ };

// Lets the triage lightbox scrub a live preview. Keep it exactly like this.
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "strip-frame") window.renderFrameAt(e.data.i | 0);
});

// Set when fonts, embedded images and any setup are ready. The harness waits for it.
window.STRIP_READY = true; // or a Promise that resolves when ready
```

The page must render frame 0 on its own when opened, so a person opening the
file sees something.

## Frame purity (the lint rejects violations before any render)

Every value on screen must be derived from `i` alone.

- **Banned:**
  - `Date.now`, `performance.now`, `new Date()` with no argument
  - `Math.random`. Use a seeded PRNG, e.g. mulberry32 with a constant seed,
    and re-seed it from `i` or from a fixed seed inside each frame.
  - `requestAnimationFrame`, `setTimeout`, `setInterval`
  - Running CSS animations or transitions
- **CSS animation is allowed only when it is paused and driven by `i`.** Use
  `animation-play-state: paused` with `animation-delay: calc(-1s * var(--t))`.
  Or use Web Animations `anim.currentTime = t * 1000` on a paused animation.
- **Never animate "from the current value".** Compute every property from `t`
  with explicit start and end values. Two tweens on one property must have
  explicit endpoints.
- **Particles and simulations** must be closed-form in `t`, or re-simulated
  from a fixed seed up to frame `i` on every call. Never carry state from the
  previous call.
- **No network.** Do not use `fetch`, XMLHttpRequest or external `src`/`href`.
  Inline everything: fonts as `@font-face` with `src: local(...)` falling back
  to generic families, images as `data:` URIs from `inputs/assets/`. Any
  vendored library is provided under `inputs/vendor/` and must be inlined in
  a `<script>` tag.
- **No randomness in layout.** Fonts are local and generic, so use a
  well-known system stack, for example:
  - sans: Segoe UI, Arial
  - serif: Georgia, Times New Roman
  - mono: Consolas, Courier New
  - display: Impact, Arial Black

## Craft floor (gates measure these; the operator judges everything else)

- **Legibility:** any text that carries story or data is at least **26 px at
  1080 wide**. That is 26 px in the stat lane and about 46 px in the edu
  lane, which is 1920 wide. Keep text inside a safe box inset 6% from every
  edge. In the stat lane, keep the bottom 18% free of essential text.
- **One authority per frame:** one hero (the data or the mechanism), at most
  one evidence or label card, one title.
- **At most two motion cues per frame**, each selling a named beat: a lead
  change, an arrival, a step in the mechanism.
- **Data strips:**
  - The year or date is always visible.
  - The leader is identifiable at every frame.
  - The source line (from `brief.source.name`) is always on screen, small but
    at least 26 px at 1080 wide.
  - Plan time from the data: denser periods get more frames.
  - Never use a broken or trick axis.
  - Each entity keeps its colour for the whole strip.
- **Edu strips:**
  - Show the brief's `steps` as a causal chain the viewer can follow in
    8 seconds, and meet the brief's `countable` expectations exactly.
  - On-screen labels come only from `steps` and `facts`.
- **Motion:** something meaningful changes in at least 3 of the 8 seconds.
  Never use black frames.
- **No logos, trademarks, flags drawn from memory, or likenesses of real
  people.** Use names as typography and colour-code by entity.

## style.json (the reusable half)

The style JSON describes the look as a module someone could re-use on another
case:

```json
{ "name": "...",
  "palette": [{"role":"ground","hex":"#..."},{"role":"ink","hex":"#..."},{"role":"accent","hex":"#..."}],
  "type": [{"family":"Georgia, serif","role":"headline","weight":700}],
  "motion": {"easing":"cubic-bezier(...) or name","cues":["..."],"tempo":"..."},
  "primitives": ["named drawing functions or components your strip defines"],
  "textures": ["how texture is made: procedural pattern, filter, or the supplied asset"],
  "notes": "the one or two moves that make this style recognisable" }
```

In `strip.html`, keep the style tokens (palette, type, easing) and the
primitives in one clearly marked block at the top of the script, so that the
module is separable from the case.

## When done

Reply with three lines:

1. what the strip shows
2. which beat each motion cue sells
3. what you did against the falsifier
