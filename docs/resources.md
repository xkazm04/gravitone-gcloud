# Resources: admission by measured load

Lane slots (`packages/domain/src/lane.capacity.ts` `LANE_CAPACITY`) say how many jobs a resource
runs at once. They cannot say whether ComfyUI holding 55 GB and a Blender bake can run side by
side on this box's 64 GB of unified memory. On archemond the answer was measured: with ComfyUI at
55 GB private the box paged, and a clip that takes 423 s took 8741 s. Admission is the second
question a pick is asked, after "is there a slot": can the machine pay what this engine costs,
beside what already runs?

Code: `packages/domain/src/resource.ts` (the rules, pure), `packages/kernel/src/job-queue-core.ts`
`admitPicks` (a look's picks, pure), `packages/kernel/src/resources/` (the profiles table and the
worker's gate), `lib/resources/probe.ts` (the machine probe), `packages/producers/src/profile/` +
`lib/producers/profile.ts` (the profile job), `pipeline/resources.mts` (the CLI).

## The rules

Only a producer that names an `engine` (`comfy`, `ollama`, `blender`, `unreal`, `ffmpeg`) is asked.
A producer that names none (every vendor call, seat turn and render that ran before admission
existed) is never touched.

- **Charge the measured resource.** A job costs its engine's profile: peak commit charge, peak GPU
  memory and CPU cores over the baseline before it started.
- **An engine with no profile runs alone.** It starts only when no other engine job is in flight,
  and nothing engine-bound starts beside it. The profile job itself always runs this way.
- **Memory refuses, with hysteresis.** The projection is the reading or the running set's
  baseline plus its peaks, whichever is larger, plus the job's own peak. Above `memHigh` × total
  (default 0.85) the job waits and the gate goes tight; while tight, a job waits until its
  projection is under `memLow` × total (default 0.75). Commit charge and GPU memory are both
  checked against one flag, since on unified memory they are one pool.
- **Commit charge, not free RAM**, is the memory reading. It is the limit that was crossed
  (~102-116 GB here).
- **CPU defers.** A job with CPU cost waits while the CPU is busier than `cpuHigh` (default 0.90).
  Saturation heals itself, so this is a wait, not a gate state.
- **The shared ComfyUI.** A `comfy` job waits while ComfyUI's `/queue` has anything running or
  pending, whoever queued it. Two executors on one ComfyUI measured 2-3x wall time.
- **Unread is not zero.** A memory reading the probe could not make holds every job that costs
  that memory (`unread`). An unread CPU defers nothing.

A held head stays at the front of its line. The worker says it once per reason on stderr and in the
ledger as `job.waiting` (`resource`, `why`, `engine`), and asks again at every look.

## The probe

`npx tsx pipeline/resources.mts probe [--json]` reads, without opening a store:

| reading | source | absent when |
| --- | --- | --- |
| commit charge, RAM | `Win32_OperatingSystem` via one PowerShell CIM call (8 s bound, cached 2 s) | no PowerShell, timeout |
| GPU memory | `nvidia-smi --query-gpu=memory.used,memory.total` (4 s bound; `[N/A]` devices such as the NPU skipped) | no driver |
| CPU busy | two `os.cpus()` samples 250 ms apart, every core, foreign load included | never on Node |
| ComfyUI queue | `GET $COMFY_URL/queue` (default `http://127.0.0.1:8188`, 1 s) | ComfyUI down |

It never POSTs `/free` and never starts or restarts ComfyUI.

The machine profile takes its totals from the same reading. Each can be overridden:
`MACHINE_COMMIT_LIMIT_GB`, `MACHINE_VRAM_GB`, `MACHINE_CORES`, `MACHINE_MEM_HIGH`,
`MACHINE_MEM_LOW`, `MACHINE_CPU_HIGH`.

The worker (`npm run worker`) admits by this probe. `--no-admission` keeps the slots-only path.

## Profiling an engine

```bash
GRAVITONE_STORE_PATH=<store> npx tsx pipeline/resources.mts profile blender --label "bake chair" -- \
  C:/Users/kazda/ai/tools/blender-5.2.2-windows-arm64/blender.exe -b --python bake.py
GRAVITONE_STORE_PATH=<store> npx tsx pipeline/resources.mts profiles
```

`profile` enqueues a `profile` job on the engine's lane (comfy, ollama and unreal on `gpu.local`,
blender on `box.blender`, ffmpeg on `box.render`) and drives it in the CLI. The job takes a
baseline reading, runs the command with no shell, reads the machine every 500 ms until the
command exits, and records each reading's peak over the baseline in `engine_profiles`. Running
again replaces the profile, and the `engine.profiled` event keeps the figures it replaced. A
command that exits non-zero records nothing. So does a run whose commit charge was never read.

Profile on a quiet box: the baseline carries whatever was already running. Profile with a
representative sample (a TRELLIS prompt the size a night queues), since admission charges every job
of that engine this footprint. For ComfyUI, the command queues a prompt and waits for it. Never
`/free` from it while other work is on the queue.

## Engines in use

| Engine | Producer | Lane | What one job does |
|---|---|---|---|
| comfy | `mesh` | gpu.local | one TRELLIS.2 run per variant through ComfyUI's API (`pipeline/mesh/trellis-api.json`) |
| blender | `finish` | box.blender | about six bounded headless Blender steps per variant (`pipeline/mesh/blender/*.py`) |

`scout-scene` on gpu.local names `comfy` (its LTX clip renders through ComfyUI); `scout-asset`
(cloud.leonardo, the Flare concept stills) names none - a metered cloud call is bounded by the night's
money ceiling, not by this machine.

Profile Blender on a raw mesh:
`npx tsx pipeline/resources.mts profile blender -- <blender.exe> -b --factory-startup --python-exit-code 1 -P pipeline/mesh/blender/finish.py -- <raw.glb> <outdir> sample character`

Profile ComfyUI on one TRELLIS prompt with the lynx-bench runner, which queues one prompt and waits for it:
`npx tsx pipeline/resources.mts profile comfy -- node C:/Users/kazda/ai/lynx-bench/media/run-prompt.mjs <trellis api json> profile`
Only when ComfyUI's queue is otherwise empty - another executor's work would be counted as this engine's.

