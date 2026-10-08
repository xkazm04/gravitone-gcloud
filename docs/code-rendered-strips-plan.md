# Code-rendered strips: 20 + 20 approaches, triaged in /foundry

*2026-10-06. Plan, not yet built. Origin: the intake of "Claude Now Does Video
(FOR FREE) Thanks To JavaScript" (registry note
`librarian/sources/2026-10-06-claude-javascript-video.md`, run `in-rscb-1006`).
Goal set by the operator: compose **statistical** (StatReel-shaped) and
**educational infographic** video from LLM-written web code, not from image or
video models. Leonardo may only make **supporting elements** inside a strip.
Render 20 educational and 20 statistical strips, each in a different artistic
approach. Triage them in `/foundry` to learn which patterns hold, and save the
best as reusable styles.*

## What the source adds and what it does not

The video's mechanism: the agent writes a page where every frame is a function
of `t`, a headless browser captures the frames, ffmpeg encodes them, and the
agent reads a contact sheet of its own output to fix it. That mechanism is
already in the registry, stated more strictly, and **already in this repo**:

- `app/_phases/frames/music-video/compositor.ts:1-31` is a frame-index-pure
  compositor (no `Date.now`, no unseeded random, seeded `mulberry32` at :39).
- `lib/musicVideoExport.ts:173-265` injects a page exposing
  `window.renderFrameAt(i)` and captures it frame by frame. `:271-303` muxes
  with ffmpeg.
- `lib/export/headless.ts` is the shared kernel: `launchHeadless` :55,
  `withEncoderFallback` :88 (nvenc, then x264), `landExport` :105 (atomic
  `.partial.mp4` rename), `cleanUpExport` :122.

So this plan **generalises an existing seam** rather than adopting a framework.
The one idea the corpus does not hold is the reason to run the triage at all:

> **When code renders the frame, a style is a module the strip imports, not a
> prompt block restated on every call.** `visual-style-locking` assumes a
> renderer with no memory. A deterministic renderer inverts that. The registry
> banked this as a lead, with this plan's verdict as the return condition.

## Craft rules this plan is held to

Each rule is cited by its registry technique so the source can be read.

| Rule | Technique | Where it bites here |
|---|---|---|
| Every value a frame shows comes from the frame index alone. Second writers get explicit endpoints. Check statically before rendering. | `video-assembly/seek-stable-composition-authoring` | the strip contract and `lint.mts` |
| A contact sheet is a sampler, and the sampler is half the instrument. The agent's self-review is a pre-filter, never the verdict. | `motion-quality-gating/filmstrip-sampling-discipline`, `unattended-build-loop/no-gate-self-certifies` | the fix loop, capped at 2 rounds |
| Story text is 26 px or more at 1080 wide, inside the safe box. Tilt is 15° or less on anything that carries data. | `data-video-art-direction/legibility-floor` | automated pre-gate, measured from the DOM |
| At most two motion cues per frame, each selling a named beat. | `data-video-art-direction/motion-cue-budget` | approach cards and the author brief |
| The chart form follows the story. Two concept seats beat template charts. | `case-native-chart-form`, `concept-landing-proposals` | stats lane mix: concept seats beside chart seats |
| Every figure cites a fact. No invented numbers. | `evidence-bound-visuals/figure-must-cite-a-fact` | stats data is a fetched, committed fixture with a source line |
| No model-made likeness of a real person, and no text in generated images. | `data-video-art-direction` anti-patterns, `lib/stylePrompt.ts` no-text clause | Leonardo asset rules |
| Show the comparison even when the gate refuses. The operator overrules the ratio. | intake render-proof v2.12 | gate failures are badged, never hidden |
| Rejections are evidence too. | `visual-style-locking/rejections-as-negative-evidence` | rejected strips leave a ledger row |

## Shape of one strip

- **Length:** 8 s at 30 fps, which is 240 frames. One beat, not a whole video.
- **Aspect:** stats are 1080×1920 (9:16, the StatReel short). Educational is
  1920×1080 (16:9, the `mid-educational-video` frame). *Fork A below.*
