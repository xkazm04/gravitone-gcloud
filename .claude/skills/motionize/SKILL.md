---
name: motionize
memory: none
category: Development
description: Upgrade a generic UI icon or loading/empty state into a traced, motion-animated SVG. Generates flat trace-friendly art (via /leonardo tools), validates with Qwen vision, vectorizes to a clean multi-path SVG, and emits a motion reveal component driven by the shared motion-preset library (draw, staggered-draw, fade-pop, float, pulse, hover-response, success-settle). For icon + loading-state visual upgrades — NOT raw image generation (use /leonardo for that).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(npx *), Bash(cd *)
argument-hint: <UI surface to upgrade, e.g. "teams empty state icon">
---

# Motionize — traced, animated SVG upgrades for icons & loading states

Turn a generic lucide icon + a basic fade into a **traced, self-drawing SVG** whose
every element is under your control (draw order, per-path timing, easing). This
skill is the *upgrade* layer; **`/leonardo` stays the pure image/illustration
generator**. Motionize consumes flat art and produces animated React components.

**The core idea:** neon/glow art traces badly (soft edges → speckle). Generate a
**flat** twin (solid fills, hard edges, no glow/gradients), trace *that*, then add
glow back as an SVG/CSS filter — that separation is what puts traces "under control".

**Read [`ART_STYLE.md`](./ART_STYLE.md) first** — the shared visual language (concept-
art / cinematic feel via a dark surface + tight accent set + emissive SVG-filter glow),
adapted here to the Obsidian palette in `components/ui/tokens.ts`.

**This app is dark-only.** Gravitone Studio has one theme (`--gt-ink` #080a10) and no
light variant, so the dark/light dual-palette machinery the engine describes is
inert — emit the dark palette and skip the `[data-theme^="light"]` overrides. If a
light theme is ever added, that rule comes back with it, so leave the renderer's
support in place rather than deleting it.

**Before the first run in this repo, port the renderer.** `MotionizedGlyph.tsx` and
`motionPresets.ts` do NOT exist here yet. Copy them from
`C:/Users/mkdol/dolla/personas/src/features/shared/components/display/` into
`components/ui/`, then adapt in the same commit: colours come from `--gt-*`
(`tokens.ts`) instead of Personas' semantic tokens, and the reduced-motion hook is a
plain `matchMedia` — this repo has no `useMotion` hook and `globals.css` already
disables all CSS animation under `prefers-reduced-motion`. Say in the commit message
that they were ported. Do not hand-roll a second renderer per glyph.

## Pipeline (four steps)

### 0. One-time setup
Install the skill's self-contained deps (kept out of the app's package.json):
```bash
cd .claude/skills/motionize && npm install && cd -
```

### 1. Generate flat, trace-friendly art (via /leonardo tools)
Use the existing generators, but with a FLAT profile — no glow, no gradients:
```bash
export $(grep -E '^(OPENAI_API_KEY|LEONARDO_API_KEY|QWEN_API_KEY)=' .env | xargs)
# transparent bg is ideal for icons (gpt-image-2 supports it natively):
node .claude/skills/leonardo/tools/openai-image.mjs generate \
  --prompt "Flat vector icon of <SUBJECT>: solid fills, crisp hard edges, thick uniform outlines, no gradients, no glow, no shadow, limited palette (<=4 colors), centered" \
  --output .claude/skills/motionize/out/<name>-flat.png --size 1024x1024 --background transparent --quality high
# (or leonardo-gpt-image.mjs / leonardo-image.mjs when only a Leonardo key is present)
```

### 2. Validate with Qwen (free, Gemini-free)
```bash
node .claude/skills/motionize/tools/qwen-recognize.mjs \
  --input .claude/skills/motionize/out/<name>-flat.png \
  --prompt "Is this a FLAT icon (solid fills, hard edges, no gradients/glow)? How many distinct colors? Name the shapes. Reply JSON {flat:bool, colors:int, shapes:[...]}."
```
DashScope OpenAI-compatible endpoint, `qwen3.7-plus` + quota-fallbacks, `$QWEN_API_KEY`
(free 1M tokens / 90 days per model). If it isn't flat/clean, re-prompt step 1.

