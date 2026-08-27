# Video generation: the render seam plan

*2026-08-27. Decided with the operator; four forks below were called
explicitly. This document is the brief for building the seam — it names
what exists, what changes, in what order, and the craft rules each step is
held to. The craft rules come from the media-generation knowledge bundle
(three intake waves of practitioner corroboration, 2026-08-25..27) and from
this repo's own measurement rig; each is cited by technique name so the
source can be read.*

## The seam already has edges

This app was built expecting this feature. The evidence is in the types:

- `FrameClip` (`app/_phases/frames/frames.ts`) stores authored `motion` and
  a `status` typed against the shared `ClipStatus` — whose members
  `"rendering" | "rendered" | "failed"` are unreachable today *on purpose*,
  "so that the day a render seam is built the model does not have to be
  reshaped around it." That day is this plan.
- `FrameClip` deliberately has **no duration field**: `durationOf()` derives
  each frame's hold from the gap to the next beat — a real number from the
  script. The render request reads it from the timeline at call time and
  never stores it.
- The imaging router (`lib/imaging/router.ts`) already routes on
  capabilities (`generate | edit | recognize`) and constraints
  (`supportsReferences`), holds keys server-side, and stamps provenance
  with cost. Video is a fourth capability, not a second architecture.
- The Frames step already conditions plates on the theme's approved sheet
  (`styleRefs`, since `b9485b3`), and the art-direction prompt already
  authors motion as enumerated, countable movement ("what moves, in what
  direction, how far — one move, no text, no duration").
- `pipeline/vlm-probe/` runs a local ComfyUI video stack (ref-conditioned
  and frame-chained lanes) and a **calibrated identity ruler** (FaceNet on
  face crops, DINOv2 on person boxes, calibrated against real film with
  known answers). The consistency spike is answered (`c99be91`). This is
  the acceptance instrument, currently living as research.

## The four decisions

1. **Both providers from day one.** `Capability` gains `"video"`. Two
   adapters behind the same router: a cloud vendor adapter in the existing
   idiom (server key, pricing row, provenance), and the local ComfyUI
   bridge promoted from `pipeline/vlm-probe/` as a provider whose price row
   is electricity. Routing rules pick per request: the local rig is the
   probe-and-iterate lane, the cloud adapter is the delivery lane —
   per-shot routing on measured takes-to-accept, exactly as the bundle's
   sourcing economics prescribe. A provider that is offline is a refusal,
   not an error (`refusal-is-a-state`).
2. **One clip per frame.** The generation unit is the frame: its plate is
   the anchor, its authored `motion` is the brief, its beat gap is the
   duration. No multi-shot scene calls in phase 1 — per-beat generation
   matches per-beat rejection, per-beat spend, and per-beat review, which
   is the whole shape of the Frames step.
3. **Blob store now.** Plates at ~5MB/frame already strain IndexedDB;
   clips are 10–50x. Rendered clips go to object storage from the first
   render; the frame record holds a pointer plus provenance — the exact
   pattern `lib/assets.ts` uses and the frames doc already names as the
   future. IndexedDB keeps only records, never clip payloads.
4. **Strip baked audio by default.** Video models ship clips with their own
   synchronized sound; that is a mix decision the model made. This app is
   narrated factual video: the voice lane wins collisions and the Score
   step owns music, so clips enter the cut silent. A per-clip `keep` or
   `demote` override exists and is recorded explicitly — never silently.

## The render request, assembled from what exists

A clip render for frame F compiles from parts the app already owns:

| Input | Source | Rule it obeys |
| --- | --- | --- |
| Anchor frame | F's accepted plate (composited: plate + elements + texts as rendered) | The anchor imports its maker's texture — and that is the lever: the plate already carries the project's grade and style, so the clip inherits the look for free. Whether the anchor is the raw plate or the composited frame is a phase-1 experiment; text layers may need to stay vector (see below). |
| Style block | `compilePrompt`-compiled from the theme, in full | Style is restated at every hop, *including into motion* — the hop teams skip. No short form. |
| Style references | `styleRefs(theme)` | Both channels, labeled, same as plates. |
| Motion brief | `FrameClip.motion`, verbatim | Motion prose only — the anchor carries the scene; re-describing it in the motion prompt is a second authority over a settled channel. |
| Duration | `durationOf(F)` at call time | A typed input owns its channel: duration is a parameter, never a sentence in the prompt. Same for resolution and aspect. |
| Constraints | the standing no-text clause + negative | The plate ban on glyphs extends to motion: a motion that animates text is rejected at authoring time already; the render carries the same constraint. |

Provenance stored with every clip: provider, model, cost (unpriced
counted), duration asked vs delivered, anchor id, prompt, take number.
A clip whose brief is lost can only be regenerated, which voids its
review — so the brief travels with the clip.

**The vector-layer question, named honestly:** elements and texts are
code-drawn *because they are checkable* (`checkability-routes-the-pixel`).
Animating the plate underneath them means either (a) render the clip from
the plate alone and composite the vector layer over the moving picture —
which keeps the epistemic split and is the default — or (b) bake the full
frame in and accept that the model now owns pixels that carry figures.
Option (a) is the plan; a motion that would move under a figure is
constrained to background amplitude, and the existing "never move text"
authoring rule already protects this.

## Lifecycle and economics

- `not-started → rendering → rendered | failed`, with `failed` carrying the
  refusal reason. All four `ClipStatus` members finally reachable; every
  surface that says "not rendered" starts saying something true and more
  interesting.
- **Probe ladder before delivery spend** (`asset-vs-disposable-render`):
  first render at the cheapest tier that reveals the defect class (does the
  motion read? does the look hold?), promote the accepted take to a
  delivery-resolution render. The local provider makes probes ~free; the
  cloud adapter prices delivery. A passed probe settles only what it
  exercised — motion, not finish — and the record says so.
- **Takes are the alternatives pattern**: multiple takes per frame, first
  auto-adopts, later ones wait to be chosen, deleting the active one
  promotes the newest survivor — `useAlternatives` already implements this
  for plates and generalizes.
- **Price per usable second, not per rendered second.** Spend accounting
  per clip in the existing ledger idiom; takes-to-accept tracked per
  provider and fed back into routing.

## Phase plan

- **P0 — the seam.** `"video"` capability; `VideoRequest`/`VideoResult`
  types beside the image ones; one cloud adapter; API route; blob store
  for results; `FrameClip` render path in `useFrames` (render, poll,
  adopt); spend and refusal surfaces. Contract tests in the
  `integration-imaging.mts` idiom.
- **P1 — the local provider.** The ComfyUI bridge as a second adapter
  behind the same types (the `pipeline/vlm-probe/motion.py` stack, made a
  server-callable worker). Routing rules: probes local by default,
  delivery cloud, both overridable per request.
- **P2 — continuity and the instrument.** When clips start sharing
  subjects or space across beats: tail-to-head anchoring; paired-panel
  anchors (both frames of a move cut from ONE image — separately generated
  anchors glitch mid-interpolation); extensions briefed from the actual
  output, not the brief. The vlm-probe identity ruler graduates from
  research to acceptance gate — calibrated before it judges, refusing
  wide shots honestly rather than scoring noise (`character-identity-
  continuity` is this repo's own contribution to the bundle; consume it).
- **P3 — banks.** Motion plates (appearance-free reusable motion,
  including built previz blockouts) and storyboard-grid conditioning for
  multi-shot scenes, if and when the app outgrows clip-per-frame. The
  foundry's keep/reject ledger is the natural cull surface for takes at
  volume.

## What this plan does not do

No character cast system in the app (frames are argument-bearing plates,
not actors — the identity machinery stays in the rig until a feature needs
faces). No multi-shot generation in phase 1. No audio generation in the
video path (Score owns music, narration owns voice). No autoplay of cost:
every render is a click with a price on it, same as plates.
