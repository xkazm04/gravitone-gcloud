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
  in `public/fixtures/` and are wired through `app/_studio/assets*.ts`, never hard-coded into a
  surface. They may look like anything the fictional production calls for - but the fixture entry
  must stay honest about what produced them.

## Brand direction

Gravitone Studio's identity is **Obsidian**: a near-black cinematic studio (`--gt-ink` #080a10) lit by
a slow aurora, with one accent doing the talking. Futuristic but restrained - instrument panel, not
neon arcade.

- **Palette - read it from `components/ui/tokens.ts`, never from memory.** That file is the single
  source of truth and the only place in the repo allowed a colour literal: `ACCENT` (cyan / violet /
  emerald), `INK`, the glass-surface stops and the aurora radials. Generated art should sit inside
  that palette; if an asset needs a hue the tokens don't have, that is a design decision for the
  user, not a prompt detail to sneak in.
- **Form language:** hairline geometry, glass panels, grain, a single luminous focal point. Depth
  comes from atmosphere (haze, gradient falloff), not from drop shadows.
- **Typography in art:** avoid it. The three real families (`font-instrument`, `font-hanken`,
  `font-jetbrains`) are rendered by the app, not baked into an image - generated lettering is the
  fastest way to make an asset look AI-made.
- **Icons:** the app uses `lucide-react`. Generate an image only when lucide genuinely has no match;
  for a UI icon that wants motion, use `/motionize` instead of hand-integrating a PNG.

## Where files go

- Product-surface assets -> `public/`
- Fixture stills -> `public/fixtures/`
- Scratch and rejected generations -> **outside the repo**. Keep generated clutter out of git; the
  skill's `out/` directory is deliberately not part of this checkout.

## Env

`export $(grep -E '^(OPENAI_API_KEY|LEONARDO_API_KEY|GEMINI_API_KEY)=' .env | xargs)` before running
any tool. `.env*` is gitignored here (only `.env.example` is committed).
