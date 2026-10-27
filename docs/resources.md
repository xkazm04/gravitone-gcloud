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
| GPU memory | `nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu` (4 s bound; `[N/A]` devices such as the NPU skipped) | no driver |
| GPU busy | `utilization.gpu` from the same call, the busiest device that answered; charged against nothing | no driver, or the device reports `[N/A]` |
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
  ~/ai/tools/blender-5.2.2-windows-arm64/blender.exe -b --python bake.py
GRAVITONE_STORE_PATH=<store> npx tsx pipeline/resources.mts profiles
```

`profile` enqueues a `profile` job on the engine's lane (comfy, ollama and unreal on `gpu.local`,
blender on `box.blender`, ffmpeg on `box.render`) and drives it in the CLI. The job takes a
baseline reading, runs the command with no shell, reads the machine every 500 ms until the
command exits, and records each reading's peak over the baseline in `engine_profiles`. Running
again replaces the profile, and the `engine.profiled` event keeps the figures it replaced. A
command that exits non-zero records nothing. So does a run whose commit charge was never read.

`profile` starts only on a quiet box (`profileReady` in `@gt/domain/resource`). Commit charge and GPU
memory must sit under the low mark, the CPU under its mark, and for comfy ComfyUI's queue must be empty
and answering. Otherwise it exits 1 with the reason. `--wait` reads the box again every 30 s until it
is quiet. Admission alone would not hold it: an engine with no profile starts at any memory level
once it runs alone.

The baseline carries whatever was already running. Profile with a
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

## Profiling ComfyUI

```bash
GRAVITONE_STORE_PATH=<store> npx tsx pipeline/resources.mts profile comfy --wait --label "trellis character 40k" --   node pipeline/mesh/trellis-once.mts <concept.png>
```

`pipeline/mesh/trellis-once.mts` runs one TRELLIS.2 prompt through the mesh producer's own client
(`runTrellis`, `pipeline/mesh/trellis-api.json`). It decimates to the character budget by default
(`--faces`) and opens no store. Use any concept that passes the input gate.
It draws a fresh seed every run, unless `--seed` names one, and prints it. ComfyUI answers a prompt it has
already run from its cache in about 3 s, without sampling, and a profile of that run recorded TRELLIS at
0.44 GB (2026-10-23).

Do not profile `mesh.mts new --live` instead: it deadlocks. The profile job holds gpu.local, and the
mesh job it starts queues behind it on the same lane.

What the figure means:
- **Warm models are not counted.** It is a peak over the baseline, and ComfyUI keeps models resident
  between prompts. A ComfyUI that already holds TRELLIS measures less than a cold one. Admission
  reads the live reading too, so a warm figure is the right charge on a warm box.
- **It covers LTX clips too.** `scout-scene` names `comfy` and is charged the same figure until
  engines split per workflow.

Measured by hand on 2026-10-22 (a background sampler, before this path existed): TRELLIS from cold
took +10.6 GB of GPU memory (peak 12.7 GB) and +11.6 GB of commit charge, with CPU at most 55%.
Through this path on 2026-10-23, the rogue concept at 40k faces on a warm ComfyUI: +7.15 GB of commit
charge, +5.07 GB of GPU memory and 10 cores, over 1373 samples (about 11.5 min). The profile started
only after waiting about 20 min for commit charge to drop under the low mark.


## The always-on worker and the load sampler

A night's detached jobs (scene clips, game assets, stats reels) wait queued until a worker drives
them, and the night's load band (`@gt/domain/load`: CPU, RAM and GPU held in 60-80 percent) is read
from samples only the worker takes. So the worker runs at logon, not when someone remembers.

**Env.** `workers/runner.mts` reads `.env` then `.env.local` from the repo root before anything else
is imported (`lib/envFile.ts` `loadEnvFiles`): comments and blank lines skipped, matching quotes
stripped, `.env.local` over `.env`, and an exported value always wins. It says the names it read on
stderr, never the values.

**The table.** Kernel module `load` (`packages/kernel/src/resources/load.ts`):
`load_samples (seq, at_ms, record)`, one `LoadSample` as JSON per row, indexed on `at_ms`. Rows are
never updated. The one delete is the prune: rows older than 30 days (`RETENTION_MS`) may go, and a
trigger refuses any delete within 30 days of the newest row. `readLoadSamples(r, fromMs, toMs)` reads
a window oldest first through the door.

**The timer.** `load-sample` (`packages/producers/src/publish/timers.ts` `LOAD_SAMPLE`): every 60 s,
deadline 30 s, first at 5 s, held as the lease `timer:load-sample` like the publish timers
(`lib/producers/loadSample.ts`). Each tick takes one uncached probe reading (GPU busy included),
adds RAM used and total and the commit limit, names the jobs admission is holding (queued jobs whose
latest `job.waiting` no `job.claimed` has answered), and appends the row. Once an hour it prunes
rows past the retention. A probe that throws writes no row: the tick fails, the roster records
`timer.fail`, and the worker carries on.

**The install.** `pipeline/worker-service.ps1`:

| switch | does |
| --- | --- |
| `-Print` (default) | shows the task it would register |
| `-Install` | registers the Scheduled Task "Gravitone worker": at logon, the current user, Interactive, no time limit, restarted 3 times 1 min apart |
| `-Uninstall` | removes it |
| `-Run` | what the task runs: `node workers/runner.mts` from the repo root, output appended to `foundry-out/worker/logs/<date>.log` (beside `GRAVITONE_STORE_PATH` when set) |

The operator installs it. A second worker on the same store is safe: each timer is a lease, so it
runs once.

**The doctor line.** `pipeline/scout.mts doctor` reads the store read-only for the worker's pulse,
the newer of the newest load sample and the `timer:load-sample` lease heartbeat:

- `ok   worker   last heartbeat 2 min ago` under 5 minutes;
- `FAIL worker   no worker heartbeat in N min -> start it: powershell -File pipeline/worker-service.ps1 -Run`
  past 5 minutes, or `no worker heartbeat on record`.

It fails a live night and is a note on a dry one.
