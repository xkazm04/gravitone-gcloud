# Mesh: a game asset made on this box

A game asset is a concept image turned into one or more 3D variants. TRELLIS.2 makes each mesh
through ComfyUI. Blender finishes it to the class's triangle budget, renders it and, for a
character, rigs it onto the UE5 Mannequin chains. PoF's gates judge the result. Everything runs on
this box, and nothing is billed.

Code: `lib/foundry/mesh/` (the asset store, the acts, the ported PoF gates under `gates/`),
`packages/producers/src/mesh/define.ts` (the two stages as jobs), `lib/producers/mesh.ts` and
`finish.ts` (the bindings), `pipeline/mesh/blender/*.py` (the ported lynx-bench scripts),
`pipeline/mesh/trellis-api.json` (the TRELLIS workflow), `pipeline/mesh.mts` (the CLI).

A /scout night briefs assets too, from words: `pipeline/scout.mts asset <night> --brief` draws the
concepts, gates them, writes the asset (`night` set, a T2 variant made from its own `concept`) and
queues the mesh job; the morning packet's `3d` rows judge the variants and write their `verdict` here.
See `docs/scout.md`, "A game asset".

## Making one

```bash
GRAVITONE_STORE_PATH=<store> MESH_STORE_DIR=<dir> npx tsx pipeline/mesh.mts new hero-rogue \
  --class character --subject "hooded archer, leather, chunky silhouette" --concept rogue.png --rig
npx tsx pipeline/mesh.mts status hero-rogue
npx tsx pipeline/mesh.mts keep hero-rogue t2
```

`new` is DRY by default. A dry run calls no engine: each variant gets a stand-in box at the class's
size, a placeholder poster, and the real gates read off the stand-in. Add `--live` to run ComfyUI
and Blender. `GRAVITONE_DRY_ONLY=1` refuses `--live`. `--detach` queues the mesh job and leaves
both stages to the worker (`npm run worker`), which admits each job by its engine's profile.

| class | default techniques | decimate target | budget (tris, warn above, parts) |
| --- | --- | --- | --- |
| character | T1, T2 | T1 38000, T2 18000 | 40000, 60000, 24 |
| weapon | T1, M1 | 15000 | 15000, 22500, 6 |
| prop | T1 | 10000 | 10000, 15000, 6 |

- **T1** budget generation: TRELLIS.2 decimates to the target inside ComfyUI, before the texture bake.
- **T2** game-camera design: the same pipeline at 18000 triangles.
- **M1** touch-up (weapons): `touchup.py` over T1's own mesh, with no second GPU run. It needs the
  subject to name a sword, mace, axe or staff.
- **M2** (corrected regeneration) is refused. Make the corrected concept a new asset.

`--rig` is for characters only. Exit codes: 0 done, 1 failed or refused, 2 usage.

## The input gate

Before anything is written, the concept must pass three checks on a 256 x 256 decode (ffmpeg,
`FFMPEG`):

| code | verdict | when |
| --- | --- | --- |
| `busy-background` | fail | under 85% of the border ring is the background colour |
| `uneven-background` | warn | under 97% |
| `multiple-subjects` | fail | a second region holds 8% of the largest |
| `no-subject` | fail | the largest region holds under 0.5% of the frame |
| `subject-cropped` | fail | the subject touches the frame edge |
| `tight-margin` | warn | the subject is within 2% of an edge |
| `subject-small` | warn | the subject spans under a quarter of both axes |

A fail refuses the launch, and so does a concept ffmpeg cannot decode (`unmeasured`). Then no asset
is made and no job is queued. A warn proceeds, and is kept as the `input` gate on every variant.

## The two jobs

| stage | lane | engine | unit | variant status |
| --- | --- | --- | --- | --- |
| mesh | gpu.local | comfy | one TRELLIS run per variant -> `<v>/raw.glb` | pending -> generated |
| finish | box.blender | blender | the Blender chain per variant | generated -> finished |

When the mesh job ends done, its settle queues the finish job in the same mode. When a job fails
or is stopped, its sentence is written onto every variant still waiting for it. A variant's own
failure (a ComfyUI node error, a Blender exit code) is written onto it verbatim, and the job goes on
to the next variant. Only a ComfyUI that never answers counts toward the job's breaker.

`finish <asset> [--variant v]` retries: failed variants that have a raw mesh go back to `generated`
and a new finish job runs.

### ComfyUI

`COMFY_URL` (default `http://127.0.0.1:8188`). The mesh job uploads the concept, queues
`trellis-api.json` with node 186 `target_face_count`, the seeds in nodes 3, 12, 18 and 23 (when the
variant names one) and node 322's prefix `gravitone/<asset>_<variant>`. It polls `/history` and
fetches the glb through `/view`. It never POSTs `/free`, never interrupts and never restarts
ComfyUI. A live job driven from the CLI first reads `/queue`. If anything is queued, the job stays
queued for the worker, whose admission waits for an empty queue. A run past 20 minutes fails its
variant, and its prompt is left on the queue.

