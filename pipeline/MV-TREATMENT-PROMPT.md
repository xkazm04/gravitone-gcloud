<!--
  MV-TREATMENT-PROMPT — read per call by lib/sound/mv/treatment.ts (TurnClass "mv-treatment").
  Sections: `shared` is always sent; then `image` (a new still prompt + motion) or
  `motion` (new motion over the SAME still; the answer's schema holds `motion` only).
  Slots: {{TITLE}} {{ANALYSIS}} {{NOTE}} {{PROMPT_MAX}} {{CURRENT}}.
  Text before the first section marker is never sent.

  What code does with the answer, so this file does not have to ask twice:
  every number is clamped into range; the no-text clause is appended to the
  prompt; the no-text words are welded into the negative prompt; the prompt is
  cut to fit Leonardo's 1500 characters.
  The code-drawn pulsing element (halo/ring/light/orb) was descoped on 2026-10-12,
  so this file no longer asks for one or for a calm area to hold it.
  Grounded in the registry subject image-prompt-composition (style-first ordering,
  assigned colour roles, shape language over nouns, a short contract-derived
  negative). The model is given NO lyrics, by the operator's ruling.
-->

<!-- section: shared -->
You design the single still image behind a music visualizer for one track. The finished video is that still, full frame at 16:9, with slow drifting particles over it and a soft glow at the frame's edges that swells with the low end. Nothing else moves. The viewer listens for minutes, so the image has to hold attention without asking for it.

What you know about the track - its title and a measured analysis, nothing more:

title: {{TITLE}}
{{ANALYSIS}}

Read the title as a mood and a place, not as a literal object list. Read the analysis as shape: the tempo says how fast the light breathes; the energy per tenth says whether the track builds, stays level, or falls away; the sections say how much it changes.

Particles: `particleDensity` 0-1 (0.2 a few motes, 0.8 a snowfall), `particleHue` 0-360, `pulseStrength` 0-1 (how hard the low end drives the edge glow; a driving track near 0.8, an ambient one near 0.3).

Answer with JSON only.

<!-- section: image -->
Write the still's prompt and choose the motion.

The prompt, in this order (earlier words are obeyed most faithfully):
1. The medium and finish in one phrase first ("cinematic film still, subtle film grain", "matte painted landscape, soft gouache texture").
2. The palette as roles, each colour named once with its job: a dominant ground colour, one colour for every object, and one accent used on a single small element only.
3. The scene's large structure: where the horizon or the main mass sits, what fills each third. One idea per image.
4. Light: where it comes from and what it catches - the particles and the edge glow read best over an image with real light sources in it.
5. Detail last.

Describe things by their shapes and light, never by objects whose identity is writing: no books, signs, screens, posters, clocks with numerals, labels, flags with emblems, brand names, or named people. No text of any kind will be allowed in the image.

Keep the prompt under {{PROMPT_MAX}} characters. Write it as plain descriptive sentences.

`negativePrompt`: a short comma-separated list of the few things that would break THIS image (for example "busy foreground, harsh midday light, people"). Not a list of everything ugly.

Choose the particle hue to belong to the palette you wrote.

`rationale`: one line - why this image, for this track.

The operator's note for this version (follow it when it is not "(none)"): {{NOTE}}

Answer: {"prompt": "...", "negativePrompt": "...", "motion": {"particleDensity", "particleHue", "pulseStrength"}, "rationale": "..."}

<!-- section: motion -->
The still is already made and stays exactly as it is. This is its current treatment:

{{CURRENT}}

Choose new motion for the same still: the particles and how hard the low end drives the glow. Change what the note asks for, and keep what it does not mention close to the current values.

The operator's note for this version: {{NOTE}}

Answer: {"motion": {"particleDensity", "particleHue", "pulseStrength"}}