### 3. Trace → clean SVG (+ animatable data, one pass)
```bash
node .claude/skills/motionize/tools/trace.mjs \
  --input .claude/skills/motionize/out/<name>-flat.png \
  --output .claude/skills/motionize/out/<name>.svg \
  --mode spline --color-precision 4 --filter-speckle 6 \
  --emit components/ui/glyphs/<name>Glyph.ts --name <NAME>_GLYPH
```
`@neplex/vectorizer` (VTracer) → one `<path>` per color region + SVGO cleanup.
`--emit`/`--name` bakes the paths into a `TracedGlyph` module (`{ viewBox, data:
{d, fill, delay}[] }`) in the same pass — radial `delay` = distance to centre for a
center-out reveal; `--order angular` for a clockwise sweep. Committed glyph modules
live in **`components/ui/glyphs/`** (~10–16KB gzipped each — consumers import the one
they render, never a shared registry). Handles the trace gotchas
(drops full-canvas bg, recolors large negative-space to `var(--background)`,
preserves paint order). For an icon SET, use `trace-set.mjs --split` (one module per
glyph); `emit-glyph.mjs` is the shared core.

### 4. Motionize → React component (shared renderer + preset library)
**Do not emit a bespoke animated component.** Render the emitted glyph through the
shared primitive **`components/ui/MotionizedGlyph.tsx`** (ported on first run — see
above) and pick motion from the **preset library** (next section):
```tsx
<MotionizedGlyph data={GOALS_GLYPH.data} viewBox={GOALS_GLYPH.viewBox} spread={1} glow />
```
- **CSS keyframes, NOT a motion library.** This repo has no framer-motion dependency
  and does not need one for a glyph: the whole design language is entrance-only CSS
  motion, `globals.css` already honours `prefers-reduced-motion` globally, and
  `usePauseOffscreen` (`components/ui/Equalizer.tsx`) is the existing way to stop a
  loop nobody can see — reuse it instead of adding a second IntersectionObserver.
  Adding a motion library is a dependency decision for the user, not a glyph's call.
- Reduced motion and the emissive `glow` filter (feGaussianBlur+feMerge on accent
  paths) are built into the renderer; the light-theme branch is dead code here (see
  the dark-only note above). A faint `<radialGradient>` behind = "fog", which is the
  same trick `.aurora` plays at page scale — keep the glyph's fog dimmer than the
  page's, or the two atmospheres fight.

## Motion system — the preset library

All motion comes from **one shared module**: `components/ui/motionPresets.ts` (next to
`MotionizedGlyph.tsx`, both ported on first run). `MotionizedGlyph` reads from it via
`entrance` / `ambient` / `hover` props (default `entrance="staggered-draw"`). Timings
should quote `--gt-ease` / the `EASE` constant from `tokens.ts` rather than inventing a
second curve.
**Extend it — never inline variants/keyframes in an emitted component.** Adding or
tuning a preset = editing that one file; every motionized surface picks it up.

Two composition details the renderer already handles, worth knowing before you add a
preset: ambient loops are emitted with `fill-mode: forwards`, **not** `both` (under
`both` the loop's backwards fill applies its dimmed from-state during the start delay
and fights the entrance), and the loop's start delay is the second value in the
path's inline `animation-delay` (the entrance stagger is the first).

Each preset is data the renderer turns into scoped `@keyframes` + `animation`:

