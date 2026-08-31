# Dojo overlay — gravitone on Wolf (RTX 4090, 24 GB)

The per-repo declaration the `/dojo` skill reads. The skill is the method; this
file is what THIS machine can do and what THIS repo trains.

## runner

This box is a GPU box: one RTX 4090 (24 GB), ComfyUI + Flux 2 for stills,
Ollama (`qwen3.8:27b`) for annotation and grading. The forge manages the
engine turn itself (`pipeline/vlm-probe/guard.py` starts/recycles ComfyUI and
enforces the one-engine-at-a-time rule) — the runner template never starts
ComfyUI by hand.

### image

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

### video

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
