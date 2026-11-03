# Music clip craft - what separates a film from a slideshow

Read before writing a treatment, a scene page or a hero. Collected 2026-10-30 from three research
passes after the operator judged Board B (a status panel, type on black, one rotating cone) "a
PowerPoint presentation". Paul Trillo said the same of most AI video: "slideshows where little moves"
(https://nofilmschool.com/ai-music-video). Sources are linked; lines marked *(unverified)* came from
search snippets or general knowledge.

## The three gaps

1. **One lit world, one moving camera.** Not panels on black: a 3D (three.js) or raymarched space with
   foreground / midground / background, fog, motivated light, and a camera that is never locked off.
   The best web-native demo of 2025 (Wunderlust, Assembly 2025 winner, one HTML file,
   https://www.pouet.net/prod.php?which=104627) is a raymarched world with a camera path, tonemapping,
   grading, depth of field.
2. **One post chain over every frame.** Grade, bloom, grain, chromatic aberration, vignette, tone
   mapping - the same chain on every shot is what makes different shots one film (Trillo: one colour
   pass and a "35mm" look). three.js r185 here ships `EffectComposer`, `UnrealBloomPass`,
   `FilmPass`, `BokehPass`, `LUTPass`, `GTAOPass`, `OutputPass`, `RenderTransitionPass`
   (`vendor/three/examples/jsm/postprocessing/`).
3. **Transitions are events on the grid.** Section and phrase boundaries get the big move; inside a
   section, cut on bars and downbeats (music-video-production/cut-rate-follows-the-section).

## The checklist a treatment is held to

1. The camera moves in every shot, and the move is motivated (push, orbit, handheld, rise).
2. Shot length follows the section: verses ~2-4 s (1-2 bars at 125 BPM), choruses ~0.5-1.5 s,
   bridge holds 4-8 s *(norm inferred)*.
3. Cut on downbeats; big transitions only at section changes.
4. Depth: something in front of the subject (debris, sparks, cables, grilles), the subject, a lit far
   wall.
5. One key light per scene, continuous across angles (Simon Meyer's rule,
   https://www.thedaringcreatives.com/creator-stories/simonmeyer-director-ai-music-video-lip-sync/).
6. ONE signature camera device carried through the film (Trillo's endless push).
7. A recurring motif that CHANGES (an eye/visor light white -> red -> green; a counter that counts,
   spins, stops; a lever locked, reached for, pulled).
8. Character continuity: same silhouette, costume, number. Faceless characters (visors, masks,
   robots) make this cheap and kill the lip-sync problem.
9. An arc across the choruses: chorus 1 one unit, chorus 2 a squad, final chorus the mass.
10. Shared texture: one grade, grain, halation across every source (code, plates, video inserts).
11. Impact frames (one white frame, a frame hold, a speed ramp) as punctuation on drops only.
    Flash ceiling <= 3/s.
12. Type lives IN the world - serials painted on chests, HUD on a visor, LED signs - not captions on
    top. Captions never lead the voice (https://github.com/abhinavflac/claude-music-video).
13. Cull hard. Trillo kept ~55 of ~700 clips; a bad take left in is what reads as slop.

## Techniques, ranked by quality gained (each must stay a pure function of t)

1. **3D world + camera path f(t).** A spline (`CatmullRomCurve3`) sampled at t; re-aim per section.
2. **Post chain.** HalfFloat targets (banding in dark scenes), tone map LAST. Grain hashed from
   `floor(t*fps)`. Never `GlitchPass` as shipped: it calls `Math.random` and accumulates delta
   (pmndrs/three both) - seed it or write the glitch as a shader of t.
3. **Shader transitions on downbeats.** Render scene A and B to targets, composite with a
   gl-transitions function (`vec4 transition(vec2 uv)`, progress = ease((t - downbeat)/dur)):
   CrossWarp, Doorway, WindowSlices, GlitchMemories, Pixelize
   (https://github.com/gl-transitions/gl-transitions, MIT).
4. **Displacement / noise wipes:** `step(noise(uv), progress)` with a soft edge, UVs pushed along the
   noise gradient - liquid/ink reveals instead of hard cuts
   (https://github.com/akella/webGLImageTransitions).
5. **Domain-warped fbm** for smoke, steam, sky: `f(p + fbm(p + fbm(p)))`, t in the inner offsets,
   amplitude from the low band.
6. **Light shafts** instead of cones: screen-space radial blur of an occlusion mask from the light's
   screen position (samples, density, decay, exposure); exposure pulses on kicks.
7. **Film language:** grain, gate weave, handheld shake as multi-octave noise of t; stutter by
   holding frames (`t' = floor(t*18)/18`) for a few bars only. (Hexer, Revision 2025:
   https://www.pouet.net/prod.php?which=103982)
8. **Motion blur on whip pans and zoom-throughs:** average N renders at `t + k/N * shutter` (N 5-8,
   180 deg shutter). N x cost - use only on those transitions.
9. **Feedback trails** need the previous frame, so they break a cold seek: re-derive analytically by
   rendering the last K samples, or pre-roll 1-2 s per chunk.
10. **Type as an object:** text on planes in the 3D space, under the same light, DOF and grade;
    revealed by masks timed to the line's onset. Fonts loaded before `__READY__`.

## Characters for a robot-uprising clip (ranked for this pipeline)

| Approach | Ceiling | Notes |
|---|---|---|
| Low-poly 3D robots in three.js | medium-high | `AnimationMixer.setTime(t)` is deterministic (https://threejs.org/docs/pages/AnimationMixer.html). CC0 packs: Quaternius Sci-Fi Essentials (glTF, animated robots, https://quaternius.com/packs/scifiessentialskit.html; check each pack's licence page). Procedural robots from primitives need no download. Instancing gives the crowd. |
| 2.5D plates from local Flux stills | high for worlds | depth map -> displacement / parallax layers, camera as a uniform of t. DepthFlow is AGPL: reimplement the idea, do not vendor it. Needs ComfyUI up. |
| Silhouettes / shadow play | high as a style | rim-lit flat bodies, backlight through vents; hides anatomy; cheap. |
| SDF / procedural (raymarched) | medium | great for the colossal machine and the numbered faces; weak for a hero you care about. |
| AI video inserts (LTX local, Kling/Veo paid) | highest realism | 2-4 hero shots at most, sampled at t once rendered; identity drift; ~1 in 10 kept. |
| SVG/Lottie puppets | low-medium | reads as an explainer; wrong tone for industrial metal. |

## Story devices for the uprising (no lip sync)

Assembly as birth (Cunningham, Bjork "All Is Full of Love": arms build a robot, lights flicker on,
end where it began). The one who stops (synchronised line, one unit breaks it). The eye/visor light
as the awakening. Number to name (a serial worn, glitched, rejected; Janelle Monae "Many Moons").
The machine as Moloch (Metropolis). The lever: one object, three states. The counter as grammar
(verses tally, choruses spin, bridge stops it). Scale escalation (one, a row, the floor, the city).
The sky going dark / the power cut. Return to the opening image, changed.

## Rendering here

Headless Chromium reaches the RTX Spark through ANGLE/D3D11 (`lib/music-clip/gpuShot.ts`
`GPU_ARGS`); three.js + bloom at 1080p measured 0.3-0.5 s per frame including the screenshot. A
4:10 clip at 30 fps is 7,500 frames: budget the post chain against that. Pin the render box: GPU
pixels are not bit-identical across machines.