```ts
export type MotionPresetName =
  | 'draw' | 'staggered-draw' | 'fade-pop'            // entrances (one-shot)
  | 'float' | 'pulse'                                 // ambient loops
  | 'hover-response'                                  // interaction layer
  | 'success-settle';                                 // one-shot completion

export interface MotionPreset {
  kind: 'entrance' | 'loop' | 'hover' | 'oneshot';
  /** @keyframes body (from/to or % steps), scoped per instance by the renderer. */
  keyframes: string;
  durationS: number;                    // loops: the period
  ease: string;                         // e.g. 'cubic-bezier(0.16, 1, 0.3, 1)'
  /** Entrances: map a path's 0..1 delay into seconds (default: d => 0.08 + d * spread). */
  stagger?: (delay: number, spread: number) => number;
  iteration?: 'infinite' | 1;           // loops: infinite + alternate
  /** prefers-reduced-motion fallback: cross-fade only, or don't run at all. */
  reduced: 'opacity-only' | 'none';
  /** Loops/hover: apply only to accent paths (max channel > 0x80), not line-work. */
  accentOnly?: boolean;
}
```

Vocabulary (defaults; tune in the module, not per component):

| Preset | Kind | Default | Reduced |
|---|---|---|---|
| `draw` | entrance | `pathLength`-style stroke trace, 0.9s, ease-out — **stroke/`--mono` traces ONLY** (on fills it traces the boundary, messy) | opacity-only |
| `staggered-draw` | entrance | per-path opacity 0→1 + scale 0.35→1, 0.5s each, `cubic-bezier(0.16,1,0.3,1)`, staggered by emitted `delay` × `spread` | opacity-only |
| `fade-pop` | entrance | whole-glyph opacity 0→1 + scale 0.92→1, 0.35s — for small icons where a stagger is noise | opacity-only |
| `float` | loop | translateY ±2px + opacity ±0.06, 5s, alternate, infinite — ambient idle | none |
| `pulse` | loop | accent opacity 0.75→1 (+ glow stdDeviation swell), 3.5s, alternate — attention/activity | none |
| `hover-response` | hover | scale 1→1.03 + glow/accent intensify, 0.18s — a `transition` on the group, not an animation | opacity accent only |
| `success-settle` | oneshot | scale 1→1.12→1 overshoot, 0.42s, `cubic-bezier(0.34,1.56,0.64,1)` (matches `animate-inbox-zero-pop`) — fires once on completion, never loops | opacity-only |

### Composition rules

- **Sequence, don't overlap:** entrance finishes before any ambient loop starts.
  In CSS, comma-chain the two animations and give the loop
  `animation-delay: <entrance total + 0.2s>`; in framer contexts use
  `onAnimationComplete`. The IntersectionObserver replay restarts the **entrance
  only** — loops keep their own clock.
- **One ambient loop per glyph.** `float` OR `pulse`, never both on the same paths.
  Ambient loops are `accentOnly` — line-work stays still.
- **`hover-response` layers on anything** (it's a transition on the wrapper `<g>`,
  orthogonal to entrance/loop).
- Per surface:
  - **Empty states** → `staggered-draw` entrance (+ optional `float` on accents).
    First-run "nothing here yet" only — a self-drawing 128px illustration is wrong
    for a filtered-to-zero list (see `ScenarioEmptyState`'s `glyph` prop docs).
  - **Loading states** → `pulse` (motion may imply activity ONLY where work is
    actually happening; never on a static/idle state).
  - **Icons / interactive chrome** → static render + `hover-response`.
  - **Completion moments** → `success-settle`, one-shot, gated on the actual event
    (the `InboxZero celebrate` pattern).

### Taste guardrails

- **Entrance total ≤ ~1.2s** (last stagger delay + duration). Quiet and deliberate.
- **Ambient loops are barely-there:** translate ≤ 2–3px, opacity delta ≤ 0.08,
  periods 3–6s. If a screenshot 3s apart looks obviously different, it's too much.
- **Never loop transforms that imply progress on a static state** — a spinning or
  sweeping motion on an empty state reads as "loading" and is a lie.
- **Every preset degrades under `prefers-reduced-motion`** per its `reduced` field —
  opacity-only cross-fade for entrances/one-shots, loops off entirely. No preset may
  hard-snap.
- **Colors/glow come from the app's tokens** — `var(--background)` negative space,
  ART_STYLE accent hexes, light-theme overrides via the renderer's
  `[data-theme^="light"]` rules. Never hardcode theme-specific colors in a preset.

## Gotchas (learned)

- **VTracer traces FILLED regions, and the background is one of them.** Drop the
  full-canvas bg path, but **RECOLOR interior white paths to `var(--background)`**
  — don't drop them, or connective lines/holes fill solid. Verify by rendering the
  composed SVG on the target surface (`sharp(Buffer.from(svg)).png()`) *before*
  wiring the component.
- **Noise → path explosion.** Anti-aliased edges yield hundreds of micro-paths.
  Push `--filter-speckle` (10–40) and lower `--color-precision` (3–4) until the
  path count matches the number of *real* regions.
- **More content = more control.** A richer flat scene traces into many addressable
  paths — group by role and orchestrate (hub → links → figures → accents).

## Conventions

- Scratch art + SVGs live in `.claude/skills/motionize/out/` (git-ignored). The
  FINAL committed artifacts: the glyph data module in `components/ui/glyphs/` + the
  consuming surface's `MotionizedGlyph` usage (+ `motionPresets.ts` if a preset was
  added/changed). No runtime tracing.
