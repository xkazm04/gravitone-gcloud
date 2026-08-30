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
