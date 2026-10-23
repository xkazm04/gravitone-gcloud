# Muse techniques - how a fictional adult woman is drawn as a character

The muse wing's craft notes (spark scout-muse, 2026-10-23). Each technique is a hypothesis until a kept
still proves it on the studio's model; a kept night's findings land under `## Scout findings` with the
night's marker. Craft, not content: no person, artist, studio or franchise is named here or in a prompt.

## The line (never a taste)

- Every woman is a fictional adult. The prompt states `aged NN` with NN 25-60; the eye must read her as
  21 or older or the still is deleted before the Board.
- Nothing nude, no sexual act, no real person or lookalike. Suggestive is a wardrobe and pose question
  the operator judges; nude is a refusal the door and the eye make.
- Anime and stylised looks drift young. State adult proportions ("proportioned as an adult fashion
  model"), a poised or neutral expression, and adult styling; never lean on "cute" shortcuts.

## The prompt's order (registry media-generation/image-prompt-composition: four blocks)

`look (style block) -> card (identity block) -> wardrobe state, situation, framing (action block) -> Avoid: (constraint)`

- **The look first**, restated in full on every still: medium/render, light, lens, finish and imperfection.
  The block that must survive truncation goes first, so a model that drops the tail still lands on-look.
  Keep it tight (the golden path: roughly 100-250 words at most).
- **The card second**, verbatim on every prompt that draws her: age, face, hair, build, skin, one
  signature garment or accessory - the INVARIANTS only. Her expression, pose and what changes per scene
  belong in the action block, never in the card (identity split from state).
- **Change ONE axis per still** (the look, the situation or the wardrobe), never two: a drifted face is
  then attributable.
- The studio folds the negative into `Avoid:`; keep it short and concrete (text, watermark, extra fingers,
  warped hands) - never a kitchen-sink list.

### What a card can and cannot hold (registry media-generation/character-identity-continuity)

The studio takes no reference image, so the card is prose standing in for a face - the subject's named
failure mode ("prose as the identity channel"). Its range is stated, not assumed: a card holds a woman
WITHIN one still and roughly across a night's few stills of her; it does not hold her across a cut or a
sequence. The `drift` reason is the operator's eye, not an instrument - nothing here measures identity,
and no number may be published as if it did. A reference-image path (reference admitted late, showing
only invariants) is the follow-up the day a kept character must come back looking like herself.

## The look ladder

Each rung is a look family a night spreads across before a direction is confirmed.

1. **Ultra-photoreal portrait** - describe the SHOOT, not "realistic": an 85mm portrait lens at f/1.8,
   a named light pattern (Rembrandt, butterfly, loop, split), a film stock for colour (warm portrait
   negative stock), and skin as skin: "visible pore texture, natural slight asymmetry, fine vellus hair,
   no beauty smoothing". The plastic look is the model's uniform procedural glow; imperfection words
   are what break it.
2. **Cinematic still** - 35mm anamorphic, practical lights in frame, haze, a named grade (bleach bypass,
   tungsten and teal), a story moment mid-gesture rather than a pose.
3. **Fashion editorial / poster** - framing words (mid-thigh up, three-quarter, side profile for the
   silhouette), garment and fabric behaviour (drape, sheen, weight), the eye line, and negative space
   for type at the top or side of a 9:16 frame.
4. **Semi-real painterly** - blended colour transitions, visible layered strokes on each facial plane,
   a cool or warm rim light tracing the far contour, a contemporary illustration finish.
5. **Anime / cel** - clean confident line art, two-tone cel shadows, flat graded sky or interior, adult
   proportions and a mature, poised expression; the most drift-prone rung for `young`.
6. **Stylised 3D (feature-animation look)** - soft subsurface skin scattering, matte finish, studio
   softbox, soft ambient occlusion, anisotropic hair highlights, gently stylised but adult proportions.
7. **Real-time 3D companion** - a game-engine character render: PBR materials, hair cards, a clean
   three-point rig light, a turnaround or a dialogue-portrait crop. This is the "3D vision" rung - a
   concept still, no mesh.
8. **Toon-shaded 3D** - posterised (not soft) shadows, an ink outline, a flat palette over 3D forms.

## Characters and situations

- A character is an archetype made visible: the card's `personality` line chooses palette, shape
  language and wardrobe (warm and rounded for a gentle confidant, sharp silhouettes and cool tones for
  a sardonic one), and the situation plays her by it.
- Roleplay situations test a character, not a set: a cafe date by the window, a rooftop at night, a
  late gaming session, a rainy bus stop, a museum gallery, a bookshop aisle, a kitchen breakfast, a
  ski-lodge fireplace. One situation per still, framed for a face that can be read.
- Spread the cast: ages 25-60, many skin tones, hair textures and body types; a night that draws one
  type of woman learns one thing.

## Reasons a still is thrown, on the scout source's keys

The scout source binds all eleven reason keys already, so the muse wing's failure modes ride the keys
whose meaning holds them, and the NOTE names the precise one (`young`, `drift`, `plastic`):

| failure (research) | key | why it fits |
|---|---|---|
| anatomy - hands, limbs, proportions | `craft` | "anatomy, composition, artefacts or framing" |
| likeness - reads as a real person | `rights` | "material we may not use" |
| young - reads younger than her card | `subject` | the wrong subject; the eye's floor is the gate, this is the taste |
| drift - not the character her card names | `subject` | the wrong subject |
| plastic - the procedural skin glow | `style` | the look is wrong |
| stock, no character | `generic` | teaches nothing new |

## Sources (2026-10-23, practitioner guides - vendor-adjacent, verify on the studio's model)

- photorealistic prompt structure, lens and light pairing: aivideobootcamp.com/blog/photorealistic-ai-prompts-guide-2026, insidea.com/blog/ai/prompts/best-ai-prompts-for-realistic-photos
- the procedural glow and micro-texture: budgetpixel.com/blog/volumetric-light-scattering-eliminating-the-procedural-glow-in-high-fidelity-asian-portraiture, budgetpixel.com/blog/micro-realism-how-to-capture-high-fidelity-textures-and-close-ups-in-ai-art
- identity drift and fixed vs editable traits: leadde.ai/blog/how-to-keep-characters-consistent-in-gpt-image-2-5-fix-face-and-pose-drift, getimg.ai/blog/how-to-create-consistent-characters-with-ai
- adult presentation in anime looks: budgetpixel.com/features/mature-anime-character-generator
- stylised 3D render vocabulary and toon shading: carat.im/en/prompt-gallery/3d-character-design, studio.blender.org/blog/cartoon-character-shading-with-geometry-nodes
- fashion editorial framing and fabric: lumalabs.ai/news/ai-fashion-photography-prompts, capcut.com/ideas/ai-image/ai-image-for-editorial-fashion-style
- companion archetypes and visual identity: uxdesign.cc/so-your-ai-wants-a-personality-9cbb47e07dd7
- painterly finish and rim light: youmind.com/prompts/editorial-digital-portrait-painting-30207

## Scout findings
