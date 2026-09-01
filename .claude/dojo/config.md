# Dojo overlay — gravitone on Wolf (RTX 4090, 24 GB)

The per-repo declaration the `/dojo` skill reads. The skill is the method; this
file is what THIS machine can do and what THIS repo trains.

## runner

This box is a GPU box: one RTX 4090 (24 GB), ComfyUI + Flux 2 for stills,
Ollama (`qwen3.8:27b`) for annotation and grading. The forge manages the
engine turn itself (`pipeline/vlm-probe/guard.py` starts/recycles ComfyUI and
enforces the one-engine-at-a-time rule) — the runner template never starts
ComfyUI by hand.

### MODEL POLICY — two pure stacks (operator, 2026-09-01, superseding same-day ban)

The dojo is RESEARCH: the app is not deployed and not commercial, so cycles
exist to improve knowledge until similarly capable, permissively licensed
models arrive. Two stacks, one wrapper, never mixed inside a cycle — a
verdict is about the stack its cycle names:

| | **local** ($0) | **google** (billed) |
|---|---|---|
| image | Flux 2 via ComfyUI (`dojo_pairs.py`), seed-matched | Nano Banana 2 via router (`dojo-pairs-nb.mts`), no seed → k repeats per arm |
| video | Wan 2.2 t2v; **MiniMax H3** ref2va/fl2va for reference-conditioned and serial cycles (operator authorization: research use, app non-commercial; H3's EU license row stands recorded and the call is the operator's, revisited when licensed peers land) | none declared |
| eyes | ollama qwen3.8:27b | gemini-3.6-flash (`prefer: "google"`) |

- Wrapper: `python pipeline/foundry/dojo_run.py <cycle-dir>` dispatches on the
  spec's `stack` + `media`; a spec naming no stack is refused, never guessed.