- Reduced motion: the CSS media query in the renderer, backed by the global rule in
  `app/globals.css`. There is no `useReducedMotion` hook here — use `matchMedia`
  directly if React logic genuinely needs the flag.
- A new glyph adds files under `components/ui/glyphs/`, which belongs to the
  `studio-design-system` context. `context-map.json` is a Personas export — don't
  edit it; mention in the commit that a rescan will pick the new files up.
- Env: `QWEN_API_KEY` (recognition) + `OPENAI_API_KEY`/`LEONARDO_API_KEY`
  (generation). Load from `.env` before running.

## Where a glyph earns its place in THIS app

There are no shipped glyphs here yet — this section is the target list, not a
reference implementation. The surfaces that want one, in order of payoff:

- **A phase with nothing in it yet** — the Frames lightbox before any scene is picked,
  a Score with no cues spotted. These are the classic empty states, and this product's
  empty states are *meaningful* (the work simply has not happened), so the glyph should
  read as waiting, not as error.
- **A blocked or refused item** — Motion's `blocked` shot, Score's refused cue. A
  traced glyph beats a lucide icon here because the state deserves explaining, and the
  Cut phase's gaps are the same idea at timeline scale.
- **The rendering state** — the one place an ambient loop is honest, and the one place
  `usePauseOffscreen` matters.

Do NOT motionize an icon that lucide already covers and that carries no state — the
nav, buttons and inline affordances stay lucide. The rule of thumb: a glyph is for a
*situation*, an icon is for an *action*.

Reference implementations to read before your first trace live in the Personas repo
(`src/features/shared/glyph/glyphs/` + `src/features/home/sub_releases/`) — the
`roadmapRouteGlyph` / `roadmapWaypointGlyph` pair is the canonical example of the
ambient/entrance split and of windowing a traced viewBox instead of cropping it.

Two things learned tracing that pair, already fixed in the tools:
- `trace.mjs --emit` (via `emit-glyph.mjs`) now writes the same `TracedGlyph` shape
  `trace-set.mjs` does. It used to emit a bare array plus a separate `_VIEWBOX`
  const, so a single-glyph trace produced a module that couldn't be fed straight into
  `<MotionizedGlyph data viewBox>` like every committed set-traced glyph.
- **A hollow ring traces as an opaque white blob** unless you lower `--white-keep`
  (default 0.1 keeps small white interiors as literal white). `--white-keep 0.002`
  demoted the ring's interior to `var(--background)`. Conversely `--filter-speckle 30`
  on hairline art collapsed the whole glyph to **one** path — 12–14 was the usable
  band. Always render-verify on the target surface before wiring.
- Don't `tight-crop` a tall composition into a square box — it squashes the aspect and
  bakes ellipses into the geometry. Trace the undistorted original and window the
  viewBox at the call site instead.