- **Audio:** none in round 1. Sound-off first. Timing is planned from data or
  beats, not from a voice track.
- **Artifact:** one self-contained `strip.html`. It loads no network. Vendored
  libraries are inlined from `node_modules` only if the approach card lists them
  (d3-geo, three). It exposes:

```ts
window.STRIP = { width, height, fps: 30, frames: 240 };
window.renderFrameAt(i: number): void | Promise<void>; // draws frame i into the page. The harness screenshots it.
```

The music-video page returns a PNG data URL from `renderFrameAt`. Strips
instead **draw into the DOM and the harness screenshots the viewport**. SVG,
CSS and DOM typography cannot be read back as a canvas, and screenshotting is
what a viewer sees. CSS animations are allowed only when paused and driven by
`animation-delay: -t`, or by Web Animations `currentTime = t`. A live clock is
never allowed.

- **Style module:** next to the strip, the author writes `style.json`. It holds
  palette with roles, type families and scale, the motion grammar (easings,
  durations, which cues), primitives used, and texture sources. This is the
  thing that gets reused, and it is what row 7 of the intake tests.

## Pipeline: `pipeline/strips/`

```
pipeline/strips/
  briefs/edu-01.json           one concept, one beat, countable expectations
  briefs/stat-01.json          + data/stat-01.json (fetched primary, source + retrieved date)
  approaches.json              the 40 approach cards (below)
  CONTRACT.md                  the strip contract the author reads (frame purity, DOM API, budgets)
  author.mts                   runAgent per approach in an isolated workspace
  lint.mts                     static frame-purity lint (no network, no clock)
  render.mts                   headless capture + encode, built on lib/export/headless.ts
  gates.mts                    automated pre-gates (no verdicts)
  run.mts                      orchestrator: --lane edu|stat --only <ids> --concurrency 3 --replicas <ids>
```

### 1. Author (`author.mts`)

- Uses `runAgent` (`lib/agent/cliSeam.ts:287`) with tools `Read, Write, Edit`.
  It runs in an isolated workspace with only `inputs/` and `out/`
  (`assertIsolatedWorkspace` :173), under a new `AgentTurnClass` named
  `strip-author`.
- `inputs/` holds the brief, the data fixture, the approach card,
  `CONTRACT.md`, and the optional Leonardo asset.
- `out/` receives `strip.html` and `style.json`.
- The agent cannot run a browser. The orchestrator renders and hands back
  the result.

### 2. Lint (`lint.mts`)

The lint rejects the strip before any render if the source contains any of
these:

- `Date.now`, `performance.now`, `new Date()` without an argument
- `Math.random`
- `requestAnimationFrame`-driven state, `setTimeout`, `setInterval`
- unpaused CSS animations or transitions
- `fetch`, `XMLHttpRequest`, external `src` or `href`
- `canvas.toDataURL` loops that hold state between frames

Each error names its rule. That is "enforce at the layer that can see it."

### 3. Render (`render.mts`)

1. `launchHeadless`, then set the viewport to the strip's size.
2. For `i in 0..239`, run `renderFrameAt(i)`, wait for fonts and images once,
   then screenshot.
3. Encode with `withEncoderFallback` to mp4 (h264).
4. Run `pipeline/video/transcode.mjs` to make a webm and a poster for the
   grid.
5. Make a 4×3 contact sheet with ffmpeg `tile`.
6. Land the outputs with `landExport` into
   `foundry-out/strips/<runId>/<approachId>/`.

### 4. Fix loop

Render, build the sheet, then run a second `runAgent` turn. That turn reads
`sheet.png`, the lint and gate output, and the contract, then edits the
strip. Re-lint and re-render. **At most 2 rounds.** Rounds, durations and
seat cost go into `meta.json`.

### 5. Pre-gates (`gates.mts`)

These are recorded and shown as badges. They never delete a strip.

- **Seek-stable:** a fresh page renders frames 180, 0, 120 cold, out of
  order. They must be pixel-equal to the sequential captures.
