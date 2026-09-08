---
product: "Gravitone Studio"
surfaces: ["app"]
vault: [".vault", "C:/Users/mkdol/dolla/gravitone-gcloud/.vault"]
vault_subdir: Cx
design_doc: components/ui/tokens.ts
screens_source: .claude/cx/config.md
executor: opus
stops_per_session: 3
---

# cx overlay — gravitone-gcloud

## Product brief

One production walked through five steps — **Research · Script · Frames · Score · Cut** — over a
Library that knows where every asset came from. `lib/projects.ts`'s `PHASES` is the ONE source of
that order; `app/studio/[projectId]/` is the composition root.

The user is a **solo creator making a short film or trailer**, not a team and not an operator. They
arrive with an idea and a deadline, and the product's promise is that the five steps carry the idea
to a cut without losing the thread between them. Every read should be taken from that person's
seat.

**Two surfaces in this repo are NOT the customer journey** and are out of scope for a stop unless
the user asks: `/foundry` (an operator's mass-production and culling bench that runs for hours on a
local GPU) and `/playground` (a temporary bench for exercising the music vendor's newest features
before the Score step absorbs them). Both are named in `## Screens` so the map can see them; both
are marked `operator`.

> **Note on the vault path.** `vault:` lists the repo-relative `.vault` FIRST and the absolute
> `C:/Users/mkdol/...` path second. The sibling overlays (`.claude/perfect/config.md`,
> `.claude/spark/config.md`) list only the absolute path, which does not exist on this machine —
> the repo-relative candidate resolves correctly on every checkout and is the portable form.

## Journeys

```
first-cut     - a creator with an idea and no project yet - a cut exists that they would show someone
resume        - a creator returning to work in flight - back at the right step in one click, knowing what is owed
source-a-look - a creator who needs a visual identity before anything can render - a locked style
```

## Screens

| id | surface | how to reach it |
|---|---|---|
| `landing` | app | `/` — the door; the only CTA is sign-in. No frame, no auth gate. |
| `projects` | app | `/projects` — the shelf: the matrix of productions with per-step heat |
| `projects-empty` | app | `/projects` with storage cleared — the first-run state |
| `wizard-discipline` | app | `/projects/new` — stage 1 of a 4-stage deck |
| `wizard-template` | app | `/projects/new`, one pick in |
| `wizard-style` | app | `/projects/new`, two picks in — the stage that can dead-end (no locked style ⇒ `EmptyStyleDeck`) |
| `wizard-name` | app | `/projects/new`, three picks in — the only stage that types |
| `studio-research` | app | `/studio/<id>?step=research` |
| `studio-script` | app | `/studio/<id>?step=script` |
| `studio-frames` | app | `/studio/<id>?step=frames` |
| `studio-score` | app | `/studio/<id>?step=score` |
| `studio-cut` | app | `/studio/<id>?step=cut` |
| `library-styles` | app | `/library` — Styles tab (default) |
| `library-assets` | app | `/library` → Assets tab |
| `library-animations` | app | `/library` → Animations tab (`ComingSoon`) |
| `playground` | app · **operator** | `/playground` — music vendor bench, temporary by design |
| `foundry` | app · **operator** | `/foundry` — Styles / Cull / Extract / Dojo |

Steps deep-link by query string. **Clicking the step tabs from Playwright silently does not change
the step** (measured 2026-09-08) — always navigate by URL.

## Run

```bash
# 1. Start it. The bypass is mandatory: every screen but `landing` is behind <AuthGate>.
NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3007

# 2. Capture one screen by its id from the table above.
node pipeline/cx-capture.mjs studio-frames .vault/Cx/stops/S7-before.png --width 1920
```

**Do not assume a port.** On this machine :3000, :3001 and :3002 are held by other projects, and
:3001 in particular served a *different app* while a note still claimed it was this one. Confirm
with `curl -s http://localhost:<p>/ | grep -o '<title>[^<]*</title>'` before believing a capture.

Capture at `--width 1920` by default: the shell is `max-w-shell` (1760px), so a narrower viewport
photographs a layout the target user does not have. Re-shoot at 1440 when a proposal is about
density.

**Generated imagery** (an illustration, an empty-state picture, an icon) is not a placeholder job —
dispatch `/leonardo` for stills and `/motionize` for an icon or loading state that should move, and
name the skill in the executor's brief.

## Gates

Ordered; a change is not landed until they pass. Measured against `package.json`, 2026-09-08.

- `always:` `npm run typecheck` — `tsc --noEmit`.
- `always:` `npm run lint:ratchet` — **fails in EITHER direction**; a warning count that drops is as
  fatal as one that rises, because a drop can also mean the matcher broke. An executor that
  legitimately removes a warning says so and leaves `lint-baseline.json` alone.
- `always:` `npm run check:type` — the type-scale floor (`pipeline/check-type-scale.mjs`).
- `when a rendered surface changed:` `npm test` — Playwright, `tests/golden-path`, fast (~10s, 481
  tests as of 2026-09-08).
- `when routing/layout/server-rendered code changed:` `npm run build`, then `npm run check:bundle`.
- `npm run verify` runs the whole ordered gate and is the safe closing move for a stop.

## Repo law

Quote these into every executor brief; they are not negotiable and an executor that breaks one has
not landed the item.

1. **The type scale is two rungs and nothing below them.** `text-content` (1.125rem / 18px) for
   anything the user reads; `text-label` (1rem / 16px) for short secondary labels. `text-xs` and any
   size under 16px fail `npm run check:type`. If a design "needs" smaller text, the content is
   secondary enough to move into a tooltip, a zoom, or a modal.