### Blender

`BLENDER` (default `~\ai\tools\blender-5.2.2-windows-arm64\blender.exe`), run as
`-b --factory-startup --python-exit-code 1 -P <script> -- <args>`, 15 minutes per step. Each script
writes a JSON result file, which is read instead of stdout.

1. `finish.py` (or `touchup.py` for M1): weld on import, floaters under 1% of faces removed, a
   character scaled to 1.8 m, metallic clamped to 0.5, glb exported with Draco off.
2. `rig.py` (rigged characters): UE5 Mannequin chain names, heat weights on a voxel proxy,
   transferred and normalised.
3. `metrics.py`: PoF's mesh metrics on the delivered glb.
4. `render.py`: `<name>_hero.png` (the poster) and `<name>_gameplay.png` (640x480, 30/45 ortho).
5. `views4.py` + ffmpeg: `<name>_turnaround.png`. If this fails it is recorded as a limitation and
   the variant still finishes.

Then the finished glb is read back: its triangles, its joints, no Draco. A Blender step that exits
non-zero fails the variant with its last lines of stderr, verbatim.

## The gates

Ported from PoF with the source commit in each file's header (`lib/foundry/mesh/gates/`). Each
`GateResult.version` names the file it was graded by.

| gate | scorer | graded against |
| --- | --- | --- |
| `input` | this repo's concept check | single subject, plain background, whole in frame |
| `mesh` | `scoreMesh` @ a85aaede, stage `finished` | the class thresholds and the brief's budget |
| `budget` | `gradeFaceBudget` @ 5b0e018c | the brief's `budgetTris`, 10% tolerance |
| `scale` | `gradeWorldScale` @ f87067fe | 1.8 m for a character; none for a weapon or a prop |
| `rig` | `scoreRig` @ 09e7a90d | biped bound to `ue5-mannequin` (pelvis-head, clavicle-hand, thigh-foot) |

A gate whose input is missing reports `unmeasured`, with its reason as the one `warns` line
(`unmeasured: ...`). It never reports `pass`. A weapon's or prop's scale always reads unmeasured,
because PoF gives those classes no nominal size.

## Files

```
<MESH_STORE_DIR>/<asset>/asset.json, concept.png
<asset>/<variant>/raw.glb                       TRELLIS output (or M1's copy of T1's)
<asset>/<variant>/<name>_static.glb             finished (M1: <name>_touchup.glb)
<asset>/<variant>/<name>_rigged.glb             rigged characters
<asset>/<variant>/<name>_hero.png               poster (dry: <name>_hero.jpg)
<asset>/<variant>/<name>_gameplay.png, _turnaround.png, _finish.blend / _rigged.blend, metrics.json
```

`<name>` is `<asset>_<variant>` with anything other than letters, digits and underscores replaced
by `_`.

## First live runs (2026-10-22, this box)

Both ran end to end on the real ComfyUI (TRELLIS.2) and Blender 5.2.2 ARM64, into throwaway stores.

| Asset | Concept | Wall | Gates | Eye |
|---|---|---|---|---|
| weapon, rune axe, T1 | round-4 M2 axe (side profile) | 1 min 32 s | input pass 100, mesh pass 100, budget pass (15,000), scale unmeasured | usable; the concept's rust-red accents came out darker (round 4's known colour loss, M1's job) |
| character, rogue, T2 + rig | round-4 rogue T2 | 13 min 29 s | input warn 85 (touches-edge), mesh warn 85 (not watertight), budget pass (15,874), scale pass, rig pass 100 | the rig deforms (pose tests); the mesh is faceted, the face and hands lost, the quiver gone - not game-ready |

Measured cost of a TRELLIS run over the baseline: GPU memory +10.6 GB (peak 12.7 GB), commit charge
+11.6 GB, CPU at most 55%. A Blender finish of a 37 MB raw mesh: 0.76 GB commit, 0.4 cores, 1.8 s.

The input gate's first version refused EVERY round-4 hero concept the operator had meshed: one median
background read a studio vignette's dark corners as foreground, a fingertip on the frame as an
amputation, and a grey fur near a grey ground as two subjects. Recalibrated on that set
(`INPUT_GATE_VERSION` ...@2026-10-22b): a smooth background field from the border, `subject-cropped`
only past 10% of an edge (`touches-edge` warns below), regions whose boxes overlap or nearly touch are
one subject. 9 of the 10 round-4 concepts now pass or warn; barbarian T1 is still refused - its studio
floor and boot shadow touch the bottom edge (reported as `subject-cropped`; the cause is a ground
plane, which the concept prompts already forbid).

Structural gates passed (warn) a hero a human would reject: the morning keep is the gate, the gates
are its evidence (generated-mesh-acceptance: structural is necessary, never sufficient).