- **Legibility floor:** the smallest computed `font-size` of visible text,
  scaled to 1080 wide, must be at least 26 px. Text boxes must sit inside
  the safe box.
- **Not blank and not static:** the frame-diff energy curve has motion in
  at least 3 of 8 seconds, and no black frames.
- **Exact length:** exactly 240 frames.

### 6. Leonardo supporting assets

The approach card declares the asset, with
`leonardo: none | texture | backdrop | sprite`.

- It is generated **before** authoring, through `leonardoProvider()`
  (`lib/imaging/providers/leonardo.ts:108`). Use the canonical script entry
  in `pipeline/build-style-trials.mts:24-68`.
- Each card gets at most one asset. The whole run gets at most 10.
- No text, no logos, no people.
- Provenance and cost go into `meta.json`.
- The strip must still render if the asset is missing (a fallback fill),
  so a dead key never blocks triage.

### 7. Replicas (discrimination)

Four approaches per lane are authored a second time from the same inputs.
`approach-to-approach distance / author-to-author noise` is computed on
contact sheets and printed on the triage card. The 1.5× floor decides
whether a verdict can land registry content. It never decides whether a
strip is shown.

### 8. Optional effort arm (registry lead, row 8)

Three approaches are authored at `effort: low` and `effort: high`. The
operator reads them blind among the replicas.

## The /foundry surface: a fifth tab, `Strips`

- **Tab:** add `"strips"` to `Tab` (`app/foundry/plant.tsx:37`), switched in
  `FoundryView.tsx:420-428`. Add `StripGrid.tsx` and reuse the Cull
  keyboard: K keep, X reject, U clear, Enter for the lightbox.
- **Grid:** two bands (edu, stat), 20 cards each.
  - Each card is a muted, looping `components/ui/Clip.tsx`. It plays only
    while visible and respects reduced motion.
  - The card shows the approach **number only** until the verdict is
    cast. Name and medium appear after: a blind first read, revealed on
    decision.
  - Gate badges use `signal/` vocabulary: `PipRow` for the four pre-gates,
    `Tally` for fix rounds, `Provenance` for the Leonardo asset. No
    explanatory prose (CLAUDE.md, "The app does not explain itself").
- **Lightbox:** the clip plus a frame scrubber over the contact sheet.
  *Optional:* the live `strip.html` in a sandboxed iframe
  (`sandbox="allow-scripts"`, no same-origin, CSP `default-src 'none'`
  plus inline), scrubbed by calling `renderFrameAt`. That gives a lossless
  scrub, which is possible only because the strip is deterministic.
- **Verdict:** `keep | reject`, an optional note, and up to three **reason
  chips** from a closed set: `concept`, `legibility`, `motion`, `craft`,
  `identity`, `too-busy`, `generic`, `broken`. These chips are the learning
  signal. Free notes alone cannot be aggregated.
- **Files:**
  - Add `kind=strips` to `GET /api/foundry/file`.
  - Allow `.mp4` and `.webm` there, with HTTP range support lifted from
    `/api/video/clips/[id]/file`. `SERVABLE_EXTENSIONS`
    (`lib/foundry/runStore.ts:15`) is currently images and json only.
  - `strip.html` is served only to the sandboxed lightbox, with its own CSP
    header.
- **Routes**, mirroring the training store:
  - `GET /api/foundry/strips`
  - `GET /api/foundry/strips/[id]`
  - `PUT /api/foundry/strips/[id]/verdicts` (autosave at 400 ms, like Cull)
  - `GET|POST /api/foundry/strips/[id]/commit`
- **Commit** runs under the catalogue lock (`lib/foundry/catalogue.ts`) with
  a new `CatalogueOp` named `"strip-commit"`.
  - **Kept:** copy `strip.html`, `style.json`, the poster and the sheet to
    `pipeline/foundry/motion-styles/<styleId>/`. Add an entry to a new
    `pipeline/foundry/motion-styles.json` with status `candidate`, origin
    `{kind: "code", run, approach}`, evidence, and the chips.
  - **Rejected:** append a ledger row with its chips, then delete the media.
  - **Findings:** write `findings.md` with keep-rate per card attribute
    (medium, motion grammar, density, texture source, chart-vs-concept),
    with n printed beside every rate.
  - **Why a separate catalogue:** `StyleDef.recipe` and `negative`
    (`lib/foundry/types.ts:98-112`) are prompt-shaped, and a code style is
    not a prompt. Forcing one into the other is the exact confusion the
    intake lead names. The journal and lock are shared, so there is still
    one revision history.

