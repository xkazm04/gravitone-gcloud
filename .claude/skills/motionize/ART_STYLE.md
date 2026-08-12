# Motionize — Art-Style Philosophy

The shared visual language for motionized icons, empty states, and loading
surfaces. Read this before generating so every traced glyph feels like it belongs
to the same world. This is **inspiration + memory**, not a rigid spec.

## The aspiration (master descriptor)

> **Concept art / digital painting, high detail, cinematic.** A rendered-but-
> artistic look with depth and polish — not a photograph, not a flat clip-art
> illustration. Moody, atmospheric, sophisticated, slightly cold. Quiet, not
> chaotic.

We can't *trace* a painterly render (glow + fog + gradients trace into noise), so
we **reproduce the FEEL through the pipeline**, not the pixels:

| Cinematic cue | How we get it under trace-control |
|---|---|
| **Dark, low-key base** (deep navy / black) | The *surface* is dark — the app theme, not the illustration. We trace flat shapes on white, then render on the dark surface. |
| **Tight neon accent set** — electric **violet**, **teal**, **amber** | The single most transferable element. Flat-fill the traced shapes in these hues + dark-navy outlines. Keep the palette *tight* (≤4 accents). |
| **Emissive lighting / glow** (light comes from objects) | Added AFTER tracing as an **SVG filter** (`feGaussianBlur` + `feMerge`) or a soft `drop-shadow` on accent strokes — because we own the SVG. Never bake glow into the raster (untraceable). |
| **Volumetric fog / particles** | Faint animated accent dots + a low-opacity radial gradient *behind* the glyph (a `<radialGradient>` we add), not in the trace. |
| **Cinematic radial composition** | Generate a single hero anchored in negative space, radial/semicircular framing. Compose for 1:1 or 16:9 hero, not a busy scene. |

## Palette tokens (Gravitone Studio)

**Read the values from `components/ui/tokens.ts`, never from this file.** It is the
single source of truth and the only file in the repo allowed a colour literal; the
names below are the roles, and the file holds the numbers.

- **Base / surface:** `--gt-ink` (the near-black studio) — the illustration never
  carries its own background. Traced negative space stays `var(--gt-ink)`.
- **Accents (tight set, and there are exactly three):** `--gt-accent-cyan` (primary —
  the one that speaks), `--gt-accent-violet`, `--gt-accent-emerald`. Amber exists in
  the app only as a *warning* state; it is not decoration, so keep it out of art
  unless the glyph IS a warning.
- **Line-work:** the hairline family (`--gt-hairline`, white at low alpha) over ink —
  this app draws in light on black, not navy ink on white.
- **Glass:** where a glyph implies a panel, echo `--gt-surface-top`/`--gt-surface-bottom`
  rather than a flat fill.
- Keep saturated accents *sparse* — one luminous focal point per glyph. The page
  already has an aurora; a second competing glow reads as noise.

## Dark only (in this repo)

Gravitone Studio ships one theme. Emit the dark palette and skip the light variant —
but keep the *mechanism* below in mind, because the renderer supports it and a future
light theme would need it, and because the "negative space follows the surface token"
trick is what keeps a traced glyph from carrying its own background.

## Light / dark — ALWAYS both (engine default; not used here)

Because we own the coloring, **every asset ships a dark and a light variant** — never
one bitmap stretched across themes. Two ways, cheapest first:

1. **Recolor the same traced SVG** (preferred): the geometry is identical; only fills
   change. Map dark→light per-role (outline navy→slate, negative-space
   `var(--background)` follows the theme automatically, accents slightly deepened for
   contrast on light). One SVG, two palettes, selected via `useIsDarkTheme()`.
2. **Regenerate a light-optimised source** only when the composition itself must
   change (rare for glyphs).

The tracer's interior "negative space" is already `var(--background)`, so it flips
with the theme for free. Accents on a light base should **deepen ~10–15%** (neon on
white can vibrate); glow filters should **soften** (light surfaces don't emit).

## Motion (how it reveals)

- **Radiate, don't snap.** Reveal from the hero outward (center-out radial delay),
  or a slow clockwise sweep. Quiet and deliberate — matches the "moody, not chaotic"
  mood. ~0.8–1.2s total.
- **Opacity always; transform when allowed.** Opacity cross-fade plays even under
  reduced motion; scale/pop only in full motion.
- **Emissive accents can breathe.** After the reveal, accent dots / orbit arcs may
  pulse or drift *slowly* (loading states), never busily.

## Signature system (Personas' own; kept as an example of what a signature IS)

Gravitone Studio has no signature glyph yet. If one is commissioned it should come out
of the product's own vocabulary — a frame, a take, a waveform, a cut — not a mascot.
The Personas example below is retained because it shows the *discipline*: one
recognisable form, reused across surfaces, with variation carried by accent and motion
rather than by redrawing.

### The Persona Head glyph (Personas)

The canonical way to *depict a persona/archetype* is an **abstract AI persona
head-and-face glyph** in glowing hairline linework — one symbol per archetype,
same construction, so a persona reads instantly and its variations feel like one
family. This is the signature "what a Persona visually IS" tool; reuse it wherever
an archetype/persona needs a face (mentality cards, persona headers, pickers).

**Prompt template** (keep it verbatim except the bracketed bits):
> A single abstract AI persona head-and-face glyph, centered, on a flat solid
> **black** background. The head is a **[SILHOUETTE]** rendered in minimal glowing
> linework — **[2–3 distinctive features]**. **[3 personality adjectives]**. Uniform
> **[teal|violet|amber]** linework, evenly lit, no gradient falloff, no card, no
> frame, no UI, no fog, no particles. Sharp crisp edges, high contrast, uniform
> stroke weight, hairline outline only. Flat vector-illustration style, symmetrical,
> 1:1 aspect ratio.

- **Black background** (not white) — the tracer drops the full-canvas black and
  `emit-glyph`'s `nearBlack` (strict `max<26`, so navy line-work survives) sends
  interior black to `var(--background)`, leaving neon lines on the dark surface.
- **Tight 3-colour rotation** — teal / violet / amber cycled across the set, NOT
  each archetype's semantic colour. Uniformity is what makes them a family; the
  card frame can still carry the semantic colour.
- **Hairline, uniform stroke, no glow in the raster** — glow is the SVG filter
  later. "Head silhouette + a few confident feature lines," symmetrical, 1:1.
- Distinguish archetypes by **silhouette + feature motif**, not colour: guardian
  helmet/brow/shield-jaw, analyst scanning-lens + grid facets, operator hub-node +
  headset arc, craftsman faceted low-poly seams, scout swept crest + directional
  slashes, sentinel steady sensor eye + scan line, curator archive bands + keystone,
  shipper upward chevrons + decisive jaw, chief-of-staff crown arc + guarded eye.

## Consistency checklist

- Dark surface, tight neon accent set, navy line-work. ✔
- Single hero in negative space; radial framing. ✔
- Glow/fog are SVG filters + faint particles, not baked. ✔
- Dark + light variant both exist. ✔
- Reveal radiates and is quiet. ✔

## Provenance

Sources of the master descriptor: the app's larger-illustration art direction
(concept-art / cinematic / neon-on-dark). Extend this doc as the style evolves —
it is the durable memory that keeps traced glyphs coherent with the rendered art.