- **Qwen cloud stays banned** (out of the router's dev plan).
- The google stack's role: product-truth verification — NB re-runs of
  local-stack-gated rules settle transfer before a reflection merges.
- H3 protocol knowledge (lengths ≡ 5 mod 17; reference-conditioning holds
  identity at 0.1887 across hard cuts vs 0.6262 chain drift; `<Picture N>`
  tags or the reference is ignored) applies whenever the H3 lane runs —
  `pipeline/vlm-probe/motion.py` holds the working graphs.

### image (forge — style-recipe lab)

One plan in, a graded candidate grid out. Dojo writes a plan crossing the
baseline and challenger recipes over the scene roster with the fixed seed
list, then:

```powershell
$log = "pipeline/foundry/logs/dojo-<cycle-id>.log"
Start-Process -FilePath "python" -ArgumentList "pipeline/foundry/forge.py", "<plan.json>", "--run-id", "dojo-<cycle-id>" -WorkingDirectory "C:/Users/kazda/kiro/gravitone-gcloud" -RedirectStandardOutput $log -RedirectStandardError "$log.err" -NoNewWindow
```

Poll with Monitor, never a Bash background task — the 10-minute ceiling kills
those (see the project memory note; a forge run is hours). Resumable per file:
re-launching with `--resume` continues a dead run.

### pairs (composition cycles)

When the thing under test is a PROMPT rather than a style recipe, the forge
is the wrong runner (one style id per plan). `pipeline/foundry/dojo_pairs.py`
renders a spec of seed-matched duos through the same ComfyUI + guard turn and
reads every image back with qwen (craft annotation + style readback):

```powershell
Start-Process -FilePath "python" -ArgumentList "pipeline/foundry/dojo_pairs.py", "foundry-out/training/<cycle-id>" -WorkingDirectory "C:/Users/kazda/kiro/gravitone-gcloud" -RedirectStandardOutput $log -RedirectStandardError "$log.err" -NoNewWindow
```

Baseline prompts for shot-based cycles come from the LIVE compiler:
`npx tsx pipeline/foundry/dojo-shot-prompts.mts <shots.json>` prints
`shotPrompt.actionFor` + `compilePrompt` output, never a retyped copy.

### video (opened 2026-08-31)

**Why Wan and not MiniMax H3, despite the repo's own large H3 exercises**
(vlm-probe consistency + motion spikes; ref2va identity 0.1887 across hard
cuts vs 0.6262 chain drift — the checkpoints are on this disk): the
registry's `generative-provider-routing/capability-to-vendor-plan` records
that H3's Community License **excludes the EU from local deployment,
including use of the outputs**, and this machine is in the EU. The same row
names Wan 2.2 (Apache-2.0) as the local plan that survives the license
check. H3's PROTOCOL knowledge carries over regardless of engine — lengths
must be congruent to 5 mod 17, reference-conditioning beats last-frame
chaining across cuts, `<Picture N>` tags or the reference is ignored — and
H3's hosted API (~$0.08-0.13/s) is the lawful route if its quality is ever
worth the bill; that is an operator decision, not the loop's.

Wan 2.2 TI2V 5B via ComfyUI (`pipeline/foundry/dojo_video.py`), 848x480x121
(~5s @24fps), seed-matched t2v duos, same gen-spec shape as the pair runner
plus `length`. Judging reads three posters per clip (t0/t1/t2, cut by ffmpeg)
through the qwen annotator; **no Gemini on this dimension** (operator
instruction, cost) — the chokepoint judge is the only machine judge, so
`judge_pick_rate` alone carries the pre-human signal. Ladder: single 5-10s
clips first (compose the gated stills knowledge into motion), then SERIAL
pairs — two scenes cut into one sequence under continuity contracts (restated
style block, one shared light world, preserved screen direction, cut on
motion, a corpus-measured ladder jump). Budget: **12 clips max per window**.

### video (the old declaration)

**Absent, deliberately.** Wan renders exist on this machine only as measured
experiments (`pipeline/vlm-probe/consistency.py`'s H3 chain lane notes,
832x480x73); there is no scripted, resumable CLI lane yet. Until one exists,
cycles plan **image pairs only** — a video improvement stops at Phase 4 with
`runner(video): absent`. When the wan lane gets a forge-shaped script, declare
it here (it must render a poster still per clip; judges and the tab read
stills).

## budget

Per cycle window (one window = one calendar day on this box):

- **24 pairs max per cycle** (both arms counted — 12 seed-matched A/B duos),
  1280x720, 20 steps: ~2 GPU-hours worst case on this card.
- **2 cycles max per window**; the loop stops at the ceiling and says so.
  `--resume` only once the window has moved.
- **Operator override 2026-08-30 (second session):** cycles 3–10 authorised in
  one window, 4 duos each (8 candidates), to gather a VARIETY of problems —
  the operator's own ranking: cinematography composition, beat composition,
  the thin art-style library — outranks the librarian's points. Reverts to
  2/day afterwards.
- Judge spend: local (Ollama) is unmetered; Gemini joint-judge calls capped at
  **30 requests per cycle**.

## dimensions

Allowed subjects (media-generation bundle), image lane first:

- `image-prompt-composition`
- `visual-style-locking`
- `frame-direction`
- `cinematic-language`
- `character-identity-continuity`
- `video-assembly` — **parked until the video runner exists**; planning and
  reflection may touch it, generation may not.

## promptSurfaces

Which file owns which recipe decision (reflection edits go here, never
grepped for):

| Decision | Surface |
| --- | --- |
| Scene/frame prompt rules | `pipeline/FRAMES-SCENE-PROMPT.md` |
| Brief direction lines | `lib/formatBrief.ts` (`direction[]`) |
| Shot prompt assembly | `app/_phases/frames/shotPrompt.ts` |
| Style extraction prompts | `lib/foundry/extract/prompts.ts` |
| Music plan briefs | `lib/music/plan.ts` |

## judges

Both logged per pair; none pinned yet (pin after >= 3 gated cycles show one
tracking the human better, and record the decision here):

- **chokepoint** — per-image readback via this repo's recognize router, pick
  via its reason router (`lib/text/` chokepoint; the fallback ladder applies).
- **gemini-joint** — both stills plus the claim in one multimodal request.

## Skill improvement log

- 2026-08-30 — gate rehearsal without the browser: when the Chrome extension is
  not connected, the Foundry → Dojo gate can be exercised through the app's own
  routes (`PUT /api/foundry/training/<id>/verdicts`, `POST .../commit`) with
  `Authorization: Bearer $IMAGING_ACCESS_SECRET` from `.env.local` — same code
  path the tab drives. Reflect must SKIP rows whose cycle id is a fixture:
  revert `training-ledger.json` and delete `thumbs/fixture-*` instead of
  editing prompt surfaces.
- 2026-08-30 — first live window (2 cycles, 24 candidates, ~1h40 GPU): the
  forge takes ONE style id per plan, so an A/B is run by pre-building
  `run.json` with both arms and launching with `--resume` (the plan file is
  only forge's preflight). Expect 1–3 `finished with no image` races per
  12-candidate pass on this 64 GB box (guard recycles ComfyUI under commit
  pressure); a second `--resume` pass fills them. The qwen readback pre-filter
  was FLAT on both cycles while Gemini picked the challenger 4/6 each time —
  the grader's closed enums cannot see a lifted-black or a colour-role
  change; the human gate is the only instrument for these techniques.
  Gemini `3.7-flash` answered 503 across a whole batch; `3.6-flash` served.
- 2026-08-31 — window ran 2 control-shaped cycles on image-prompt-composition
  (the one allowed subject with no pending gate). order-control: the reversed
  prompt LOST (challenger pick_rate 0.00; readbacks drifted photoreal-cg →
  stylised-realistic when style came second) — style-first-token-ordering has
  current Flux 2 evidence; in the tab, REJECT the challenger to confirm the
  law. clause-position: NULL — the tail-appended lantern clause landed in both
  arms on every pair (~1.3k chars is inside Flux 2's obeyed window); the
  budget-limits claim needs a much longer prompt to bite. When gating: a
  control cycle's challenger is a deliberate law violation — reject = law
  confirmed.
- 2026-08-31 (second session) — the CORPUS-STUDY method proved end to end, twice,
  with zero user help in the loop: gap-ranked source pick -> yt-dlp (official
  studio trailer only; candidate fallback ladder — the first search hit was a
  dead video id, `--js-runtimes node` needed) -> extract_frames.py -> qwen
  annotation (63 frames ~35 min GPU) -> dojo_study.py cross-analysis ->
  falsifiable claim -> dojo_pairs A/B -> parked. Study 1 (159 on-disk corpus
  frames, no download): diagonal is A-tier action's top extreme-wide
  composition and PLACEMENT_PHRASE cannot say it — A/B 0.67/3-of-3/1.0, and
  the qwen composition readback measured the change directly (0/3 -> 2/3
  diagonal), the first cycle where the pre-filter was not blind. Study 2
  (Spider-Verse trailer): 89% of frames name >=2 in-world light sources —
  the layered-environmental-light refinement of gated rule 7 — A/B
  0.67/3-of-3/0.67. Acquisition boundary honoured: official promotional
  material only, analyzed locally, frames never become generation references.
- 2026-08-31 (third session) — OPERATOR FINDING, method-level: the corpus-study
  cycles missed their purpose. Dozens of annotated frames must not collapse
  into one clause-sized A/B. The study yield contract is now THREE LANES, all
  owed per study: (1) STYLES — run the Extract engine over the frame set
  (`extract.mts <folder> --slug ...`; queued for spiderverse-atsv next window,
  it spends imaging budget); (2) the BEAT MAP — dojo_study.py now emits
  `_beat_map` (technique distributions per cut position); spiderverse facts:
  eye-level monopolizes the setup (16/16), angle drama appears only at
  peak/tail, diagonal density doubles toward the tail, the build flips
  high-key; (3) A/B claims — verification instrument only, never the whole
  yield. A study report must say what each lane produced or why it is empty.
- 2026-08-31 (third session, video window): first 8 Wan clips rendered clean,
  0 failures, ~6 min/clip. Two protocol lessons the next video cycle inherits:
  (1) the blind brief must carry EACH PAIR'S authored motion intent - a global
  'one readable move' standard punishes authored near-stillness; (2) serial
  continuity must be written as VISUAL clauses only - editorial meta-language
  ('shot 2 of the sequence', 'cut from the pier') gets drawn, and the model
  paints the world it was told it cut away from.
- 2026-09-01 — scheduled window: Phase 0 reflected the two approved study
  cycles onto the review branch (diagonal placement joins SubjectPlacement;
  rule 7 gains the environmental layer; both regression-pinned @ 1dfce8f).
  Cycle 1 (video, serial-visual-only): the meta-language hypothesis LOST on
  the new seed (0.00) after winning-shaped evidence the day before - serial
  world drift looks seed-dominated; the claim needs >=4 seeds per arm before
  another cycle, filed as a demand note. Cycle 2 (styles lane): the Extract
  engine over the spiderverse gallery yielded 7 styles (~$1 imaging spend;
  recognitions rerouted to google because QWEN_API_KEY is unset - the video
  no-Gemini ban does not cover the imaging router's own routing) - cull in
  /foundry -> Extract. The three-lane study contract is now fully exercised.
- 2026-09-01 (second session) — the imaging router grew a LOCAL provider:
  `ollama` (recognition, qwen3.8:27b via OLLAMA_HOST) now leads the dev
  recognize plan, cloud eyes demoted to trail-visible re-routes. Proven live
  through the chokepoint: provider=ollama, $0.00, schema enforced. Extract
  runs' `eyes` are now local wherever OLLAMA_HOST is set; `pixels`
  (generation) still bill Google — the local Flux 2 lane exists only outside
  the router (forge/dojo), and folding it in is a declared seam, not done.
  `pipeline/foundry/prove-local-eye.mts` re-proves the wiring in one command.
- 2026-09-01 (third session) — TRANSFER VERIFIED on the google stack: the two
  unanimous Flux-gated rules re-run on Nano Banana with identical prompts
  (k=2 repeats/arm, no seed on the API) both held at 0.75 pick rate —
  what-stays-dark 3/4 + counted-beats 3/4-with-1-tie, ~$1.62 total. The
  reflection branch's rules stand stack-agnostic pending the gate. One retry
  lesson: the NB runner's first invocation crashed in Node teardown
  (UV_HANDLE_CLOSING assert after run completion of nothing); the runner is
  resumable and the second pass recovered everything — treat one silent early
  exit per chain as ordinary, same as the ComfyUI races.
- 2026-09-01 (fourth session) — Colibri/GLM-5.3-Flash exploration (operator
  ask): image generation NO (pure inference engine), recognition YES as a
  prospective SLOW DEEP EYE (321B vision MoE, experts int4-streamed from
  NVMe; the wall is disk bandwidth, ~4.8 GB touched per token — this box's
  KC3000 + 64 GB RAM projects ~1-3 s/token vs the reference's 20-44 s).
  Acquisition running detached: `colibri-models/convert-glm53.log`, 62
  shards, ~195 GB, resumable — a later session serves it with
  `C:/Users/kazda/kiro/colibri/coli serve --model C:/Users/kazda/kiro/colibri-models/glm53_i4`.
  Pre-registered test protocol + decision rule live in the registry:
  librarian/sources/2026-09-01-colibri-glm53-experiment.md. If the lane
  earns its place it enters the LOCAL stack as a third eye tier (bulk =
  qwen3.8:27b, deep = glm53) — never a bulk annotator.

- 2026-09-01 (eval run, worktree eval-dojo-fable, branch eval/dojo-fable) - cycle `2026-09-01-slot-override` (visual-style-locking / scoped slot override vs a contradicting tail clause, 4 duos, local stack, `--no-gemini` per MODEL POLICY) hit the BREAKER: pass 1 rendered 5/8 (two 900s ComfyUI hangs + one 'no image'), the fill pass failed 3/3 'finished with no image' each within ~60s of a fresh recycle -> `status: failed`; `--resume` next wake fills three renders. Two things the next session inherits: (1) the runner truncates the ComfyUI exception to 80 chars and the guard starts the engine hidden with no captured stdout, so a cause is unrecoverable after a recycle - widen `str(e)[:80]` and redirect ComfyUI's stdout to `pipeline/foundry/logs/comfy-<ts>.log` before the next window; (2) `Out-File` stamps a UTF-8 BOM on cycle.json - write the manifest from Python or use `-Encoding utf8NoBOM`/utf-8-sig reads, or `dojo_judge.py park` will choke. Pre-filter evidence from the 5 readbacks: the tail-appended departure clause landed in the baselines too (low-key/hard/high contrast in 4 of 5 arms, 1 baseline soft), so the scoped-override claim reads NULL on ~1.1k-char prompts, consistent with clause-position.
