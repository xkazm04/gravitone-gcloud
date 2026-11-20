# The film for one stat reel

You write the code of a narration-free data film: two pages and one shared module, drawn frame by frame by a
headless browser on this machine's GPU and encoded to video. No image model, no video model, no model call at
render time: your code is the only generated thing, and the only numbers it may show are the ones in
`/data/table.json`. You cannot see your film; the operator will.

## Read first

- `inputs/IDEA.md` - the question the opening asks, and why someone keeps watching.
- `inputs/table.json` and `inputs/continuity.json` - the numbers (the page loads them from `/data/`, never from a
  copy in your code) and their measured shape: steps, leaders, lead changes, overtakes.
- `inputs/LOOK.md` - the owner's standard for every reel, rules 1 to 17. It outranks your taste.
- `inputs/SHARED-DATA.md` - the flags, maps and fonts `/data/` serves.
- `inputs/NOTES.md`, when it exists - the operator's notes on the last film, pinned to moments of it in time order.
  Each is a change you owe. `inputs/previous/` holds that film's pages: keep what no note touched.

## The page contract

Write into `out/`:

- `reel-desktop.html` (1920x1080) and `reel.html` (1080x1920). Both load ONE shared module (`out/<name>.js`) that
  draws the reel; each page only says its size. The desktop film is recomposed for landscape, never the phone
  frame boxed.
- `reel.json`: `{"frames": N}` - the timeline's length at desktop speed, the same number `window.REEL.frames`
  holds on both pages. 30 fps; the desktop film runs **60 to 120 seconds** (1800 to 3600 frames), as long as the
  reel needs to be readable.

Each page sets, from the module:

```js
window.REEL = { width, height, fps: 30, frames }   // frames = the whole timeline at desktop speed, on BOTH pages
window.renderFrameAt = (i) => void | Promise       // draw frame i completely, a pure function of i
window.REEL_READY = true | Promise                 // set once fonts, images, shaders and data are loaded
```

- **Pure in i.** Frame i drawn cold equals frame i drawn after every frame before it. No `Math.random` (use a seeded
  generator), no `Date.now`, no `requestAnimationFrame`, no `setInterval`, no state carried between calls that a
  cold draw would not rebuild.
- **Served, not opened.** The film folder is served at `/` over http on 127.0.0.1. Data and fonts come from
  `/data/` (the film's own `data/` first: `table.json`, `continuity.json`; then the shared folder). three.js r187
  comes from `/three/` (`/three/build/three.module.js`, `/three/examples/jsm/...`; use an import map). Every request
  to another origin is aborted: nothing from a CDN, no web fonts from the network.
- **The phone film is the same timeline at 2x.** It is rendered every second frame (`step 2`), so it lasts half as
  long. A card visible 3 s on desktop is 1.5 s on the phone: design for that.

## The owner's rules for every film (the night of 2026-11-17, verbatim first)

> "stopping the time when order is change is disturbing nad breaks continuity"
> "again, time stops are disturbing, we don't need them. If two event cards happen between same time track we can
> stack them on top of each other"

1. **The clock never stops.** No holds, no freezes, no slow-downs at a lead change, an overtake or a card. A change
   is staged by the motion itself on a running clock. Easing the clock's speed smoothly over long stretches (busy
   decades slower than empty ones) is allowed, if it never stops and never jerks.
2. **Event cards stack.** When cards overlap in time the newer lands on top of the stack (or beside it) while the
   older stays readable; nothing waits for a card. A card lives at least 3 s of desktop time.
3. The opening asks the question; the ending holds the answer (a still frame at the END is not a time stop).
4. Every number on screen is one the table holds. No logos, no likeness of a real person, no photographs, no scraped
   artwork. Fonts and libraries are the vendored, openly licensed ones `/data/` and `/three/` serve.
5. **Legibility floors.** Phone (1080x1920): essential text out of the top 8% and the bottom 18%; names and values at
   least 32 px. Desktop (1920x1080): essential text out of the bottom 12%; names and values at least 28 px.
6. **Your own art direction.** Calm beats busy: one moving idea per frame. Two tones are a limit, not a style. Maps
   are precise or absent. A reel that looks like a sibling of another has failed (LOOK.md rule 10).

## Never

- A number that is not in `/data/table.json`. A source line on screen (LOOK.md rule 6).
- Writing anywhere but `out/`. Files other than `.html`, `.js`, `.mjs`, `.css` and `reel.json` are not landed.