## Round 2: transfer, and promotion to `proven`

Every kept style is re-authored against a **second brief** in its lane
(`edu-02`, `stat-02`). The author gets **only `style.json` and the kept
`strip.html` as reference, with no prose description of the look.**

- If the operator keeps it again, it becomes `proven`. This mirrors the
  forge rule of 2 or more scenes (`store.ts:287`).
- That verdict is the return condition of the registry lead: does the module
  hold the look without restating it?

## The 40 approach cards

The cards live in `pipeline/strips/approaches.json`, with the shape of
`Approach` in `lib/foundry/strips/types.ts`. Each card carries:

- a direction
- a falsifier, written before rendering: the most likely way the card loses
- medium, motion grammar, density
- for the stats lane, a chart or concept seat
- a Leonardo asset declaration

**Briefs (operator decision 2026-10-06).** Each lane has several cases, and
each card renders the case its form suits. This follows
`case-native-chart-form`: the chart form follows the story. That **confounds
style with case** in round 1, which is accepted and handled in two ways:

- Every case also gets a **positive-control** strip (the plain house
  infographic, `--ctrl`). Each card is triaged against its own case's control.
- Round 2 re-authors every kept style on a **different** case, from the
  module alone. That separates style from case.

Data comes from fetched primary sources only: `pipeline/strips/data/*.json`,
reproducible by `pipeline/strips/fetch/*.mjs`.

**Statistical (9:16), decade-spanning and changing gradually, 4 cards per
case:**

| Case | Data | Cards |
|---|---|---|
| `f1-wins`: most F1 race wins, cumulative 1950–2025 | Jolpica-F1 (Ergast-compatible), cross-checked against Wikipedia | S01 broadcast scoreboard (leader-adaptive) · S02 race-track lanes · S03 split-flap board · S04 neon arcade leaderboard |
| `intl-goals`: men's international goals, cumulative | martj42/international_results goalscorers, cross-checked | S05 ball-stack columns · S06 editorial newspaper chart · S07 big-number kinetic type · S08 rank-flow ribbons |
| `heavyweight-lineal`: lineal heavyweight champions over time | Wikipedia lineal championship (CC BY-SA) | S09 belt passing down the timeline · S10 fight-poster risograph · S11 reign Gantt + days counter · S12 hand-drawn notebook |
| `govt-debt`: largest government debt in USD, 1980–2024 | IMF DataMapper GGXWDG_NGDP × NGDPD | S13 cut-paper skyline · S14 gauge cluster · S15 treemap reflow · S16 orthographic globe + dated log |
| `gdp-top`: largest economies, 1960–2024 | World Bank NY.GDP.MKTP.CD | S17 isotype pictograms · S18 waffle of world share · S19 bubble trails · S20 bar race with ghost of the past |

**Educational (16:9), "how things work", 5 cards per case:**

| Case | Domain | Cards |
|---|---|---|
| `edu-rate-hike`: how a rate hike cools inflation | economy | E01 kinetic typography · E02 Bauhaus geometric · E03 isometric diorama · E04 comic halftone · E05 mathematical ink |
| `edu-chokepoint`: how the Strait of Hormuz moves oil prices | geopolitics | E06 nautical blueprint · E07 cut-paper layers · E08 two-ink risograph · E09 low-poly 3D map · E10 particle flow |
| `edu-aqueduct`: how a Roman aqueduct crossed a valley on gravity | history | E11 copperplate cross-hatch · E12 watercolour wash · E13 exploded cross-section · E14 museum cabinet · E15 clay stop-motion |
| `edu-radar`: how radar times an echo to measure distance | military | E16 oscilloscope neon line · E17 8-bit pixel · E18 chalkboard · E19 sketchbook pencil · E20 1940s field manual |

