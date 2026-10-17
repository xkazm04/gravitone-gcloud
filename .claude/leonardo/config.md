# leonardo overlay - gravitone-gcloud

Project specifics for the lane skill `/leonardo`. The lane body (procedures, tools, env keys) is
generic; this file is Gravitone Studio's brand direction and asset routing.

## Ask a second question before generating

Is this a **product surface** asset or a **studio-content** asset? They have different rules.

- **Product surface** - an icon, empty-state illustration or background that ships as part of the
  studio's own UI. It must obey the design language below and land in `public/`, referenced from a
  component.
- **Studio content** - a still, frame or poster standing in for something the *product* would have
  generated (a scene frame in the Frames phase, a shot thumbnail). These are FIXTURE data: they land
  in `public/` beside their kind (`public/deck-art/`, `public/clips/presets/`) and are referenced from
  a route's fixture port (`app/(studio)/<route>/_port/fixtureData.ts`), never hard-coded into a
  component. They may look like anything the fictional production calls for - but the fixture entry
  must stay honest about what produced them.

## Brand direction

Gravitone Studio's world is **the Watershed** (the rebuild's design system, `/kit`): a near-black
studio (`ink` #080a10) with hairline structure and signal colours that each mean one state.
Futuristic but restrained - instrument panel, not neon arcade.

- **Palette - read it from `packages/ui/tokens/source.json`, never from memory.** It is the single
  source of truth (roles admitted in `packages/ui/tokens/ADMISSION.md`): the `ground` inks and the
  `signal` hues (cyan, amber, emerald, rose ...), each with the state it carries in its `note`.
  Generated art should sit inside that palette; if an asset needs a hue the tokens don't have, that
  is a design decision for the user, not a prompt detail to sneak in.
- **Form language:** hairline geometry, glass panels, grain, a single luminous focal point. Depth
  comes from atmosphere (haze, gradient falloff), not from drop shadows.
- **Typography in art:** avoid it. The two real families (Inter, JetBrains Mono) are rendered by the
  app, not baked into an image - generated lettering is the fastest way to make an asset look AI-made.
- **Icons:** `@gt/ui` draws its own (`packages/ui/src/components/glyph/`); it does not use
  `lucide-react`. Generate an image only when a glyph genuinely cannot carry it; for a UI icon that
  wants motion, use `/motionize` instead of hand-integrating a PNG.

## Where files go

- Product-surface assets -> `public/`
- Fixture stills -> `public/` by kind (`deck-art/`, `clips/presets/`), referenced from a `_port/fixtureData.ts`
- Scratch and rejected generations -> **outside the repo**. Keep generated clutter out of git; the
  skill's `out/` directory is deliberately not part of this checkout.

## Env

`export $(grep -E '^(OPENAI_API_KEY|LEONARDO_API_KEY|GEMINI_API_KEY)=' .env | xargs)` before running
any tool. `.env*` is gitignored here (only `.env.example` is committed).