2. **Chrome colour is declared once**, in `components/ui/tokens.ts`, emitted as `--gt-*` by
   `<GravitoneTokens>`. Tailwind palette utilities (`text-cyan-300`, `bg-white/5`) are the rendered
   form of those accents and are fine. A new hex literal in a component is a violation; the five
   documented exemptions are listed in that file's header.
3. **The shell is `max-w-shell px-2`** (1760px, 8px gutters) from `--container-shell` in
   `app/globals.css`. Anything `fixed inset-x-0` that must align with content restates it from the
   same token — never a fresh `max-w-[...]`.
4. **Motion is entrance-only.** One curve (`--gt-ease`), one shape (`gt-rise`). The only loops
   allowed are the three exempt classes named in `app/globals.css`: ambient atmosphere, busy
   indicators whose lifetime is the work's lifetime, and the indeterminate sweep. A new infinite
   animation needs a reason written next to it.
5. **`focus:outline-none` appears nowhere** in `app/` or `components/` and must not reappear. Tint a
   border as well by all means — never instead.
6. **No vendor import escapes `lib/<domain>/`.** `lib/imaging`, `lib/music`, `lib/text`,
   `lib/foundry` are server-only seams that bill real money.
7. **`app/_studio/*` holds the mocked fixtures** every studio surface reads. A screen drawing
   fixture data must not imply the work is real — see the `fixture honesty` heuristic below.
8. **`PHASES` in `lib/projects.ts` is the one source of step order.** Motion was retired as a step
   on 2026-08-14; Frames owns the still and the clip made from it. Proposing "the motion step" is
   proposing a regression.
9. **Fixed `rem` widths do not follow the type scale.** Three grids broke when the scale moved 2px
   on 2026-09-08 (`ProjectsMatrix`'s phase tracks, the score/cut `LANE_GUTTER`, `ASSEMBLY_GRID`'s
   breakdown column). A track cut to fit a label must carry a comment saying what it measured.
10. Read `CLAUDE.md` and `AGENTS.md` before writing code. **This is not the Next.js in your training
    data** — check `node_modules/next/dist/docs/` for anything routing- or API-shaped.

## Heuristics

The built-in list in `${CLAUDE_SKILL_DIR}/references/cx-heuristics.md` applies, **minus** the
*Living-room screen (10-foot UI)* and *Second device* sections — this product is a single desktop-web
surface and those rows would score nothing. The *Conversational / AI surfaces* section applies in
full: four of the five steps are model-driven.

Add these, product-specific:

| heuristic | the question | evidence that counts |
|---|---|---|
| **fixture honesty** | The app ships mocked fixtures beside real billed engines. Does the screen make clear which one the user is looking at? | a fixture rendered with the same confidence as a generated result; a number that looks measured and is seeded; a stub not labelled |
| **the thread between steps** | Does this step show what the previous one decided, and hand the next one something it can name? | the upstream decision visible without navigating back; a step that starts empty when its predecessor produced something |
| **the work is the hero** | Is the user's material bigger and louder than the chrome that manages it? | ratio of controls to content; a panel that outweighs the frame it describes |
| **spend and its consent** | Before an action that bills a vendor or burns GPU minutes, does the user know it will, and roughly how much? | the cost or count shown pre-flight; an irreversible spend behind a single unlabelled click |
| **the long run** | Generation takes minutes, not milliseconds. Can the user leave, and does the app still hold the work when they come back? | what the screen does at t+30s; whether navigating away cancels; whether the bell reports the outcome |
| **provenance of an asset** | Can the user tell where an image, cue or line came from — which style, which prompt, which run? | a lineage line on the tile; a style name; a way back to the run that made it |

## Skill improvement log

<!-- dated one-liners; what the next /cx session in THIS repo needs to know -->

- 2026-09-08 · **`framesFor` gates the whole back half of the spine.**
  `app/_phases/frames/frames.ts:399` returns `[]` unless `source.origin === "explainer-fixture"`,
  so `seed-glass-harbor` (educational) has a picture but no movements, and
  `seed-glass-harbor-trailer` has movements but no picture. **No project can currently exercise
  the Score step end to end.** Vault stop S21. Check this before grading any stop from S8 down.
- 2026-09-08 · **A studio step WRITES as well as renders.** `useFrames` saves to the `frames` key
  debounced 600ms and the Score step reads it, so a capture that deep-links to `?step=score`
  photographs the honest empty state. `pipeline/cx-capture.mjs` walks the upstream steps
  (`via`) and warms `/projects` first, because the seeded project is minted on that visit.
  It refuses to write a PNG when it lands on the studio's not-found screen — that error screen
  renders at full size and produced a ~1MB file that looked like a successful capture twice.
- 2026-09-08 · **Scout the step's craft knowledge before writing an executor brief.**
  `knowledge/templates/<template>/steps/<nn>-<step>/{PATTERNS,OPEN-QUESTIONS}.md` decided the
  design of a whole commit here. `03-score` declares itself **n=0 for the craft**, so no brief
  touching Score may let an executor state a bpm or LUFS as fact.
- 2026-09-08 · **Read the code's own comments before proposing.** `stepStore.ts:127-133` had
  already decided why Score persists nothing (a take is a `blob:` URL no reload survives) and
  narrowed a proposal before any code was written.
- 2026-09-08 · Parallel sessions are real here — one landed a git policy mid-run
  (`11e55a0`: commit on the current branch, never push, gate bypass denied at the permission
  layer). Re-read `CLAUDE.md` before committing.