**Leonardo:** 7 supporting assets in total, under the cap of 10. They are 5
textures (paper, watercolour paper, chalkboard, aged manual paper,
construction paper) and 2 backdrops (museum cabinet, studio bokeh). None
contains text, logos or people. One asset is made per approach, and replicas
reuse it.

**Vendored libraries** come from `pipeline/strips/vendor/`, which holds
pinned UMD builds with checksums. They are three (E09) and
d3-geo/topojson/world-atlas (S16). Nothing loads from the network.

**The full round is 52 cards:**

- 40 approaches
- 9 controls
- 8 replicas: E02, E07, E13, E18, S02, S07, S13, S18 (two per lane-half)
- 3 low-effort arms: E10, S06, S19

## Order of work

| Phase | What | Done when |
|---|---|---|
| P0 | `CONTRACT.md`, the two briefs, the fetched stat fixture, `approaches.json` | the fixture carries its source URL and date. Cards carry falsifiers. |
| P1 | `lint.mts`, `render.mts`, `gates.mts` over a hand-written strip | the seek-stable gate fails on a planted second writer and passes the fixed version (paired). |
| P2 | `author.mts` and `run.mts`, controls E01 and S01, then a 4-card pilot with 2 replicas | the controls pass. The pilot prints a discrimination ratio. |
| P3 | `/foundry` Strips tab, file kind and range support, verdict store | `npm run verify` is green. A UI probe drives K/X and asserts the PUT. The tab is photographed (`pipeline/cx-capture.mjs`) and the PNG opened. |
| P4 | The full 40 at concurrency 3, then operator triage | every card has a verdict or an explicit skip |
| P5 | `strip-commit`, `motion-styles.json`, `findings.md` | the journal line is written. Kept modules exist and rejects are recorded. |
| P6 | Round 2 transfer on `edu-02` / `stat-02` for kept styles | the `proven` set and the registry lead's verdict |
| P7 | *Fork C*, the consumer path | see below |

**Cost, as an estimate, not a measurement:** each card is 1 author turn, up
to 2 fix turns, and about 1–2 min of capture and encode. Across 40 cards,
8 replicas and 6 effort-arm cards, that is about 54 author runs on the CLI
seat plus 6 Leonardo images. P1 and P2 replace this estimate with measured
per-card seat time before P4 is launched.

## Forks for the operator

- **A. Aspect per lane.** **Decided 2026-10-06:** stats 9:16, edu 16:9.
- **B. Briefs.** **Decided 2026-10-06:** five decade-spanning stats cases
  and four "how things work" edu cases (economy, geopolitics, history,
  military). See the tables above.
- **C. Consumer path (after P6).** **Decided 2026-10-06:** this waits for
  the triage. Proven motion styles need a studio
  consumer. Nothing outside `/foundry` reads the catalogue today
  (`docs/concepts/moonshots-2026-10-05/09-content-pipeline.md:166-171`).
  *Recommended order:*
  1. Append two templates to `TEMPLATES` (`lib/projects.ts`; append only, per
     `templateOf`): `stat-reel-short` and `infographic-explainer`.
  2. Give the Motion step a `code` render path that authors a strip per beat
     against a chosen motion style.
  3. Decide whether "statistical" becomes its own `DISCIPLINE`. That is a
     direction, so it is decided after the triage shows the lane is real,
     not before.

## Known risks

- **Author noise may swamp style.** If the replica ratio is under 1.5×, the
  keeps are still real picks but cannot land registry content. Show it
  anyway.
- **WebGL in headless Chromium** may fall back to software GL. E20 is the
  only card that needs it. A slow or black render there is a harness
  finding, not a style verdict.
- **Fonts.** Strips embed only fonts vendored in the repo. A missing font
  silently changes the look and breaks the legibility gate.
- **Sandboxing.** `strip.html` is LLM-authored code. It is rendered only in
  headless Chromium with network blocked (`page.route('**', abort)` except
  `file:`), and in the UI only inside a sandboxed iframe.
