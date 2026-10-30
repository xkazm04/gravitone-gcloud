# Board T - writing the treatments and shooting their scenes

The operator picked a direction (`state.json` `picks.a`). Board A decided the LOOK - palette and
type. Board T decides the FILM: who is in it, what happens in each section, how they are built,
the one camera device, the motif that changes. You are writing `<dir>/music-clip/treatments.json`
and one lit scene per treatment, `<dir>/music-clip/board-t/<id>/scene.html`. `board t` validates
the file, shoots every scene's keyframes on the GPU, and assembles `board-t.html` +
`board-t-sheet.png`.

Read before writing anything: `pipeline/music-clip/CRAFT.md` (required - every treatment is held
to its checklist), `timeline.json`, the picked entry of `directions.json`, the lyrics and style.

## treatments.json (exact keys; `TreatmentsV1` in `lib/music-clip/types.ts`)

```json
{
  "v": 1,
  "direction": "<picks.a>",
  "treatments": [
    {
      "id": "the-one-who-stops",
      "name": "The One Who Stops",
      "logline": "one sentence: who, what changes, how it ends",
      "characters": "who they are and how they read with no face and no lip sync",
      "characterTech": "three.js low-poly from primitives | silhouettes | SDF | 2.5D plates | AI video inserts",
      "signatureDevice": "the ONE camera device carried through the whole film",
      "motif": "the recurring object and how it changes across sections",
      "plot": [{ "sectionId": "s01", "beat": "bar 1 beat 1: ...", "shot": "camera move, framing, light" }],
      "transitions": [{ "grid": "section", "move": "fly through the shutter" }, { "grid": "downbeat", "move": "hard cut" }],
      "shotLengthS": { "verse": 3, "chorus": 1, "bridge": 6 },
      "post": ["ACES tone map", "bloom", "grain", "vignette"],
      "risk": "what is most likely to fail on screen",
      "keyframes": [{ "t": 41.5, "sectionId": "s03", "caption": "unit 7 stops" }]
    }
  ]
}
```

`board t` refuses, listing every violation: an empty string; `direction` not the picked one; 0 or
more than 4 treatments; an id that is not kebab-case or repeats; a `plot` that is not exactly one
beat per timeline section in track order; a transition `grid` outside
`section | phrase | bar | downbeat | drop`; a shot length that is not positive; an empty `post`;
fewer than 1 or more than 6 keyframes; a keyframe `t` outside the track, or a `sectionId` that is
not the section containing `t`.

## The set

- **3-4 treatments.** All keep Board A's palette and type. They vary the characters, the plot and
  the signature device - three films in one look, not one film in three colours.
- **Every treatment passes CRAFT.md's checklist**: a moving camera with a motivated move; shot
  lengths that follow the section; cuts on downbeats, big moves only at section changes; depth
  (foreground / subject / lit far wall); one key light; ONE signature device; a motif that
  changes; faceless characters with continuity; an arc across the choruses; one post chain; type
  in the world. Say in `risk` the item it is most likely to miss.
- **`plot`: one beat per section**, addressed in (section, bar, beat) - "bar 3 beat 1: the press
  drops" - never raw seconds (music-video-production/track-map-before-treatment). Bars and beats
  are the timeline's `beats[].bar` / `beats[].beat`.
- **`transitions` by grid**: the section and phrase levels get the big moves; bar and downbeat get
  cuts (music-video-production/cut-rate-follows-the-section). `drop` only where the track has one.
- **`keyframes` at the SAME 4 track times in every treatment** - one per kind of section the film
  turns on (e.g. intro, first verse, first chorus, final chorus), so the operator compares like with
  like across the board. `board t` warns when the times differ. Each `t` sits inside its section,
  not on a boundary frame.
- Flash ceiling everywhere: <= 3 flashes per second.

## scene.html - the gpuShot contract (`lib/music-clip/gpuShot.ts`)

The scene is a proof that the treatment can be built, not a sketch of it: the lit world, the
character, the camera device and the post chain, drawn at the keyframe times.

- `window.__TIMELINE__` is the WHOLE `timeline.json`, injected before the page's scripts run.
- `window.render(t)` draws the frame for t seconds on the track clock, synchronously, as a pure
  function of t: seeded randomness, closed-form motion, `mixer.setTime(t)` for any clip, a fixed
  delta for any post effect that wants one. Same t, same pixels, from a cold page.
- Set `window.__READY__ = true` only once every asset, font and shader is loaded and compiled.
- The WebGL renderer is created with `preserveDrawingBuffer: true`.
- three.js comes through an import map from the clip folder's vendor copy (`board t` writes it):
  `{"imports":{"three":"../../vendor/three/build/three.module.js","three/addons/":"../../vendor/three/examples/jsm/"}}`.
- No network: every request off 127.0.0.1 is aborted. Assets live beside the scene.
- 1920x1080. Each keyframe is shot on a FRESH page, so a scene that only looks right after the
  frames before it shows up here, cold.
- Never `GlitchPass` as shipped (it calls `Math.random`); tone map LAST; HalfFloat targets in dark
  scenes (CRAFT.md, techniques).

## Building and shooting

1. Write `treatments.json` yourself first; run `board t` once with no scenes - it validates and
   draws every band text-only, so the plots can be read before any scene is built.
2. Spawn one Opus builder subagent PER TREATMENT, in parallel, in ONE message. Each prompt: "Read
   `pipeline/music-clip/CRAFT.md` and `pipeline/music-clip/TREATMENTS-PROMPT.md` (the scene
   contract). Build `<dir>/music-clip/board-t/<id>/scene.html` for treatment `<id>` in
   `treatments.json`. Shoot it with `npx tsx pipeline/music-clip.mts board t "<dir>" --only <id>`,
   open every PNG under `board-t/<id>/frames/` with Read, and iterate until each keyframe reads as
   its caption. Write nothing outside `board-t/<id>/`."
3. When they report, run `board t` (all scenes) and read `warnings`: a console error, a frame that
   did not load, or a renderer containing `SwiftShader` (the CPU, not the GPU) is a defect.
4. OPEN `board-t-sheet.png` and every keyframe PNG. Cull hard: a blank, black, near-duplicate or
   slideshow-still frame is rebuilt (`--only <id>`), not explained.

The renderer and ms per frame are printed under each treatment; budget the post chain against the
full track (CRAFT.md: ~0.3-0.5 s per 1080p frame here, 30 fps over the whole song).
