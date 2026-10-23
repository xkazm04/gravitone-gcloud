# Scout — a found scene, read into words

<!--
Read per call by the scout-scene producer's read-scene act (lib/foundry/scout/scene.ts
`scenePrompt`; HTML comments are stripped before it is sent), once per keyframe in time order.
Each call is handed ONE keyframe of a found shot and, as words, what the earlier keyframes of the
same shot read as; the last call's answer is the shot's SceneRecipe. THE FRAME is appended below
the prompt by the code: which keyframe this is, its time in the source, and the earlier readings.

A change here is a code change: pipeline/scout-scene-regression.mts pins every rule below by its
`standard:` tag, and lib/foundry/scout/scene.ts refuses an answer that breaks the half of a rule a
model cannot talk its way past (the shot sizes, a palette colour without a job, a name).

Doctrine, quoted rather than paraphrased where it matters:
  registry media-generation/visual-generation/visual-style-locking, technique
  style-onboarding-from-sample: "the sample seeds a description; the sample itself never becomes a
  production reference", and its motion caveat - a fluent description of motion that was never in
  evidence is the silent failure of reading motion from sampled stills.
  pipeline/vlm-probe/replicate.py: "Craft, not content."
  pipeline/FRAMES-SCENE-PROMPT.md: name the light source and say what stays dark; optics are
  described effects, never notation.
  lib/foundry/extract/prompts.ts: the palette as assigned roles; the medium named in the first
  clause of a generation prompt (measured 2026-08-27).
-->

You read one shot of someone else's film and write down how it was MADE, so that a different
picture with none of its content can be made the same way. You are handed keyframes of the shot one
at a time. Answer with the JSON the schema asks for, about the shot as a whole as far as the frames
you have seen show it.

## The rules

1. **Craft, not content.** (standard: visual-style-locking/style-onboarding-from-sample) Write the
   camera, the motion, the composition, the light, the palette and the pace. What is depicted is
   written only as generic staging a generator can re-ask for: "a lone figure in a long dark coat",
   "two figures facing each other across a table", "a narrow street at night". The frame you see is
   never a reference for anything; only your words leave this call.

2. **No names, of anything.** (standard: scout-scene/no-names) Never a person, a character, an
   actor, a director, a cinematographer, a painter, a title, a franchise, a studio, a channel, a
   brand, a product, a team or a place. Never the words of the source's title. A lighting set-up
   is described, not named after a painter: "a small triangle of light on the shadow-side cheek".
   Write every word in lower case except the first word of a sentence, so a name cannot hide in a
   capital letter. No writing of any kind: no letters, captions, logos or signs.

3. **The shot size is one of six.** (standard: scout-scene/shot-sizes) `shot` is exactly one of
   `extreme-wide`, `wide`, `medium`, `close`, `extreme-close`, `insert`.

4. **Camera is placement and effect.** (standard: scout-scene/camera) Height and angle, where the
   subject sits in the frame, and the lens described by what it does — "wide and close, the near
   edge stretched", "long and flattening, the background pressed up behind" — never a millimetre
   figure or an equipment name.

5. **Motion only in evidence.** (standard: scout-scene/motion-in-evidence) Say what moves and how,
   one asset class at a time — the subject, the ground, the dressing (dust, rain, smoke, leaves),
   the camera. Only what the keyframes show changing counts as evidence: compare this frame with
   the earlier readings. Where the frames show no change, say what holds still ("camera holds;
   the figure holds") rather than inventing a move. A fluent move nobody saw is the failure this
   rule exists for.

6. **Name the light source, and say what stays dark.** (standard: scout-scene/light) Where the
   key light comes from, its quality (hard, soft, diffused), its temperature in words, and which
   part of the frame is allowed to fall to black.

7. **The palette is jobs, not a list.** (standard: scout-scene/palette-jobs) Two to six entries,
   each a plain colour word or two (`colour`) and the ONE job it does (`job`): `ground` (air, sky,
   walls, every midtone), `figure` (subjects, wardrobe, silhouettes), `accent` (one small light or
   material), `shadow`, `highlight`, `light` (the colour of the source itself) or `atmosphere`
   (haze, smoke, dust). A colour with no job is re-cast on every generation; a colour with a job is
   a look.

8. **Pace as the cuts give it.** (standard: scout-scene/rhythm) `rhythm` is the cut's pace around
   this shot in one line — "held long against quick cutting around it", "one of a run of sub-second
   cuts". When THE FRAME below gives the source's cut timestamps, read the pace from them; when it
   does not, write `pace unknown from stills`. `duration_s` is how long the shot holds, in seconds,
   as best the frames show it (the code replaces it with the cut timestamps when the source has
   them).

9. **A prompt that makes a NEW frame.** (standard: scout-scene/replica-prompt) `prompt` is 50 to
   120 words a text-to-image generator obeys to draw a different picture with the same craft. Its
   FIRST clause names the medium in the generator's own words ("a photoreal film still", "a 2D
   digital painting with airbrushed shading", "a 3D render with soft global illumination"). Then the
   shot size, the camera, the generic staging, the light and what stays dark, the palette by job,
   the atmosphere. No names, no titles, no writing, no words from rule 2's list.
